/**
 * Upstream geocoders (OpenStreetMap data, keyless).
 * ---------------------------------------------------------------------------
 *   suggest()  → Photon     — built for type-ahead / autocomplete.
 *   search()   → Nominatim  — full free-text geocode on submit.
 *   reverse()  → Nominatim  — names the coverage zone from its centre.
 *
 * Nominatim's usage policy forbids autocomplete and caps traffic at
 * 1 request/second, which is why suggestions go to Photon and every Nominatim
 * call is spaced out below. Both base URLs can point at self-hosted instances.
 * All results are restricted to New Zealand and formatted as NZ addresses.
 */
import { formatNzAddress, normaliseCity } from "./nz-address.mjs";

const PHOTON_URL = process.env.PHOTON_URL || "https://photon.komoot.io";
const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
// Both services require an identifying User-Agent.
const USER_AGENT =
  process.env.USER_AGENT || "address-checker/1.0 (+https://github.com/koshiyavinoli/address-checker)";
const TIMEOUT_MS = 5000;

// minLon,minLat,maxLon,maxLat — North, South and Stewart Islands.
const NZ_BBOX = [166.0, -47.6, 178.9, -34.1];

const SUGGEST_LIMIT = 6;
const SEARCH_LIMIT = 5;

export class UpstreamError extends Error {
  constructor(service, status) {
    super(status ? `${service} returned ${status}` : `${service} is unreachable`);
    this.status = status;
  }
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "Accept-Language": "en-NZ,en", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError(url.host, 0);
  }
  if (!res.ok) throw new UpstreamError(url.host, res.status);
  return res.json();
}

// Keep this container at or below Nominatim's 1 request/second.
let nextNominatimSlot = 0;
async function nominatimTurn() {
  const now = Date.now();
  const wait = Math.max(0, nextNominatimSlot - now);
  nextNominatimSlot = Math.max(now, nextNominatimSlot) + 1000;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Build a Place from NZ address parts. `dedupeKey` groups results that share a
 * street address (e.g. "1 Queen Street" and "Burger Burger, 1 Queen Street"),
 * which are the same location for a coverage check, not an ambiguity.
 */
function toPlace(parts, lat, lon, kind) {
  const label = formatNzAddress(parts);
  const hasStreetAddress = Boolean(parts.street && parts.number);
  const dedupeKey = (hasStreetAddress ? formatNzAddress({ ...parts, name: "" }) : label).toLowerCase();
  return { label, lat, lon, kind, dedupeKey, named: Boolean(parts.name) && parts.name !== parts.street };
}

/** Drop duplicates, preferring the plain address over a named business there. */
function uniquePlaces(places) {
  const byKey = new Map();
  for (const place of places) {
    if (!place.label || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
    const prev = byKey.get(place.dedupeKey);
    if (!prev || (prev.named && !place.named)) byKey.set(place.dedupeKey, place); // keeps first position
  }
  return [...byKey.values()].map(({ label, lat, lon, kind }) => ({ label, lat, lon, kind }));
}

// --- Photon (autocomplete) -------------------------------------------------

function fromPhoton(feature) {
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  return toPlace(
    {
      name: p.name,
      number: p.housenumber,
      street: p.street,
      suburb: p.district || p.locality,
      city: p.city,
      postcode: p.postcode,
      region: p.state,
    },
    lat,
    lon,
    p.housenumber ? "address" : p.type || "place"
  );
}

export async function suggest(text, near) {
  const url = new URL("/api/", PHOTON_URL);
  url.searchParams.set("q", text);
  url.searchParams.set("limit", String(SUGGEST_LIMIT * 2)); // headroom for de-duplication
  url.searchParams.set("lang", "en");
  url.searchParams.set("bbox", NZ_BBOX.join(","));
  if (near) {
    url.searchParams.set("lat", String(near.lat));
    url.searchParams.set("lon", String(near.lon));
  }

  const data = await getJson(url);
  const places = uniquePlaces(
    (data.features || [])
      .filter((f) => String(f.properties?.countrycode || "").toUpperCase() === "NZ")
      .map(fromPhoton)
  );
  // "1 queen st" → numbered street addresses first (stable sort keeps Photon's ranking).
  if (/^\d/.test(text)) places.sort((a, b) => (b.kind === "address") - (a.kind === "address"));
  return places.slice(0, SUGGEST_LIMIT);
}

// --- Nominatim (search + reverse) -----------------------------------------

function fromNominatim(hit) {
  const a = hit.address || {};
  return toPlace(
    {
      name: hit.name,
      number: a.house_number,
      street: a.road || a.pedestrian || a.footway,
      suburb: a.suburb || a.neighbourhood || a.quarter || a.hamlet,
      city: a.city || a.town || a.village || a.municipality,
      postcode: a.postcode,
      region: a.state,
    },
    parseFloat(hit.lat),
    parseFloat(hit.lon),
    a.house_number ? "address" : hit.addresstype || hit.type || "place"
  );
}

export async function search(text, near) {
  const url = new URL("/search", NOMINATIM_URL);
  url.searchParams.set("q", text);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("countrycodes", "nz");
  if (near) {
    // Prefer (but don't require) results within ~50 km of the zone.
    const d = 0.5;
    url.searchParams.set("viewbox", [near.lon - d, near.lat + d, near.lon + d, near.lat - d].join(","));
    url.searchParams.set("bounded", "0");
  }

  await nominatimTurn();
  const data = await getJson(url);
  return uniquePlaces(data.map(fromNominatim));
}

export async function reverse(lat, lon, zoom) {
  const url = new URL("/reverse", NOMINATIM_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("addressdetails", "1");

  await nominatimTurn();
  const a = (await getJson(url)).address || {};
  const name =
    a.suburb || a.neighbourhood || a.quarter || a.city_district ||
    a.town || a.village || normaliseCity(a.city, a.state) || a.municipality || a.county || "";
  const region = a.country || a.state || a.region || "";
  return { name, region };
}
