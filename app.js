/**
 * Address Coverage Checker — UI + orchestration.
 * ---------------------------------------------------------------------------
 * Wires the coverage config (config.js) and the geospatial helpers (geo.js)
 * to the DOM and a Leaflet map. Keeps all DOM/state handling here so geo.js
 * stays pure.
 */
import { ZONE } from "./config.js";
import {
  toPolygon,
  centerLatLon,
  isStrictlyInside,
  distanceToBoundaryKm,
  formatDistance,
  geocodeAddress,
  reverseGeocode,
} from "./geo.js";

// --- Coverage geometry (built once) ---
const POLYGON = toPolygon(ZONE.polygon);
const CENTER = ZONE.center || centerLatLon(POLYGON);

// Live zone metadata; seeded from config, completed by reverse geocoding.
const zone = {
  name: ZONE.name || "",
  region: ZONE.region || "",
  countryCode: ZONE.countryCode || "",
};

// --- DOM references ---
const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("address"),
  button: document.getElementById("check-btn"),
  subtitle: document.getElementById("subtitle"),
  examples: document.getElementById("examples"),
  result: document.getElementById("result"),
  badge: document.getElementById("result-badge"),
  headline: document.getElementById("result-headline"),
  address: document.getElementById("result-address"),
  meta: document.getElementById("result-meta"),
};

// --- Copy that depends on the (possibly async) zone name ---
const zoneLabel = () => (zone.name ? `the ${zone.name} zone` : "the coverage zone");

function refreshCopy() {
  el.subtitle.innerHTML =
    `Enter an address to check whether it falls <strong>inside</strong> ${zoneLabel()}.`;
  el.input.placeholder = zone.name ? `Try an address in ${zone.name}…` : "Enter a physical address…";

  // Keep an on-screen verdict's wording in sync once the name resolves.
  const v = el.result.dataset.verdict;
  if (v === "inside") el.headline.textContent = `Inside ${zoneLabel()}`;
  if (v === "outside") el.headline.textContent = `Outside ${zoneLabel()}`;

  renderExamples();
}

function renderExamples() {
  if (!zone.name) {
    el.examples.hidden = true;
    return;
  }
  el.examples.hidden = false;
  el.examples.innerHTML = "";
  const label = document.createElement("span");
  label.className = "examples__label";
  label.textContent = "Try:";
  el.examples.appendChild(label);

  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = `${zone.name}${zone.region ? ", " + zone.region : ""}`;
  chip.addEventListener("click", () => {
    el.input.value = chip.textContent;
    el.form.requestSubmit();
  });
  el.examples.appendChild(chip);
}

// --- Map ---
const map = L.map("map", { zoomControl: true }).setView(CENTER, 14);

// Standard OpenStreetMap basemap — free & keyless.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 20,
  // Required attribution for the free OSM tile layer (kept minimal).
  attribution: '&copy; OpenStreetMap',
}).addTo(map);

const polygonLayer = L.polygon(ZONE.polygon, {
  color: "#2563eb",
  weight: 2,
  fillColor: "#3b82f6",
  fillOpacity: 0.15,
}).addTo(map);

map.fitBounds(polygonLayer.getBounds(), { padding: [30, 30] });

let marker = null;

function plotPoint(lat, lon, inside, label) {
  if (marker) map.removeLayer(marker);
  marker = L.circleMarker([lat, lon], {
    radius: 9,
    color: inside ? "#16a34a" : "#dc2626",
    fillColor: inside ? "#22c55e" : "#ef4444",
    fillOpacity: 0.9,
    weight: 2,
  })
    .addTo(map)
    .bindPopup(label, { closeButton: false })
    .openPopup();

  map.fitBounds(polygonLayer.getBounds().extend([lat, lon]), { padding: [45, 45] });
}

// --- Result rendering (one function drives every visible state) ---
function showState(kind, { headline = "", address = "", meta = "", verdict = "" } = {}) {
  el.result.hidden = false;
  el.result.dataset.verdict = verdict;
  el.result.className = `result result--${kind}`;

  const badges = { loading: "", inside: "✓", outside: "✕", notfound: "?", error: "!" };
  el.badge.textContent = badges[kind] ?? "";
  el.badge.classList.toggle("result__badge--spin", kind === "loading");

  el.headline.textContent = headline;
  el.address.textContent = address;
  el.meta.textContent = meta;
}

function setBusy(busy) {
  el.button.disabled = busy;
  el.button.classList.toggle("is-busy", busy);
  el.button.textContent = busy ? "Checking…" : "Check";
}

// --- Main check ---
async function check(query) {
  setBusy(true);
  showState("loading", { headline: "Looking up address…" });

  try {
    const place = await geocodeAddress(query, zone.countryCode);

    if (!place) {
      showState("notfound", {
        headline: "Address not found",
        address: "We couldn’t locate that address. Try adding a street, city, or postcode.",
      });
      return;
    }

    const inside = isStrictlyInside(place.lat, place.lon, POLYGON);
    const distance = distanceToBoundaryKm(place.lat, place.lon, POLYGON);
    const coords = `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`;

    showState(inside ? "inside" : "outside", {
      verdict: inside ? "inside" : "outside",
      headline: inside ? `Inside ${zoneLabel()}` : `Outside ${zoneLabel()}`,
      address: place.label,
      meta: inside
        ? `${formatDistance(distance)} inside the boundary · ${coords}`
        : `${formatDistance(distance)} from the zone · ${coords}`,
    });

    plotPoint(place.lat, place.lon, inside, place.label);
  } catch (err) {
    showState("error", {
      headline: "Something went wrong",
      address: err.message || "Please check your connection and try again.",
    });
  } finally {
    setBusy(false);
  }
}

// --- Events ---
el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = el.input.value.trim();
  if (query) check(query);
});

// --- Init ---
refreshCopy();
el.input.focus();

// Name the area from the polygon centre (unless config already set everything).
(async () => {
  if (zone.name && zone.region && zone.countryCode) return;
  try {
    const [lat, lon] = CENTER;
    const info = await reverseGeocode(lat, lon, ZONE.nameZoom || 12);
    zone.name = zone.name || info.name;
    zone.region = zone.region || info.region;
    zone.countryCode = zone.countryCode || info.countryCode;
  } catch {
    /* keep generic copy if reverse geocoding is unavailable */
  } finally {
    refreshCopy();
  }
})();
