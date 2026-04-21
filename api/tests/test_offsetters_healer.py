"""Unit tests for _rebuild_typed_offsetters.

Directly exercises the pure-function healer against a hand-encoded
ProjectConfig. The HTTP path wraps it in _heal_typed_offsetters + save,
which is covered implicitly by the pipeline integration tests.
"""

from __future__ import annotations

from typing import Any

from dojo.v3.domain.config import GridOption, ProjectConfig

from api.routes.project_sections import _rebuild_typed_offsetters


# ---------------------------------------------------------------------------
# Helpers — build a minimal cfg that mirrors the gassum3d fixture shape
# ---------------------------------------------------------------------------

def _gassum_layers_ui() -> dict[str, Any]:
    layers = [
        (1, "motorways"), (2, "open_roads"), (3, "residential_roads"),
        (4, "tracks"), (5, "paths"), (9, "minivib_paths"),
        (10, "open_lands"), (11, "forest"), (14, "nodes_nogo_lands"),
        (15, "vineyards"), (16, "swamp"), (20, "airport"),
        (30, "nogo_SP_buildings_7m"), (40, "nogo_water_all"),
        (41, "lake"), (42, "swamp_ok"), (50, "railway"),
    ]
    return {"layers": [{"code": c, "name": n} for c, n in layers]}


def _gassum_partitioning() -> dict[str, Any]:
    return {
        "groups": [
            {
                "name": "Design",
                "regionTag": "design_reg",
                "polygons": ["outer", "middle", "inner"],
            }
        ],
    }


def _gassum_design() -> dict[str, Any]:
    return {
        "groups": [
            {"name": "Outer", "rpi": "40", "rli": "360", "spi": "40", "sli": "360"},
            {"name": "Middle", "rpi": "40", "rli": "280", "spi": "40", "sli": "280"},
            {"name": "Inner", "rpi": "40", "rli": "160", "spi": "40", "sli": "160"},
        ],
    }


def _gassum_design_options() -> dict[str, Any]:
    return {
        "options": [
            {
                "id": "do1",
                "name": "Design Option 1",
                "partitioning": "Design",
                "rows": [
                    {"design": "Outer", "region": "outer"},
                    {"design": "Middle", "region": "middle"},
                    {"design": "Inner", "region": "inner"},
                ],
            }
        ],
        "activeId": "do1",
    }


def _sources_side_outer_like() -> dict[str, Any]:
    """A "sources" side that mimics the gassum3d outer layer rules + rules.

    Switches:
      - open_roads / residential_roads / tracks / minivib_paths / lake
        → offset=F, skip=F (zones_ok pool)
      - open_lands / swamp / swamp_ok / forest → offset=T, skip=F (keep)
      - nodes_nogo_lands / vineyards / airport / nogo_SP_buildings_7m /
        nogo_water_all / railway / paths / motorways → offset=T, skip=T
    """
    layer_rules = [
        {"layer": "open_lands", "offset": True, "skip": False},
        {"layer": "swamp", "offset": True, "skip": False},
        {"layer": "swamp_ok", "offset": True, "skip": False},
        {"layer": "forest", "offset": True, "skip": False},
        {"layer": "nodes_nogo_lands", "offset": True, "skip": True},
        {"layer": "vineyards", "offset": True, "skip": True},
        {"layer": "airport", "offset": True, "skip": True},
        {"layer": "nogo_SP_buildings_7m", "offset": True, "skip": True},
        {"layer": "nogo_water_all", "offset": True, "skip": True},
        {"layer": "lake", "offset": False, "skip": False},
        {"layer": "railway", "offset": True, "skip": True},
        {"layer": "paths", "offset": True, "skip": True},
        {"layer": "minivib_paths", "offset": False, "skip": False},
        {"layer": "tracks", "offset": False, "skip": False},
        {"layer": "residential_roads", "offset": False, "skip": False},
        {"layer": "open_roads", "offset": False, "skip": False},
        {"layer": "motorways", "offset": True, "skip": True},
    ]
    params = [
        {
            "region": "outer",
            "offsetRules": [
                {"ruleType": "Max crossline", "value": "180"},
                {"ruleType": "Shifted inline", "value": "180", "valueAt": "40"},
                {"ruleType": "Max radius", "value": "255"},
            ],
            "targetPriority": [
                {"kind": "layer", "layer": "open_roads"},
                {"kind": "layer", "layer": "residential_roads"},
                {"kind": "layer", "layer": "tracks"},
                {"kind": "layer", "layer": "minivib_paths"},
                {"kind": "sep"},
                {"kind": "layer", "layer": "lake"},
            ],
        },
        {
            "region": "middle",
            "offsetRules": [
                {"ruleType": "Max crossline", "value": "140"},
                {"ruleType": "Max radius", "value": "198"},
            ],
            "targetPriority": [],
        },
        {
            "region": "inner",
            "offsetRules": [
                {"ruleType": "Max crossline", "value": "80"},
            ],
            "targetPriority": [],
        },
    ]
    return {
        "map": "s_offsetter",
        "partitioning": "Design",
        "snapperMaxDist": "10",
        "layerRules": layer_rules,
        "params": params,
    }


