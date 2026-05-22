/**
 * GPX Parser Utility
 *
 * Haversine formula:
 *   Computes the great-circle distance between two points on a sphere from their
 *   lat/lon coordinates. Given points (φ1,λ1) and (φ2,λ2) in radians:
 *     a = sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2)
 *     c = 2·atan2(√a, √(1−a))
 *     d = R·c          (R = 6371 km, Earth's mean radius)
 *   This gives the shortest surface path and is accurate to within ~0.3% for
 *   the distances typical of running and cycling routes.
 *
 * Elevation smoothing (rolling median, window = 5):
 *   Consumer GPS receivers report elevation with ±1–3 m of noise even when
 *   stationary. A rolling median over 5 consecutive points suppresses outliers
 *   better than a mean while preserving genuine climbs. After smoothing, a
 *   small 0.5 m threshold is applied to avoid accumulating rounding artefacts.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse a GPX XML string and return route statistics.
 *
 * @param {string} fileText - Raw GPX file content.
 * @returns {{
 *   distance_km: number,
 *   elevation_gain_m: number,
 *   elevation_loss_m: number,
 *   avg_grade_pct: number,
 *   point_count: number,
 * }}
 */
export function parseGPX(fileText) {
  // Use globalThis so the module is testable in Node (window === globalThis in browsers)
  const parser = new (globalThis.DOMParser ?? window.DOMParser)();
  const doc = parser.parseFromString(fileText, 'application/xml');

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'));

  let distance_km = 0;
  let elevation_gain_m = 0;
  let elevation_loss_m = 0;

  // Pass 1: accumulate distance
  for (let i = 1; i < trkpts.length; i++) {
    const prev = trkpts[i - 1];
    const curr = trkpts[i];
    const lat1 = parseFloat(prev.getAttribute('lat'));
    const lon1 = parseFloat(prev.getAttribute('lon'));
    const lat2 = parseFloat(curr.getAttribute('lat'));
    const lon2 = parseFloat(curr.getAttribute('lon'));
    distance_km += haversineKm(lat1, lon1, lat2, lon2);
  }

  // Pass 2: smooth elevations with rolling median (window=5), then accumulate gain/loss
  const elevations = trkpts.map(pt => {
    const ele = pt.getElementsByTagName('ele')[0];
    return ele ? parseFloat(ele.textContent) : null;
  });

  const WINDOW = 5;
  const half = Math.floor(WINDOW / 2);
  const smoothed = elevations.map((val, i) => {
    if (val === null) return null;
    const slice = [];
    for (let j = Math.max(0, i - half); j <= Math.min(elevations.length - 1, i + half); j++) {
      if (elevations[j] !== null) slice.push(elevations[j]);
    }
    slice.sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  });

  const ELEVATION_NOISE_THRESHOLD_M = 0.5;
  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i] === null || smoothed[i - 1] === null) continue;
    const delta = smoothed[i] - smoothed[i - 1];
    if (Math.abs(delta) > ELEVATION_NOISE_THRESHOLD_M) {
      if (delta > 0) {
        elevation_gain_m += delta;
      } else {
        elevation_loss_m += Math.abs(delta);
      }
    }
  }

  const avg_grade_pct =
    distance_km > 0
      ? Math.round((elevation_gain_m / (distance_km * 1000)) * 100 * 10) / 10
      : 0;

  return {
    distance_km: Math.round(distance_km * 100) / 100,
    elevation_gain_m: Math.round(elevation_gain_m),
    elevation_loss_m: Math.round(elevation_loss_m),
    avg_grade_pct,
    point_count: trkpts.length,
  };
}

/**
 * Estimate the difficulty impact of elevation on a route.
 *
 * @param {number} elevation_gain_m - Total positive ascent in metres.
 * @param {number} distance_km - Total route distance in km.
 * @returns {{ label: string, modifier: number }}
 */
export function estimateElevationImpact(elevation_gain_m, distance_km) {
  const avg_grade_pct =
    distance_km > 0
      ? (elevation_gain_m / (distance_km * 1000)) * 100
      : 0;

  if (avg_grade_pct < 1)  return { label: 'Flat',          modifier: 1.00 };
  if (avg_grade_pct < 3)  return { label: 'Rolling hills', modifier: 1.05 };
  if (avg_grade_pct < 6)  return { label: 'Hilly',         modifier: 1.10 };
  if (avg_grade_pct < 10) return { label: 'Very hilly',    modifier: 1.15 };
  return                         { label: 'Mountain',      modifier: 1.22 };
}
