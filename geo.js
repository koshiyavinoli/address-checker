/**
 * Geospatial helpers.
 * ---------------------------------------------------------------------------
 * Pure domain logic, deliberately kept free of DOM and network concerns so the
 * accuracy-critical parts (point-in-polygon, distance) are easy to read and
 * test. Relies on the global `turf` (loaded via <script> in index.html).
 * Geocoding lives in api.js (it goes through the backend).
 */

/**
 * Turn a list of [lat, lon] vertices into a closed GeoJSON polygon.
 * GeoJSON uses [lon, lat] order and requires the ring's first and last
 * points to be identical, so we convert and close it here.
 */
export function toPolygon(latLngs) {
  const ring = latLngs.map(([lat, lon]) => [lon, lat]);
  ring.push(ring[0]); // close the ring
  return turf.polygon([ring]);
}

/** Geographic centre of a polygon, returned as [lat, lon] for Leaflet. */
export function centerLatLon(polygon) {
  const [lon, lat] = turf.centroid(polygon).geometry.coordinates;
  return [lat, lon];
}

/**
 * Strict point-in-polygon test. `ignoreBoundary: true` means a point that
 * lands exactly on an edge is treated as OUTSIDE — i.e. "strictly within".
 */
export function isStrictlyInside(lat, lon, polygon) {
  const pt = turf.point([lon, lat]);
  return turf.booleanPointInPolygon(pt, polygon, { ignoreBoundary: true });
}

/** Shortest distance (km) from a point to the polygon's boundary. */
export function distanceToBoundaryKm(lat, lon, polygon) {
  const pt = turf.point([lon, lat]);
  const boundary = turf.polygonToLine(polygon); // Feature<LineString|MultiLineString>
  const lines =
    boundary.geometry.type === "MultiLineString"
      ? boundary.geometry.coordinates.map((c) => turf.lineString(c))
      : [boundary];
  return Math.min(
    ...lines.map((line) => turf.pointToLineDistance(pt, line, { units: "kilometers" }))
  );
}

/** Human-friendly distance string, e.g. "480 m" or "1.2 km". */
export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