def _build_cfg(ui: dict[str, Any]) -> ProjectConfig:
    cfg = ProjectConfig(
        layers_ui=_gassum_layers_ui(),
        partitioning=_gassum_partitioning(),
        design=_gassum_design(),
        design_options=_gassum_design_options(),
        offsetters_ui=ui,
        grid={"Design Option 1": GridOption()},
    )
    return cfg


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_happy_path_sources_outer_offsetter() -> None:
    ui = {
        "configs": [
            {
                "id": "c1",
                "name": "offsetter_o1",
                "designOption": "Design Option 1",
                "sources": _sources_side_outer_like(),
                "receivers": _sources_side_outer_like(),
            }
        ],
        "activeId": "c1",
    }
    cfg = _build_cfg(ui)
    changed = _rebuild_typed_offsetters(cfg, ui)
    assert changed is True

    opt = cfg.offsetters["offsetter_o1"]
    assert opt.s is not None
    assert opt.r is not None
    assert opt.s.mapper == "s_offsetter"
    assert opt.s.snapper_max_dist == 10

    # zones_ok: layers with offset=False + skip=False
    # = {lake=41, minivib_paths=9, tracks=4, residential_roads=3, open_roads=2}
    assert opt.s.zones_ok_filter["zone_theo"] == [2, 3, 4, 9, 41]

    # zones_keep: offset=True + skip=False
    # = {open_lands=10, swamp=16, swamp_ok=42, forest=11}
    assert opt.s.zones_keep_filter["zone_theo"] == [10, 11, 16, 42]

    # three params, one per polygon; design_reg matches 0-based grid key
    regions_out = [p.offset_from["design_reg"] for p in opt.s.parameters]
    assert regions_out == [0, 1, 2]
    design_idxs = [p.design_idx for p in opt.s.parameters]
    assert design_idxs == [0, 1, 2]

    # outer: bin_grid = min(40,40,360,360)/2 = 20.
    # Sources: crossline = j_range, inline-at = i_range_at.
    # Max crossline 180 → j_range, 180/20 = 9
    # Shifted inline 180 @ 40 → i_range_at (9, 2)
    # Max radius 255 → radius, round(255/20) = 13
    assert opt.s.parameters[0].rules == [
        (0, "j_range", 9),
        (1, "i_range_at", (9, 2)),
        (2, "radius", 13),
    ]

    # offset_to: group 1 = (2,3,4,9), group 2 = (41,)
    assert opt.s.parameters[0].offset_to == [(2, 3, 4, 9), (41,)]

    # middle: bin_grid = min(40,40,280,280)/2 = 20
    assert opt.s.parameters[1].rules == [
        (0, "j_range", 7),   # 140 / 20
        (1, "radius", 10),   # 198 / 20 → 9.9 → 10
    ]

    # inner
    assert opt.s.parameters[2].rules == [(0, "j_range", 4)]

    # Receivers use the opposite axis pair: crossline = i_range,
    # inline-at = j_range_at. The happy-path side data is re-used for both
    # sides in this test, so r.parameters mirror the s values but with
    # swapped axis names.
    assert opt.r.parameters[0].rules == [
        (0, "i_range", 9),
        (1, "j_range_at", (9, 2)),
        (2, "radius", 13),
    ]

    # active offsetter picked up the lone config
    assert cfg.active_options.offsetter == "offsetter_o1"


