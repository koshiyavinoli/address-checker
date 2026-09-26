# Address Coverage Checker

A tiny web app that takes a physical address, geocodes it, and tells you whether
that point sits **strictly inside** a configurable coverage polygon.

It ships with a **Nugegoda, Sri Lanka** zone as the default example, but the
coverage area is fully configurable — point it at any neighbourhood, park, or
delivery zone by editing a single file ([`config.js`](config.js)).

> **Live demo:** <https://koshiyavinoli.github.io/address-checker/>

![Screenshot placeholder — the app shows an address box, a green/red verdict card, and a Leaflet map with the coverage polygon.](docs/screenshot.png)

---

## What it does

1. You type an address (e.g. `High Level Road, Nugegoda, Sri Lanka`).
2. The app converts it to latitude/longitude via the OpenStreetMap **Nominatim**
   geocoder.
3. It runs a point-in-polygon test with **Turf.js** and reports **Inside** or
   **Outside** the coverage zone.
4. The address and the polygon are drawn on a **Leaflet** map so the result is
   easy to verify at a glance.

"Strictly inside" is enforced with Turf's `ignoreBoundary: true` option — a point
that lands exactly on an edge is reported as **outside**.

---

## Run it locally

No build step and no dependencies to install — it's plain HTML/CSS/JS. You only
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

Everything about the coverage area lives in [`config.js`](config.js). Edit the
`ZONE` object and reload — the title, headings, footer, map view, geocoding bias
and the polygon all update automatically:

```js
const ZONE = {
  name: "Nugegoda",          // shown throughout the UI
  region: "Sri Lanka",       // wider region, shown in the footer
  countryCode: "lk",         // ISO code to bias geocoding ("" = worldwide)
  center: [6.8700, 79.8930], // [lat, lon] initial map view
  polygon: [                 // 5+ vertices as [lat, lon], ring left OPEN
    [6.88500, 79.89300],
    [6.88212, 79.90000],
    // ...
  ],
};
```

Tips for defining a polygon: list the vertices in order (clockwise or
counter-clockwise, either works), use **5 or more** points, and **don't** repeat
the first point at the end — the app closes the ring for you. An easy way to get
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

- **Geocoding — the key cost driver.** Commercial geocoders (Google, Mapbox, etc.)
  bill per request. Instead this app calls the **OpenStreetMap Nominatim** public
  endpoint directly from the browser. It requires **no API key and has no usage
  charge**. The public instance's fair-use policy allows **up to 1 request per
  second** — the app sends exactly one geocode per user check, so ~70/day is a tiny
  fraction of the allowance. (For higher volume or production use you would
  self-host Nominatim or use a paid provider; that is out of scope for this brief.)
- **Map tiles** come from the free OpenStreetMap tile servers with proper
  attribution.
- **Compute** (the point-in-polygon test) happens **in the user's browser** via
  Turf.js — no server CPU is consumed.
- **Hosting** is static files on **GitHub Pages** (or Netlify/Cloudflare Pages),
  all of which host public static sites for free.

Net operational cost at 500 req/week: **$0.00**.

> Please respect the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):
> no heavy/bulk use on the public endpoint, and keep attribution intact.

---

## The default coverage polygon (Nugegoda)

A **12-vertex polygon** (~1.5 km radius) centred on Nugegoda
(**≈ 6.870°N, 79.893°E**). Vertices, in order (`latitude, longitude`):

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

## Deploying for a live URL (GitHub Pages)

1. Create a public GitHub repo and push these files.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick `main` / root, save.
3. Wait ~1 minute; your live URL will be
   `https://koshiyavinoli.github.io/address-checker/`.

---

## Project structure

```
address-checker/
├── index.html     # markup + CDN script tags
├── styles.css     # styling (light + dark mode)
├── config.js      # the coverage zone: name, region, centre, polygon
├── app.js         # geocoding, point-in-polygon, map + result rendering
└── README.md
```

## License

MIT — see [LICENSE](LICENSE).
