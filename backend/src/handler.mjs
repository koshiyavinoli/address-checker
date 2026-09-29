/**
 * Address Checker API — Lambda entry point (API Gateway REST, proxy integration).
 * ---------------------------------------------------------------------------
 *   GET /suggest?q=…[&near=lat,lon]         → { results: Place[] }  autocomplete
 *   GET /geocode?q=…[&near=lat,lon]         → { results: Place[] }  0, 1 or many (ambiguous)
 *   GET /reverse?lat=…&lon=…[&zoom=3..18]   → { name, region }
 *
 *   Place = { label, lat, lon, kind }   label is a one-line NZ-format address.
 *
 * Validates every request before anything is sent upstream, and serves repeat
 * lookups from the cache (cache.mjs) so the free geocoders see as little
 * traffic as possible. Per-route throttling happens in front of this, in
 * API Gateway (see template.yaml).
 */
import { ValidationError, parseAddressQuery, parseLatLon, parseNear, parseZoom } from "./validate.mjs";
import { UpstreamError, suggest, search, reverse } from "./providers.mjs";
import { cached } from "./cache.mjs";

const DAY = 24 * 60 * 60;
const TTL = {
  suggest: 7 * DAY,
  geocode: 30 * DAY,
  reverse: 30 * DAY,
  empty: 1 * DAY, // "no match" answers expire sooner in case OSM data is added
};

// Comma-separated list of allowed browser origins, or "*".
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "*").split(",").map((s) => s.trim());

const routes = {
  async suggest(params) {
    const q = parseAddressQuery(params.q);
    const near = parseNear(params.near);
    const results = await cached(
      `suggest#${near?.key ?? "-"}#${q.key}`,
      () => suggest(q.text, near),
      (r) => (r.length ? TTL.suggest : TTL.empty)
    );
    return { results };
  },

  async geocode(params) {
    const q = parseAddressQuery(params.q);
    const near = parseNear(params.near);
    const results = await cached(
      `geocode#${near?.key ?? "-"}#${q.key}`,
      () => search(q.text, near),
      (r) => (r.length ? TTL.geocode : TTL.empty)
    );
    return { results };
  },

  async reverse(params) {
    const { lat, lon } = parseLatLon(params.lat, params.lon);
    const zoom = parseZoom(params.zoom);
    return cached(`reverse#${zoom}#${lat.toFixed(4)},${lon.toFixed(4)}`, () => reverse(lat, lon, zoom), () => TTL.reverse);
  },
};

function corsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes("*")) return { "Access-Control-Allow-Origin": "*" };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return {};
}

function respond(statusCode, body, headers) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers },
    body: body === undefined ? "" : JSON.stringify(body),
  };
}

export async function handler(event) {
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const cors = corsHeaders(headers.origin);

  if (event.httpMethod === "OPTIONS") {
    return respond(204, undefined, { ...cors, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" });
  }
  if (event.httpMethod !== "GET") {
    return respond(405, { error: "Method not allowed." }, { ...cors, Allow: "GET, OPTIONS" });
  }

  const name = (event.path || "").split("/").filter(Boolean).pop();
  const route = Object.hasOwn(routes, name) ? routes[name] : null;
  if (!route) return respond(404, { error: "Not found." }, cors);

  try {
    const body = await route(event.queryStringParameters || {});
    // Let browsers reuse identical lookups for a few minutes too.
    return respond(200, body, { ...cors, "Cache-Control": "public, max-age=300" });
  } catch (err) {
    if (err instanceof ValidationError) {
      return respond(400, { error: err.message }, cors);
    }
    if (err instanceof UpstreamError) {
      console.warn("Upstream geocoder failed", err.message);
      const busy = err.status === 429;
      return respond(
        busy ? 503 : 502,
        { error: busy ? "The address service is busy. Please try again shortly." : "The address service is unavailable. Please try again." },
        { ...cors, ...(busy ? { "Retry-After": "5" } : {}) }
      );
    }
    console.error("Unhandled error", err);
    return respond(500, { error: "Something went wrong." }, cors);
  }
}
