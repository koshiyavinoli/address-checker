import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handler } from "../src/handler.mjs";
import { clearMemoryCache } from "../src/cache.mjs";

const realFetch = globalThis.fetch;
let calls;

function stubFetch(respond) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url));
    const { status = 200, body } = respond(new URL(url));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
}

const get = (path, q = {}, headers = {}) =>
  handler({ httpMethod: "GET", path, queryStringParameters: q, headers });

const photonFeature = (props, coords = [174.7633, -36.8485]) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: coords },
  properties: { countrycode: "NZ", ...props },
});

beforeEach(() => clearMemoryCache());
afterEach(() => (globalThis.fetch = realFetch));

test("suggest: NZ-only, NZ-formatted, de-duplicated, then cached", async () => {
  stubFetch(() => ({
    body: {
      features: [
        photonFeature({ housenumber: "1", street: "Queen Street", district: "Auckland Central", city: "Auckland", postcode: "1010" }),
        photonFeature({ housenumber: "1", street: "Queen Street", district: "Auckland Central", city: "Auckland", postcode: "1010" }),
        photonFeature({ name: "Queen Street", type: "street", city: "Queenstown" }, [168.66, -45.03]),
        { ...photonFeature({ name: "Queen Street", city: "Sydney" }), properties: { countrycode: "AU", name: "Queen Street" } },
      ],
    },
  }));

  const res = await get("/suggest", { q: "1 queen st", near: "-36.8485,174.7633" });
  assert.equal(res.statusCode, 200);
  const { results } = JSON.parse(res.body);
  assert.deepEqual(results.map((r) => r.label), [
    "1 Queen Street, Auckland Central, Auckland 1010",
    "Queen Street, Queenstown",
  ]);
  assert.equal(results[0].kind, "address");
  assert.equal(calls[0].host, "photon.komoot.io");
  assert.equal(calls[0].searchParams.get("lat"), "-36.85");

  await get("/suggest", { q: "1  Queen St" }); // different `near` → different key
  await get("/suggest", { q: "1 QUEEN ST", near: "-36.849,174.763" }); // same key after normalising
  assert.equal(calls.length, 2);
});

test("geocode returns every distinct candidate so the UI can ask the user to pick", async () => {
  stubFetch(() => ({
    body: [
      { lat: "-36.8485", lon: "174.7633", name: "", address: { house_number: "10", road: "High Street", suburb: "Auckland Central", city: "Auckland", postcode: "1010" } },
      { lat: "-43.53", lon: "172.63", name: "", address: { house_number: "10", road: "High Street", suburb: "Christchurch Central", city: "Christchurch", postcode: "8011" } },
    ],
  }));

  const res = await get("/geocode", { q: "10 High Street" });
  const { results } = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(results.length, 2);
  assert.equal(results[1].label, "10 High Street, Christchurch Central, Christchurch 8011");
  assert.equal(calls[0].searchParams.get("countrycodes"), "nz");
});

test("businesses sharing a street address collapse into one match (not ambiguous)", async () => {
  const addr = { house_number: "1", road: "Queen Street", suburb: "City Centre", city: "Auckland", state: "Auckland", postcode: "1010" };
  stubFetch(() => ({
    body: [
      { lat: "-36.84345", lon: "174.76673", name: "Counter Espresso Bar", address: addr },
      { lat: "-36.84337", lon: "174.76648", name: "", address: addr },
      { lat: "-36.84330", lon: "174.76632", name: "Burger Burger", address: addr },
    ],
  }));

  const { results } = JSON.parse((await get("/geocode", { q: "1 Queen Street, Auckland" })).body);
  assert.deepEqual(results, [
    { label: "1 Queen Street, City Centre, Auckland 1010", lat: -36.84337, lon: 174.76648, kind: "address" },
  ]);
});

test("suggestions for a numbered query list street addresses first", async () => {
  stubFetch(() => ({
    body: {
      features: [
        photonFeature({ name: "Queen Victoria", street: "Princes Street", city: "Auckland", type: "house" }),
        photonFeature({ housenumber: "1", street: "Queen Street", city: "Auckland" }),
      ],
    },
  }));
  const { results } = JSON.parse((await get("/suggest", { q: "1 queen" })).body);
  assert.deepEqual(results.map((r) => r.kind), ["address", "house"]);
});

test("invalid input is rejected before any upstream call", async () => {
  stubFetch(() => ({ body: {} }));
  for (const q of [{ q: "12345" }, { q: "<b>x</b>" }, {}]) {
    const res = await get("/geocode", q);
    assert.equal(res.statusCode, 400);
    assert.ok(JSON.parse(res.body).error);
  }
  assert.equal((await get("/reverse", { lat: "6.87", lon: "79.89" })).statusCode, 400);
  assert.equal(calls.length, 0);
});

test("unknown routes, methods and upstream throttling are mapped to clean errors", async () => {
  stubFetch(() => ({ status: 429, body: {} }));
  assert.equal((await get("/admin")).statusCode, 404);
  assert.equal((await get("/constructor")).statusCode, 404);
  assert.equal((await handler({ httpMethod: "POST", path: "/geocode" })).statusCode, 405);

  const busy = await get("/suggest", { q: "Ponsonby" });
  assert.equal(busy.statusCode, 503);
  assert.equal(busy.headers["Retry-After"], "5");
});

test("CORS header is present on every response", async () => {
  stubFetch(() => ({ body: { features: [] } }));
  const res = await get("/suggest", { q: "Ponsonby" }, { Origin: "https://example.amplifyapp.com" });
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});
