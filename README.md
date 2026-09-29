# Address Coverage Checker

A small web app that takes a **New Zealand** address, geocodes it, and tells you
whether that point sits **inside** a configurable coverage polygon.

It ships with an **Auckland City Centre** zone as the default example, but the
coverage area is fully configurable. You can point it at any NZ neighbourhood,
park, or delivery zone by editing a single file ([`config.js`](config.js)).

The frontend is hosted on **AWS Amplify**. Address lookups go through a small
serverless API (**API Gateway → Lambda → DynamoDB cache**). API Gateway's
built-in throttling protects it from overuse.

---

## What it does

1. You start typing an address. After a short pause, **suggestions** appear
   below the field in NZ address format. Pick one with the mouse, or with
   <kbd>↑</kbd>/<kbd>↓</kbd> and <kbd>Enter</kbd>.
2. If you type a full address and press **Check** instead, the app geocodes it.
   When more than one distinct address matches (e.g. `Lambton Quay, Wellington`
   or `High Street`), it lists them and asks you to **pick the one you mean**.
3. It runs a point-in-polygon test with **Turf.js** and reports **Inside** or
   **Outside** the coverage zone.
4. The address and the polygon are drawn on a **Leaflet** map, so the result is
   easy to verify at a glance.

"Strictly inside" is enforced with Turf's `ignoreBoundary: true` option, so a
point that lands exactly on an edge is reported as **outside**.

The interface is built around clear, distinct states, so it always tells you
what is happening:

- **Loading**: a spinner while the address is looked up.
- **Pick an address** (amber): the lookup was ambiguous; choose from the list.
- **Inside** (green) / **Outside** (red): the verdict, with the matched address,
  the exact coordinates, and the **distance to the zone boundary**.
- **Not found** (amber): the address couldn't be geocoded in New Zealand, with a
  hint about the expected format.
- **Retrying**: if the address service is unavailable (network error, or a
  `429`/`502`/`503`/`504` response), the app retries automatically **3 times**
  with backoff (~1 s, 2 s, 4 s), showing "Retrying (n of 3)…".
- **Error** (amber): the problem stated plainly. If the retries all failed, a
  **Try again** button repeats the lookup. Invalid input (`400`) is never
  retried, and neither are type-ahead suggestions, since the next keystroke
  replaces them.

### NZ address format

Suggestions and results follow the NZ Post addressing standard, written on one
line (the country is omitted, since every result is domestic):

```
[Unit/]Number Street, Suburb, Town/City Postcode
2/15 Queen Street, Auckland Central, Auckland 1010
```

OpenStreetMap often records Auckland addresses with the council *local board*
as the city (e.g. `Waitematā`, `Devonport-Takapuna`). The backend rewrites these
to `Auckland`, as a postal address would. Several businesses at one street
address (`1 Queen Street`, `Burger Burger, 1 Queen Street`, …) count as a single
match, not an ambiguity.

---

## Architecture

```
Browser (AWS Amplify Hosting: static HTML/CSS/JS)
   │  GET /suggest  /geocode  /reverse
   ▼
Amazon API Gateway (REST): per-route throttling (suggest 5 req/s, geocode/reverse 1 req/s)
   ▼
AWS Lambda (Node.js 22): validates input, proxies to the geocoder, formats NZ addresses
   │                           ├─ suggest  → Photon     (OSM autocomplete)
   ▼                           └─ geocode / reverse → Nominatim (OSM, ≤ 1 req/s)
Amazon DynamoDB: shared cache with TTL (plus an in-memory cache per warm Lambda)
```

| Layer | What it does |
| ----- | ------------ |
| **Amplify Hosting** | Serves the static site over HTTPS with security headers ([`customHttp.yml`](customHttp.yml)). The build ([`amplify.yml`](amplify.yml)) publishes only the site files and injects the API URL. |
| **API Gateway** | Throttles every request before it reaches Lambda, with a limit per route: `/suggest` 5 req/s (burst 10), and `/geocode` and `/reverse` 1 req/s each (burst 3), matching Nominatim's 1 request/second policy. Requests over the limit get `429` without invoking Lambda, and the UI shows "Too many requests". |
| **Lambda** | Rejects anything that isn't a plausible address before calling a geocoder: 3–200 characters, at least one letter, and only letters (incl. macrons), digits, spaces and `, . ' / - # & ( )`. Coordinates must be in NZ. Unknown routes and non-GET methods are rejected. Reserved concurrency (5) caps parallel upstream calls. |
| **DynamoDB** | Caches responses (suggestions 7 days, geocodes 30 days, "not found" 1 day) so repeated lookups never reach the free geocoders. |