def test_shifted_inline_without_value_at_uses_inline_axis() -> None:
    side = _sources_side_outer_like()
    side["params"] = [
        {
            "region": "outer",
            "offsetRules": [
                {"ruleType": "Shifted inline", "value": "180"},
            ],
            "targetPriority": [],
        },
    ]
    ui = {
        "configs": [
            {
                "id": "c1",
                "name": "offsetter_o1",
                "designOption": "Design Option 1",
                "sources": side,
                "receivers": side,
            }
        ],
        "activeId": "c1",
    }
    cfg = _build_cfg(ui)
    _rebuild_typed_offsetters(cfg, ui)
    opt = cfg.offsetters["offsetter_o1"]
    # Sources inline = i axis, receivers inline = j axis.
    assert opt.s.parameters[0].rules == [(0, "i_range", 9)]
    assert opt.r.parameters[0].rules == [(0, "j_range", 9)]


def test_unknown_layer_silently_dropped() -> None:
    side = _sources_side_outer_like()
    # Insert a stale layer name — should vanish from every output set.
    side["layerRules"].insert(
        0, {"layer": "GHOST_LAYER", "offset": True, "skip": False},
    )
    side["params"] = [
        {
            "region": "outer",
            "offsetRules": [{"ruleType": "Max crossline", "value": "180"}],
            "targetPriority": [
                {"kind": "layer", "layer": "GHOST_LAYER"},
                {"kind": "layer", "layer": "open_roads"},
            ],
        },
    ]
    ui = {
        "configs": [
            {
                "id": "c1",
                "name": "o",
                "designOption": "Design Option 1",
                "sources": side,
                "receivers": side,
            }
        ],
        "activeId": "c1",
    }
    cfg = _build_cfg(ui)
    _rebuild_typed_offsetters(cfg, ui)
    opt = cfg.offsetters["o"]
    # Ghost layer doesn't appear in any zone list or priority group
    for zone_list in (
        opt.s.zones_ok_filter["zone_theo"],
        opt.s.zones_keep_filter["zone_theo"],
        opt.s.parameters[0].offset_from["zone_theo"],
    ):
        assert "GHOST_LAYER" not in zone_list
    assert opt.s.parameters[0].offset_to == [(2,)]  # only open_roads


def test_missing_partitioning_returns_none_side() -> None:
    side = _sources_side_outer_like()
    side["partitioning"] = "DoesNotExist"
    ui = {
        "configs": [
            {
                "id": "c1",
                "name": "o",
                "designOption": "Design Option 1",
                "sources": side,
                "receivers": _sources_side_outer_like(),
            }
        ],
        "activeId": "c1",
    }
    cfg = _build_cfg(ui)
    _rebuild_typed_offsetters(cfg, ui)
    opt = cfg.offsetters["o"]
    assert opt.s is None  # dropped because partitioning missing
    assert opt.r is not None  # other side unaffected


def test_empty_configs_no_op() -> None:
    cfg = _build_cfg({})
    changed = _rebuild_typed_offsetters(cfg, {"configs": []})
    assert changed is False
    assert dict(cfg.offsetters) == {}


def test_idempotent_second_run_changes_nothing() -> None:
    ui = {
        "configs": [
            {
                "id": "c1",
                "name": "o",
                "designOption": "Design Option 1",
                "sources": _sources_side_outer_like(),
                "receivers": _sources_side_outer_like(),
            }
        ],
        "activeId": "c1",
    }
    cfg = _build_cfg(ui)
    first = _rebuild_typed_offsetters(cfg, ui)
    second = _rebuild_typed_offsetters(cfg, ui)
    assert first is True
    assert second is False


def test_active_grid_synced_to_design_option() -> None:
    ui = {
        "configs": [
            {
                "id": "c1",
                "name": "o",
                "designOption": "Design Option 1",
                "sources": _sources_side_outer_like(),
                "receivers": _sources_side_outer_like(),
            }
        ],
        "activeId": "c1",
    }
    cfg = _build_cfg(ui)
    # Simulate drift: active grid pointing to something else.
    cfg.grid["Other"] = GridOption()
    cfg.active_options.grid = "Other"
    _rebuild_typed_offsetters(cfg, ui)
    assert cfg.active_options.grid == "Design Option 1"
    assert cfg.active_options.offsetter == "o"
