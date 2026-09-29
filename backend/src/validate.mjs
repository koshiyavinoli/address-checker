/**
 * Request validation + normalisation.
 * ---------------------------------------------------------------------------
 * Everything that reaches a geocoder goes through here first, so the Lambda
 * never forwards junk upstream and cache keys are stable.
 */

export class ValidationError extends Error {}

export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 200;

// Letters (incl. macrons: ā ē ī ō ū), combining marks, digits, and the
// punctuation that appears in NZ addresses: "Flat 2, 15-17 St John's Rd (Rear)".
const ALLOWED_CHARS = /^[\p{L}\p{M}\p{N} ,.'’/#&()-]+$/u;
const HAS_LETTER = /\p{L}/u;

// Generous bounding box for New Zealand, incl. Stewart Island, the Chathams
// (east of the antimeridian) and the Kermadecs.
function isInNewZealand(lat, lon) {
  const latOk = lat >= -53 && lat <= -29;
  const lonOk = (lon >= 165 && lon <= 180) || (lon >= -180 && lon <= -175);
  return latOk && lonOk;
}

/** Validate a free-text address query. Returns { text, key }. */
export function parseAddressQuery(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ValidationError("Please enter an address.");
  }
  if (raw.length > MAX_QUERY_LENGTH * 2) {
    throw new ValidationError(`Address must be at most ${MAX_QUERY_LENGTH} characters.`);
  }

  const text = raw.normalize("NFC").replace(/\s+/g, " ").trim();

  if (text.length < MIN_QUERY_LENGTH) {
    throw new ValidationError(`Address must be at least ${MIN_QUERY_LENGTH} characters.`);
  }
  if (text.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Address must be at most ${MAX_QUERY_LENGTH} characters.`);
  }
  if (!HAS_LETTER.test(text)) {
    throw new ValidationError("Address must include a street or place name.");
  }
  if (!ALLOWED_CHARS.test(text)) {
    throw new ValidationError("Address contains unsupported characters.");
  }

  return { text, key: text.toLowerCase() };
}

function parseCoordinate(raw, name) {
  if (typeof raw !== "string" || !/^-?\d{1,3}(\.\d{1,8})?$/.test(raw.trim())) {
    throw new ValidationError(`\`${name}\` must be a decimal number.`);
  }
  return Number(raw);
}

/** Validate a lat/lon pair that must lie in New Zealand. */
export function parseLatLon(rawLat, rawLon) {
  const lat = parseCoordinate(rawLat, "lat");
  const lon = parseCoordinate(rawLon, "lon");
  if (!isInNewZealand(lat, lon)) {
    throw new ValidationError("Coordinates must be in New Zealand.");
  }
  return { lat, lon };
}

/**
 * Optional "near=lat,lon" location bias. Rounded to 2 decimals (~1 km) so
 * nearby callers share cache entries. Returns null when absent.
 */
export function parseNear(raw) {
  if (raw == null || raw === "") return null;
  const parts = String(raw).split(",");
  if (parts.length !== 2) throw new ValidationError("`near` must be \"lat,lon\".");
  const { lat, lon } = parseLatLon(parts[0], parts[1]);
  const round = (n) => Math.round(n * 100) / 100;
  const near = { lat: round(lat), lon: round(lon) };
  return { ...near, key: `${near.lat},${near.lon}` };
}

/** Reverse-geocode zoom level, 3 (country) … 18 (building). */
export function parseZoom(raw, fallback = 12) {
  if (raw == null || raw === "") return fallback;
  const zoom = Number(raw);
  if (!Number.isInteger(zoom) || zoom < 3 || zoom > 18) {
    throw new ValidationError("`zoom` must be an integer from 3 to 18.");
  }
  return zoom;
}