**Throttling limits are shared, not per visitor.** API Gateway limits the API
as a whole. The only per-client option is usage plans with API keys, and a key
shipped to the browser is public, so it can't tell visitors apart. A single
heavy user can therefore use up the shared allowance and cause `429`s for
everyone, but can never push cost or upstream traffic above the limits. If
per-IP blocking is ever needed, AWS WAF's rate-based rules are the upgrade path.

**Why two geocoders?** Nominatim's usage policy forbids autocomplete and allows
at most 1 request/second. Suggestions therefore go to **Photon**, which is built
for type-ahead and uses the same OpenStreetMap data. Only the explicit **Check**
goes to Nominatim, which the Lambda spaces out to stay within that limit. Both
are keyless, and both URLs are configurable (`PHOTON_URL`, `NOMINATIM_URL`), so
you can point them at self-hosted instances for higher volume.

---

## Run it locally

There is no build step and nothing to install beyond **Node.js 22+**. The dev
server serves the site and runs the same Lambda handler behind `/api`, using an
in-memory cache instead of DynamoDB:

```bash
git clone https://github.com/koshiyavinoli/address-checker.git
cd address-checker

node backend/dev-server.mjs        # → http://localhost:8000
```

Run the backend tests (validation, NZ formatting, routing, caching):

```bash
cd backend && npm test
```

> A plain static server (e.g. `python -m http.server`) is no longer enough on
> its own, because the page needs the `/api` endpoints.

---

## Deploy to AWS

### 1. Backend: API Gateway + Lambda + DynamoDB

The backend is an [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/)
template: [`backend/template.yaml`](backend/template.yaml).

```bash
cd backend
sam build
sam deploy --guided          # first time; answers are saved to samconfig.toml
```

Parameters (defaults in brackets):

| Parameter | Meaning |
| --------- | ------- |
| `AllowedOrigin` [`*`] | CORS origin, i.e. your Amplify domain, e.g. `https://main.d1234abcd.amplifyapp.com`. Set this for production. |
| `SuggestRateLimit` / `SuggestBurstLimit` [`5` / `10`] | Throttling for `/suggest` (autocomplete). |
| `LookupRateLimit` / `LookupBurstLimit` [`1` / `3`] | Throttling for `/geocode` and `/reverse`, each. |
| `UserAgent` | Identifying User-Agent sent to the geocoders, as their policies require. |

Note the stack output **`ApiUrl`**.

### 2. Frontend: AWS Amplify Hosting

1. In the Amplify console, **Create new app → Host web app**, and connect this
   repository and branch. Amplify picks up [`amplify.yml`](amplify.yml).
2. Under **Environment variables**, add `API_BASE_URL` = the `ApiUrl` output from
   step 1. The build fails if it is missing.
3. Deploy, then redeploy the SAM stack with `AllowedOrigin` set to the Amplify
   domain.

Optionally tighten `connect-src` in [`customHttp.yml`](customHttp.yml) from
`https://*.amazonaws.com` to your exact `execute-api` host.

---

## Configure your own coverage zone

Everything about the coverage area lives in [`config.js`](config.js). In the
common case, you edit **only the polygon** and reload:

```js
const ZONE = {
  polygon: [                 // 5+ vertices as [lat, lon], ring left OPEN
    [-36.83400, 174.76330],
    [-36.83594, 174.77236],
    // ...
  ],

  // Optional overrides — leave blank / null to auto-detect from the polygon.
  name: "Auckland City Centre", // area name in the UI ("" = auto)
  region: "",                // wider region ("" = auto)
  center: null,              // [lat, lon] initial map view (null = polygon centre)
  nameZoom: 12,              // reverse-geocode zoom used for auto-naming
};
```

The polygon must be in **New Zealand**: the API restricts every lookup to NZ.

**How auto-naming works.** When `name` is blank, the app reverse-geocodes the
polygon's centre (through the API) and uses the returned place name to label the
UI. Because reverse geocoding names a *point*, the exact label depends on
granularity. The app queries at `nameZoom` (default **12**, town/area level). If
the auto-detected name isn't the one you want, set `name` to pin it.

