import proj4 from "proj4";

/**
 * Grid convergence γ at a point: the angle between grid north (the local
 * projected CRS) and geographic north (WGS 84), measured clockwise from
 * true north, in degrees. Positive → grid north is east of true north.
 *
 * Method: project the point to the target CRS, step 1 m north in grid,
 * inverse-project, and compute the geographic bearing from the original
 * point to the stepped one. Cheap, accurate to well under 0.001° for
 * any reasonable projection.
 *
 * Returns null if proj4 can't parse the proj string or the round-trip
 * fails.
 */
export function computeGridConvergence(
  lon: number,
  lat: number,
  proj4text: string,
): number | null {
  try {
    const fwd = proj4("WGS84", proj4text, [lon, lat]);
    if (!Array.isArray(fwd) || fwd.length < 2) return null;
    const stepped = proj4(proj4text, "WGS84", [fwd[0], fwd[1] + 1]);
    if (!Array.isArray(stepped) || stepped.length < 2) return null;
    const [lon2, lat2] = stepped as [number, number];
    return bearingDegrees(lon, lat, lon2, lat2);
  } catch {
    return null;
  }
}

function bearingDegrees(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  const deg = (θ * 180) / Math.PI;
  return ((deg + 540) % 360) - 180;
}
