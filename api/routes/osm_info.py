"""OSM fclass info — app-wide cache of OSM wiki definitions.

Geofabrik shapefiles store a normalized feature label per row in the ``fclass``
column. This route resolves a (theme, fclass) pair to the corresponding OSM
tag (e.g. ``landuse=farmland``), fetches the wiki definition + representative
image + usage count from taginfo.openstreetmap.org, and persists the result in
the ``osm_fclass_info`` table. First request populates the row; every request
after that is served from the local DB.

The route is public (no auth) — cached data is not project- or user-scoped.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.engine import get_db
from api.db.models import OsmFclassInfo

router = APIRouter(prefix="/osm", tags=["osm"])


# ---------------------------------------------------------------------------
# Theme → OSM tag resolution
# ---------------------------------------------------------------------------

# Geofabrik shapefile layer → primary OSM tag key.
_THEME_OSM_KEY: dict[str, str] = {
    "roads": "highway",
    "railways": "railway",
    "waterways": "waterway",
    "landuse": "landuse",
    "natural": "natural",
    "places": "place",
    "buildings": "building",
    "traffic": "highway",
    "transport": "public_transport",
    "water": "natural",
    "pofw": "religion",
}

# Geofabrik POI shapefiles merge many OSM keys into one layer; probe these.
_POI_CANDIDATE_KEYS = (
    "amenity",
    "shop",
    "tourism",
    "leisure",
    "historic",
    "office",
    "sport",
    "man_made",
    "craft",
)

_POI_THEMES = frozenset({"pois"})


def _normalize_theme(raw: str) -> str:
    """Strip ``gis_osm_…_free_1`` / ``_a`` wrappers off a Geofabrik layer name."""
    t = raw.strip().lower()
    if t.startswith("gis_osm_"):
        t = t[len("gis_osm_"):]
    # drop trailing _free_1 / _free_2 etc.
    if "_free" in t:
        t = t.rsplit("_free", 1)[0]
    # drop trailing _a (area-variant)
    if t.endswith("_a"):
        t = t[:-2]
    return t


def _candidate_tags(theme: str, fclass: str) -> list[tuple[str, str]]:
    if theme in _THEME_OSM_KEY:
        return [(_THEME_OSM_KEY[theme], fclass)]
    if theme in _POI_THEMES:
        return [(k, fclass) for k in _POI_CANDIDATE_KEYS]
    return [(theme, fclass)]


# ---------------------------------------------------------------------------
# Taginfo fetch
# ---------------------------------------------------------------------------

_TAGINFO_BASE = "https://taginfo.openstreetmap.org/api/4"
_MEDIAWIKI_API = "https://wiki.openstreetmap.org/w/api.php"
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=4.0)


async def _fetch_wiki_page(
    client: httpx.AsyncClient, key: str, value: str
) -> Optional[dict]:
    """Query taginfo for the best English wiki page entry for a tag."""
    url = f"{_TAGINFO_BASE}/tag/wiki_pages?key={quote(key)}&value={quote(value)}"
    try:
        res = await client.get(url)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None
    data = res.json().get("data") or []
    with_content = [p for p in data if p.get("lang") == "en" and (p.get("description") or p.get("image"))]
    if with_content:
        return with_content[0]
    en = [p for p in data if p.get("lang") == "en"]
    if en:
        return en[0]
    return data[0] if data else None


# Heuristic filter — many OSM wiki pages embed small UI chrome icons
# (info/question marks, rendering keys, flags). Skip these when picking a
# representative image for the card.
_ICON_FILENAME_RE = re.compile(
    r"^(osm[_-]element|key[_-]|tagkey|namespace|icon|flag[-_]|disambig|"
    r"commons-logo|information|question|broom|symbol_|edit\b|yes\.|no\.|"
    r"stop\b|checkmark|under[_-]?construction|lang[_-]|gnd)",
    re.IGNORECASE,
)


def _looks_like_icon(filename: str) -> bool:
    f = filename.strip().lower()
    if not f:
        return True
    if _ICON_FILENAME_RE.match(f):
        return True
    # Small wiki chrome — tiny flag/logo SVGs.
    if f.endswith(".svg") and any(
        kw in f for kw in ("logo", "flag", "icon", "symbol", "ribbon")
    ):
        return True
    return False


async def _fetch_mediawiki_page(
    client: httpx.AsyncClient, key: str, value: str
) -> tuple[Optional[str], Optional[str]]:
    """Return (description, image_url) from the OSM wiki MediaWiki API.

    Fallback path for taginfo — the wiki may have a Tag:key=value page even
    when taginfo's snapshot hasn't picked it up. Primary image source is
    ``prop=pageimages`` (PageImages extension); when that extension misses
    the infobox image, we fall back to ``action=parse&prop=images`` to list
    all files on the page and resolve the first non-icon's thumbnail URL.
    """
    title = f"Tag:{key}={value}"
    query_url = (
        f"{_MEDIAWIKI_API}?action=query&format=json&redirects=1"
        "&prop=extracts|pageimages"
        "&exintro=1&explaintext=1&exchars=600"
        "&piprop=thumbnail&pithumbsize=640"
        f"&titles={quote(title)}"
    )
    description: Optional[str] = None
    image_url: Optional[str] = None
    try:
        res = await client.get(query_url)
        if res.status_code == 200:
            data = res.json()
            pages = (data.get("query") or {}).get("pages") or {}
            for _, page in pages.items():
                if page.get("missing") is not None:
                    continue
                description = (page.get("extract") or "").strip() or description
                thumb = (page.get("thumbnail") or {}).get("source")
                if thumb:
                    image_url = thumb
                break
    except (httpx.HTTPError, ValueError):
        pass

    if image_url is None:
        image_url = await _fetch_page_infobox_image(client, title)

    return description, image_url


async def _fetch_page_infobox_image(
    client: httpx.AsyncClient, title: str
) -> Optional[str]:
    """List images embedded on the page and resolve the first non-icon."""
    parse_url = (
        f"{_MEDIAWIKI_API}?action=parse&format=json&redirects=1"
        "&prop=images"
        f"&page={quote(title)}"
    )
    try:
        res = await client.get(parse_url)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None
    try:
        data = res.json()
    except ValueError:
        return None
    images = (data.get("parse") or {}).get("images") or []
    for filename in images:
        if _looks_like_icon(filename):
            continue
        url = await _resolve_file_thumbnail(client, filename)
        if url:
            return url
    return None


async def _resolve_file_thumbnail(
    client: httpx.AsyncClient, filename: str
) -> Optional[str]:
    """Resolve a wiki File: page to a 640-wide thumbnail URL."""
    info_url = (
        f"{_MEDIAWIKI_API}?action=query&format=json"
        "&prop=imageinfo&iiprop=url|mime&iiurlwidth=640"
        f"&titles=File:{quote(filename)}"
    )
    try:
        res = await client.get(info_url)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None
    try:
        data = res.json()
    except ValueError:
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    for _, page in pages.items():
        infos = page.get("imageinfo") or []
        if not infos:
            continue
        info = infos[0]
        # Prefer mime-checked raster/vector images; skip SVG icons that
        # sneak past the filename heuristic.
        mime = (info.get("mime") or "").lower()
        if mime.startswith("image/") and "svg" in mime:
            continue
        return info.get("thumburl") or info.get("url")
    return None


async def _fetch_usage_count(
    client: httpx.AsyncClient, key: str, value: str
) -> Optional[int]:
    url = f"{_TAGINFO_BASE}/tag/stats?key={quote(key)}&value={quote(value)}"
    try:
        res = await client.get(url)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None
    for row in res.json().get("data") or []:
        if row.get("type") == "all":
            try:
                return int(row.get("count"))
            except (TypeError, ValueError):
                return None
    return None


def _taginfo_image_url(page: dict) -> Optional[str]:
    img = page.get("image") or {}
    prefix = img.get("thumb_url_prefix")
    suffix = img.get("thumb_url_suffix")
    if prefix and suffix:
        return f"{prefix}320{suffix}"
    return img.get("image_url")


def _wiki_url(key: str, value: str) -> str:
    return f"https://wiki.openstreetmap.org/wiki/Tag:{quote(key)}%3D{quote(value)}"


async def _resolve_from_taginfo(theme: str, fclass: str) -> dict:
    """Resolve a (theme, fclass) pair to OSM wiki content.

    Strategy: iterate the candidate OSM tag keys. For each, try taginfo's
    wiki index first (it also gives applies-to flags) and the MediaWiki API
    as a fallback (more current than taginfo's snapshot). Pick the first
    candidate that yields either a description or an image. Always returns
    a dict so we can cache negative results.
    """
    candidates = _candidate_tags(theme, fclass)
    if not candidates:
        candidates = [(theme, fclass)]

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        chosen_key, chosen_value = candidates[0]
        chosen_page: Optional[dict] = None
        chosen_mw_description: Optional[str] = None
        chosen_mw_image: Optional[str] = None

        for key, value in candidates:
            page = await _fetch_wiki_page(client, key, value)
            mw_description, mw_image = await _fetch_mediawiki_page(client, key, value)
            taginfo_has_content = bool(
                page and (page.get("description") or page.get("image"))
            )
            if taginfo_has_content or mw_description or mw_image:
                chosen_key, chosen_value = key, value
                chosen_page = page
                chosen_mw_description = mw_description
                chosen_mw_image = mw_image
                break
            # Keep first page found (even if empty) so applies-to flags are
            # populated even when content is missing.
            if page is not None and chosen_page is None:
                chosen_page = page

        usage_count = await _fetch_usage_count(client, chosen_key, chosen_value)

    page = chosen_page or {}
    description = (page.get("description") or "").strip() or None
    if not description:
        description = chosen_mw_description
    image_url = _taginfo_image_url(page) or chosen_mw_image

    return {
        "osm_key": chosen_key,
        "osm_value": chosen_value,
        "description": description,
        "wiki_url": _wiki_url(chosen_key, chosen_value),
        "image_url": image_url,
        "usage_count": usage_count,
        "on_node": bool(page.get("on_node")),
        "on_way": bool(page.get("on_way")),
        "on_area": bool(page.get("on_area")),
        "on_relation": bool(page.get("on_relation")),
    }


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class FclassInfoResponse(BaseModel):
    theme: str
    fclass: str
    osm_key: str
    osm_value: str
    description: Optional[str] = None
    wiki_url: str
    image_url: Optional[str] = None
    usage_count: Optional[int] = None
    on_node: bool = False
    on_way: bool = False
    on_area: bool = False
    on_relation: bool = False
    fetched_at: datetime
    cached: bool = Field(
        description="True if served from DB; False if just fetched from taginfo.",
    )

    model_config = {"from_attributes": True}


def _row_to_response(row: OsmFclassInfo, *, cached: bool) -> FclassInfoResponse:
    return FclassInfoResponse(
        theme=row.theme,
        fclass=row.fclass,
        osm_key=row.osm_key,
        osm_value=row.osm_value,
        description=row.description,
        wiki_url=row.wiki_url,
        image_url=row.image_url,
        usage_count=row.usage_count,
        on_node=row.on_node,
        on_way=row.on_way,
        on_area=row.on_area,
        on_relation=row.on_relation,
        fetched_at=row.fetched_at,
        cached=cached,
    )


# ---------------------------------------------------------------------------
# Per-key locks so concurrent first-hits don't double-fetch taginfo.
# ---------------------------------------------------------------------------

_locks: dict[tuple[str, str], asyncio.Lock] = {}


def _lock_for(theme: str, fclass: str) -> asyncio.Lock:
    key = (theme, fclass)
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


# Tracks partial rows we've already re-fetched in this server process.
# Prevents burning API calls on tags that truly have no image/description
# while still letting every (theme, fclass) pair benefit from improvements
# to the resolver (a deploy / restart gives each row one fresh attempt).
_retry_attempted: set[tuple[str, str]] = set()


def _is_complete(row: OsmFclassInfo) -> bool:
    return bool(row.description) and bool(row.image_url)


def _should_reresolve(row: OsmFclassInfo) -> bool:
    """Re-fetch a cached row if it's incomplete and we haven't retried yet."""
    if _is_complete(row):
        return False
    return (row.theme, row.fclass) not in _retry_attempted


async def _load_or_fetch(
    db: AsyncSession, theme: str, fclass: str
) -> FclassInfoResponse:
    if not fclass:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="fclass is required",
        )

    theme_norm = _normalize_theme(theme) if theme else ""
    fclass_norm = fclass.strip().lower()
    if not theme_norm:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="theme is required",
        )

    existing = await db.get(OsmFclassInfo, (theme_norm, fclass_norm))
    if existing is not None and not _should_reresolve(existing):
        return _row_to_response(existing, cached=True)

    # Serialize concurrent first-hits for the same key so we only resolve once.
    async with _lock_for(theme_norm, fclass_norm):
        existing = await db.get(OsmFclassInfo, (theme_norm, fclass_norm))
        if existing is not None and not _should_reresolve(existing):
            return _row_to_response(existing, cached=True)

        resolved = await _resolve_from_taginfo(theme_norm, fclass_norm)
        _retry_attempted.add((theme_norm, fclass_norm))

        if existing is not None:
            # Merge: upgrade fields the retry could fill in, don't clobber
            # values we already had with None (taginfo / MediaWiki may be
            # flaky and return less the second time).
            for field, value in resolved.items():
                if value is None and getattr(existing, field) is not None:
                    continue
                setattr(existing, field, value)
            existing.fetched_at = datetime.now(timezone.utc)
            row = existing
        else:
            row = OsmFclassInfo(
                theme=theme_norm,
                fclass=fclass_norm,
                fetched_at=datetime.now(timezone.utc),
                **resolved,
            )
            db.add(row)

        try:
            await db.commit()
        except Exception:
            await db.rollback()
            # Another request may have inserted the row between our check
            # and commit — reload and return it.
            existing = await db.get(OsmFclassInfo, (theme_norm, fclass_norm))
            if existing is not None:
                return _row_to_response(existing, cached=True)
            raise
        await db.refresh(row)
        return _row_to_response(row, cached=False)


@router.get("/fclass-info", response_model=FclassInfoResponse)
async def get_fclass_info(
    theme: str,
    fclass: str,
    db: AsyncSession = Depends(get_db),
) -> FclassInfoResponse:
    """Resolve and cache OSM wiki info for (theme, fclass)."""
    return await _load_or_fetch(db, theme, fclass)


class FclassInfoListResponse(BaseModel):
    items: list[FclassInfoResponse]


@router.get("/fclass-info/all", response_model=FclassInfoListResponse)
async def list_fclass_info(
    db: AsyncSession = Depends(get_db),
) -> FclassInfoListResponse:
    """Return every cached (theme, fclass) entry, ordered by theme then fclass."""
    from sqlalchemy import asc

    result = await db.execute(
        select(OsmFclassInfo).order_by(asc(OsmFclassInfo.theme), asc(OsmFclassInfo.fclass))
    )
    rows = result.scalars().all()
    return FclassInfoListResponse(
        items=[_row_to_response(r, cached=True) for r in rows],
    )


class BatchRequest(BaseModel):
    items: list[dict]  # [{"theme": "...", "fclass": "..."}, ...]


class BatchResponse(BaseModel):
    items: list[FclassInfoResponse]


@router.post("/fclass-info/batch", response_model=BatchResponse)
async def batch_fclass_info(
    payload: BatchRequest,
    db: AsyncSession = Depends(get_db),
) -> BatchResponse:
    """Bulk resolve — used to prefetch all fclass values after clipping."""
    if len(payload.items) > 500:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="batch size exceeds 500",
        )
    out: list[FclassInfoResponse] = []
    for entry in payload.items:
        theme = str(entry.get("theme") or "")
        fclass = str(entry.get("fclass") or "")
        if not theme or not fclass:
            continue
        out.append(await _load_or_fetch(db, theme, fclass))
    return BatchResponse(items=out)
