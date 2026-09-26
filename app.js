/* Address Coverage Checker — client-side logic.
 *
 * Flow:
 *   1. Geocode the typed address via OpenStreetMap Nominatim (free, keyless).
 *   2. Test the resulting point against the coverage polygon with Turf.js
 *      (strict interior — boundary counts as "outside").
 *   3. Render the verdict and plot everything on a Leaflet map.
 *
 * The coverage area comes entirely from the ZONE object in config.js — edit
 * that file to retarget the app; nothing here needs to change.
 */

// --- Build a closed GeoJSON polygon (Turf wants [lon, lat] and a closed ring) ---
const RING = ZONE.polygon.map(([lat, lon]) => [lon, lat]);
RING.push(RING[0]); // close the ring
const COVERAGE_GEOJSON = turf.polygon([RING]);

// --- Fill config-driven copy ---
document.getElementById("subtitle").innerHTML =
  `Type an address to see whether it falls <strong>strictly inside</strong> the ` +
  `${ZONE.name} coverage zone.`;
document.getElementById("footer-zone").textContent =
  `Coverage area: ${ZONE.name}${ZONE.region ? ", " + ZONE.region : ""} · ` +
  `${ZONE.polygon.length}-vertex polygon`;
document.getElementById("address").placeholder =
  `e.g. an address in ${ZONE.name}${ZONE.region ? ", " + ZONE.region : ""}`;

// --- Map setup ---
const map = L.map("map").setView(ZONE.center, 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const polygonLayer = L.polygon(ZONE.polygon, {
  color: "#2563eb",
  weight: 2,
  fillColor: "#3b82f6",
  fillOpacity: 0.15,
}).addTo(map);

map.fitBounds(polygonLayer.getBounds(), { padding: [30, 30] });

let resultMarker = null;

// --- DOM references ---
const form = document.getElementById("search-form");
const input = document.getElementById("address");
const button = document.getElementById("check-btn");
const resultEl = document.getElementById("result");
const badgeEl = document.getElementById("result-badge");
const headlineEl = document.getElementById("result-headline");
const addressEl = document.getElementById("result-address");
const coordsEl = document.getElementById("result-coords");

// --- Geocoding via Nominatim ---
async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  // Optionally bias results toward a country to improve local accuracy.
  if (ZONE.countryCode) {
    url.searchParams.set("countrycodes", ZONE.countryCode);
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Geocoding service returned ${res.status}`);
  }
  const data = await res.json();
  if (!data.length) return null;

  const hit = data[0];
  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    label: hit.display_name,
  };
}

// --- Result rendering ---
function showState(kind, { headline, address, coords } = {}) {
  resultEl.hidden = false;
  resultEl.classList.remove("result--inside", "result--outside", "result--error", "result--loading");
  resultEl.classList.add(`result--${kind}`);

  const badges = { loading: "…", inside: "✓", outside: "✕", error: "!" };
  badgeEl.textContent = badges[kind] || "—";
  headlineEl.textContent = headline || "";
  addressEl.textContent = address || "";
  coordsEl.textContent = coords || "";
}

function plotPoint(lat, lon, inside) {
  if (resultMarker) map.removeLayer(resultMarker);
  resultMarker = L.circleMarker([lat, lon], {
    radius: 9,
    color: inside ? "#16a34a" : "#dc2626",
    fillColor: inside ? "#22c55e" : "#ef4444",
    fillOpacity: 0.9,
    weight: 2,
  }).addTo(map);

  const bounds = polygonLayer.getBounds().extend([lat, lon]);
  map.fitBounds(bounds, { padding: [40, 40] });
}

// --- Form handling ---
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  button.disabled = true;
  showState("loading", { headline: "Looking up address…" });

  try {
    const place = await geocode(query);

    if (!place) {
      showState("error", {
        headline: "Address not found",
        address: "We couldn't locate that address. Try adding a city or more detail.",
      });
      return;
    }

    const point = turf.point([place.lon, place.lat]);
    const inside = turf.booleanPointInPolygon(point, COVERAGE_GEOJSON, {
      ignoreBoundary: true, // strict interior — boundary is treated as outside
    });

    showState(inside ? "inside" : "outside", {
      headline: inside
        ? `Inside the ${ZONE.name} coverage zone`
        : `Outside the ${ZONE.name} coverage zone`,
      address: place.label,
      coords: `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`,
    });

    plotPoint(place.lat, place.lon, inside);
  } catch (err) {
    showState("error", {
      headline: "Something went wrong",
      address: err.message || "Please try again in a moment.",
    });
  } finally {
    button.disabled = false;
  }
});
