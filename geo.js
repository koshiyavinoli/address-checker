/**
 * Geospatial + geocoding helpers.
 * ---------------------------------------------------------------------------
 * Pure-ish domain logic, deliberately kept free of DOM concerns so the
 * accuracy-critical parts (point-in-polygon, distance) are easy to read and
 * test. Relies on the global `turf` (loaded via <script> in index.html).
 */

const NOMINATIM = "https://nominatim.openstreetmap.org";

// Preferred language for returned place names, from the viewer's browser
// (falls back to English). Sent to Nominatim as `accept-language` so an English
// browser sees "Chiyoda / Japan" rather than "千代田区 / 日本".
const ACCEPT_LANGUAGE = (() => {
  const langs =
    typeof navigator !== "undefined" && navigator.languages?.length
      ? [...navigator.languages]
      : [(typeof navigator !== "undefined" && navigator.language) || "en"];
  if (!langs.some((l) => l.toLowerCase().startsWith("en"))) langs.push("en");
  return langs.join(",");
})();

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

/**
 * Forward geocode: address text -> coordinates.
 * Returns { lat, lon, label } or null if nothing matched.
 */
export async function geocodeAddress(query, countryCode = "") {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);
  if (countryCode) url.searchParams.set("countrycodes", countryCode);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Geocoding service returned ${res.status}`);

  const data = await res.json();
  if (!data.length) return null;

  const hit = data[0];
  return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name };
}

/**
 * Reverse geocode: coordinates -> place description.
 * Used once on load to name the coverage area from its centre.
 * Returns { name, region, countryCode } (any field may be "").
 */
export async function reverseGeocode(lat, lon, zoom = 12) {
  const url = new URL(`${NOMINATIM}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", ACCEPT_LANGUAGE);

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Reverse geocoding returned ${res.status}`);

  const a = (await res.json()).address || {};
  const name =
    a.suburb || a.neighbourhood || a.quarter || a.city_district ||
    a.town || a.village || a.city || a.municipality || a.county || "";
  const region = a.country || a.state || a.region || "";
  const countryCode = (a.country_code || "").toLowerCase();
  return { name, region, countryCode };
}
