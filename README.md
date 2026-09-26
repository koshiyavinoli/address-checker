# Address Coverage Checker

A tiny web app that takes a physical address, geocodes it, and tells you whether
that point sits **inside** a configurable coverage polygon.

It ships with a **Nugegoda, Sri Lanka** zone as the default example, but the
coverage area is fully configurable. You can point it at any neighbourhood, park, or
delivery zone by editing a single file ([`config.js`](config.js)).

> **Live demo:** <https://koshiyavinoli.github.io/address-checker/>

---

## What it does

1. You type an address (e.g. `High Level Road, Nugegoda, Sri Lanka`).
2. The app converts it to latitude/longitude via the OpenStreetMap **Nominatim**
   geocoder.
3. It runs a point-in-polygon test with **Turf.js** and reports **Inside** or
   **Outside** the coverage zone.
4. The address and the polygon are drawn on a **Leaflet** map so the result is
   easy to verify at a glance.

"Strictly inside" is enforced with Turf's `ignoreBoundary: true` option. Hence,  a point
that lands exactly on an edge is reported as **outside**.

The interface is built around clear, distinct states so it always tells you what
is happening:

- **Loading**:  a spinner while the address is looked up.
- **Inside** (green) / **Outside** (red): the verdict, with the matched address,
  the exact coordinates, and the **distance to the zone boundary**.
- **Not found** (amber): the address couldn't be geocoded, with a hint to add
  more detail.
- **Error** (amber): a network/service problem, stated plainly.

The result point is plotted on the map with a colour-matched marker and a popup,
and the map re-frames to show both the point and the zone. A one-click example
chip (the detected area) lets you see the flow immediately.

---

## Run it locally

No build step and no dependencies to install.  It's plain HTML/CSS/JS. You only
need a static file server (browsers block `fetch` from `file://` URLs, so open it
over `http://`).

```bash
# clone the repo
git clone https://github.com/koshiyavinoli/address-checker.git
cd address-checker

# serve it with any static server, e.g. Python (bundled on most systems):
python -m http.server 8000
#   ...or Node:
npx serve .
```

Then open <http://localhost:8000> and start typing addresses.

---

## Configure your own coverage zone

Everything about the coverage area lives in [`config.js`](config.js). In the
common case you edit **only the polygon**,  reload, and the area name, wider
region, map view, geocoding bias, headings and footer all update automatically:

```js
const ZONE = {
  polygon: [                 // 5+ vertices as [lat, lon], ring left OPEN
    [6.88500, 79.89300],
    [6.88212, 79.90000],
    // ...
  ],

  // Optional overrides — leave blank / null to auto-detect from the polygon.
  name: "",                  // area name in the UI ("" = auto)
  region: "",                // wider region in the footer ("" = auto)
  countryCode: "",           // ISO code to bias geocoding ("" = auto)
  center: null,              // [lat, lon] initial map view (null = polygon centre)
};
```

**How auto-naming works.** On load the app reverse-geocodes the polygon's centre
with OpenStreetMap Nominatim and uses the returned place name (and country) to
label the UI, so the interface never hard-codes a location. Because reverse
geocoding names a *point*, the exact label depends on granularity; the app queries
at `nameZoom` (default **12**, town/area level). If the auto-detected name isn't
the one you want, set `name` (and optionally `region`) to pin it.

Tips for defining a polygon: list the vertices in order (clockwise or
counter-clockwise, either works), use **5 or more** points, and **don't** repeat
the first point at the end since the app closes the ring for you. An easy way to get
coordinates is to right-click points on [openstreetmap.org](https://www.openstreetmap.org)
or use [geojson.io](https://geojson.io) and read off `lat, lon`.

---

## Technical stack

| Concern            | Choice                              | Why                                                        |
| ------------------ | ----------------------------------- | ---------------------------------------------------------- |
| App shell          | Vanilla HTML / CSS / JS             | Zero build, zero framework, trivial to host statically.    |
| Geocoding          | OpenStreetMap **Nominatim** REST API| Free, keyless, CORS-enabled, callable from the browser.    |
| Geospatial logic   | **Turf.js** `booleanPointInPolygon` | Robust, well-tested point-in-polygon with strict-boundary. |
| Map / visualization| **Leaflet** + OpenStreetMap tiles   | Lightweight, free tiles, no account required.              |
| Hosting            | GitHub Pages (static)               | Free tier easily covers 500 requests/week.                 |

All third-party libraries are loaded from public CDNs (cdnjs / jsDelivr), so there
is nothing to bundle or install.

---

## How the "zero-cost" requirement is met

The app is **fully client-side and serverless**, so there is no backend to pay for.
Every moving part runs on a free tier that comfortably absorbs the stated volume of
up to **500 requests/week (~70/day)**:

- **Geocoding: the key cost driver.** Commercial geocoders (Google, Mapbox, etc.)
  bill per request. Instead this app calls the **OpenStreetMap Nominatim** public
  endpoint directly from the browser. It requires **no API key and has no usage
  charge**. The public instance's fair-use policy allows **up to 1 request per
  second**. Since the app sends exactly one geocode per user check, so ~70/day is a tiny
  fraction of the allowance. (For higher volume or production use you could
  self-host Nominatim or use a paid provider.)
- **Map tiles** come from the free OpenStreetMap tile servers with proper
  attribution.
- **Compute** (the point-in-polygon test) happens **in the user's browser** via
  Turf.js. No server CPU is consumed.
- **Hosting** is static files on **GitHub Pages**,
  which host public static sites for free.

Net operational cost at 500 req/week: **$0.00**.


---

## The default coverage polygon (Nugegoda)

A **12-vertex polygon** (~1.6 km radius, ~3.5 km across) covering the Nugegoda
area, centred on **≈ 6.870°N, 79.893°E**. Nugegoda is an informal suburb with no
official boundary polygon in OpenStreetMap, so this is an illustrative coverage
zone whose vertices are spaced around the centre to form a rounded area.

Vertices, in order (`latitude, longitude`):

| # | Latitude | Longitude |
|---|----------|-----------|
| 1 | 6.88500  | 79.89300  |
| 2 | 6.88212  | 79.90000  |
| 3 | 6.87800  | 79.90686  |
| 4 | 6.87000  | 79.90800  |
| 5 | 6.86300  | 79.90510  |
| 6 | 6.85610  | 79.90100  |
| 7 | 6.85500  | 79.89300  |
| 8 | 6.85790  | 79.88600  |
| 9 | 6.86200  | 79.87910  |
| 10| 6.87000  | 79.87800  |
| 11| 6.87700  | 79.88090  |
| 12| 6.88390  | 79.88500  |

**Try it:** `Nugegoda, Sri Lanka` → *Inside* · `Colombo Fort, Sri Lanka` → *Outside*.


---

## Project structure

The code is split into small ES modules by responsibility, so the
accuracy-critical logic is isolated from the UI:

```
address-checker/
├── index.html     # markup + library <script> tags
├── styles.css     # styling (light + dark mode, all states)
├── config.js      # the coverage zone (edit the polygon here)
├── geo.js         # domain logic: geocoding + point-in-polygon + distance
├── app.js         # UI: map, result states, event wiring
└── README.md
```

- **`geo.js`** holds the pure geospatial/geocoding functions (no DOM), which
  keeps the point-in-polygon and distance calculations easy to read and test.
- **`app.js`** imports `config.js` and `geo.js` and handles everything the user
  sees: the map, the result card's states, and input handling.