Tips for defining a polygon: list the vertices in order (clockwise or
counter-clockwise both work), use **5 or more** points, and **don't** repeat the
first point at the end, because the app closes the ring for you. An easy way to
get coordinates is to right-click points on
[openstreetmap.org](https://www.openstreetmap.org) or use
[geojson.io](https://geojson.io) and read off `lat, lon`.

---

## Technical stack

| Concern             | Choice                                         | Why                                                          |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| App shell           | Vanilla HTML / CSS / JS                        | Zero build, zero framework.                                  |
| Hosting             | **AWS Amplify Hosting**                        | Managed HTTPS/CDN hosting, deploys on every push.            |
| API                 | **API Gateway** (REST) + **Lambda** (Node 22)  | Built-in throttling, input validation, no keys in browser.   |
| Cache               | **DynamoDB** (on-demand, TTL)                  | Shared across Lambda instances; avoids repeat geocodes.      |
| Autocomplete        | **Photon** (OpenStreetMap)                     | Built for type-ahead; keyless.                               |
| Geocoding           | **Nominatim** (OpenStreetMap)                  | Free, keyless, good NZ coverage (LINZ address import).       |
| Geospatial logic    | **Turf.js** `booleanPointInPolygon`            | Robust, well-tested point-in-polygon with strict boundary.   |
| Map / visualization | **Leaflet** + OpenStreetMap tiles              | Lightweight, free tiles, no account required.                |

The frontend libraries are loaded from public CDNs (cdnjs / jsDelivr). The
Lambda has no dependencies: the AWS SDK v3 ships with the Node.js runtime.

---

## Cost

At the design volume of about **500 checks/week**, costs stay small:

- **Geocoding** is free (Photon and Nominatim public instances, fair use).
  Caching and throttling keep traffic to them low. Note that typing produces a
  few suggestion requests per check (debounced to one per pause, and cached in
  the page as well as on the server).
- **API Gateway, Lambda, DynamoDB (on-demand) and Amplify Hosting** bill per
  request or per GB. At this volume they come to cents per month, and often
  fall within the AWS Free Tier.
- **Throttling** is built into API Gateway at no extra charge. Throttled
  requests never invoke Lambda, so the throttle limits also cap the bill.
  AWS WAF (≈ $9/month for a web ACL with a few rules) is deliberately not
  used.

---

## The default coverage polygon (Auckland City Centre)

A **12-vertex polygon** (~1.6 km radius, ~3.2 km across) covering Auckland's
city centre, centred on **≈ 36.8485°S, 174.7633°E**. It is an illustrative
coverage zone whose vertices are spaced around the centre to form a rounded
area.

| # | Latitude  | Longitude  |
|---|-----------|------------|
| 1 | -36.83400 | 174.76330  |
| 2 | -36.83594 | 174.77236  |
| 3 | -36.84125 | 174.77899  |
| 4 | -36.84850 | 174.78143  |
| 5 | -36.85575 | 174.77899  |
| 6 | -36.86106 | 174.77236  |
| 7 | -36.86306 | 174.76330  |
| 8 | -36.86106 | 174.75424  |
| 9 | -36.85575 | 174.74761  |
| 10| -36.84850 | 174.74518  |
| 11| -36.84125 | 174.74761  |
| 12| -36.83594 | 174.75424  |

**Try it:** `1 Queen Street, Auckland` → *Inside* · type `Takapuna` and pick the suggestion → *Outside* ·
`Lambton Quay, Wellington` → pick from two matches, then *Outside*.

---

## Project structure

```
address-checker/
├── index.html          # markup + library <script> tags
├── styles.css          # styling (light + dark mode, all states)
├── config.js           # the coverage zone (edit the polygon here)
├── geo.js              # domain logic: point-in-polygon + distance (no network)
├── api.js              # client for the address API
├── api-config.js       # API base URL ("/api" locally; injected by Amplify)
├── app.js              # UI: autocomplete, address picker, map, result states
├── amplify.yml         # Amplify Hosting build spec
├── customHttp.yml      # Amplify response/security headers
└── backend/
    ├── template.yaml   # SAM: API Gateway (throttled), Lambda, DynamoDB
    ├── dev-server.mjs  # local server: static site + /api → Lambda handler
    ├── src/
    │   ├── handler.mjs     # Lambda entry: routing, CORS, error mapping
    │   ├── validate.mjs    # input validation + normalisation
    │   ├── providers.mjs   # Photon / Nominatim calls, NZ-only, de-duplication
    │   ├── nz-address.mjs  # NZ Post-style address formatting
    │   └── cache.mjs       # in-memory + DynamoDB cache
    └── test/           # node:test unit tests
```
