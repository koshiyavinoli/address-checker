/**
 * Address Coverage Checker — UI + orchestration.
 * ---------------------------------------------------------------------------
 * Wires the coverage config (config.js), the geospatial helpers (geo.js) and
 * the address API client (api.js) to the DOM and a Leaflet map. Keeps all
 * DOM/state handling here so geo.js stays pure.
 */
import { ZONE } from "./config.js";
import {
  toPolygon,
  centerLatLon,
  isStrictlyInside,
  distanceToBoundaryKm,
  formatDistance,
} from "./geo.js";
import { MAX_RETRIES, suggestAddresses, geocodeAddress, reverseGeocode } from "./api.js";

// --- Coverage geometry (built once) ---
const POLYGON = toPolygon(ZONE.polygon);
const CENTER = ZONE.center || centerLatLon(POLYGON);
// Location bias sent with lookups so nearby matches rank first.
const NEAR = `${CENTER[0].toFixed(4)},${CENTER[1].toFixed(4)}`;

// Live zone metadata; seeded from config, completed by reverse geocoding.
const zone = {
  name: ZONE.name || "",
  region: ZONE.region || "",
};

// --- DOM references ---
const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("address"),
  suggestions: document.getElementById("suggestions"),
  button: document.getElementById("check-btn"),
  clearButton: document.getElementById("clear-btn"),
  subtitle: document.getElementById("subtitle"),
  examples: document.getElementById("examples"),
  candidates: document.getElementById("candidates"),
  candidatesList: document.getElementById("candidates-list"),
  result: document.getElementById("result"),
  badge: document.getElementById("result-badge"),
  headline: document.getElementById("result-headline"),
  address: document.getElementById("result-address"),
  meta: document.getElementById("result-meta"),
  retryButton: document.getElementById("retry-btn"),
};

// --- Copy that depends on the (possibly async) zone name ---
const zoneLabel = () => (zone.name ? `the ${zone.name} zone` : "the coverage zone");

function refreshCopy() {
  el.subtitle.innerHTML =
    `Enter a New Zealand address to check whether it falls <strong>inside</strong> ${zoneLabel()}.`;
  el.input.placeholder = zone.name
    ? `Start typing an address in ${zone.name}…`
    : "Start typing a New Zealand address…";

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
function showState(kind, { headline = "", address = "", meta = "", verdict = "", retry = false } = {}) {
  el.retryButton.hidden = !retry;
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

// --- Verdict for one resolved place ---
function checkPlace(place) {
  hideCandidates();
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
}

// --- Ambiguous matches: let the user pick ---
function showCandidates(places) {
  el.result.hidden = true;
  el.result.dataset.verdict = "";
  el.candidatesList.innerHTML = "";
  for (const place of places) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidates__option";
    button.textContent = place.label;
    button.addEventListener("click", () => {
      el.input.value = place.label;
      checkPlace(place);
    });
    li.appendChild(button);
    el.candidatesList.appendChild(li);
  }
  el.candidates.hidden = false;
  el.candidatesList.querySelector("button")?.focus();
}

function hideCandidates() {
  el.candidates.hidden = true;
  el.candidatesList.innerHTML = "";
}

// --- Main check (free text typed by the user) ---
let lastQuery = ""; // re-run by the "Try again" button

async function check(query) {
  lastQuery = query;
  setBusy(true);
  hideCandidates();
  showState("loading", { headline: "Looking up address…" });

  try {
    const places = await geocodeAddress(query, NEAR, {
      onRetry: (attempt, total) =>
        showState("loading", {
          headline: "The address service isn’t responding",
          address: `Retrying (${attempt} of ${total})…`,
        }),
    });

    if (!places.length) {
      showState("notfound", {
        headline: "Address not found",
        address:
          "We couldn’t find that address in New Zealand. Try the format " +
          "“number street, suburb, town or city, postcode”, or pick a suggestion as you type.",
      });
    } else if (places.length === 1) {
      checkPlace(places[0]);
    } else {
      showCandidates(places);
    }
  } catch (err) {
    // Retryable errors have already been retried MAX_RETRIES times; hand the
    // decision to the user.
    showState("error", {
      headline: err.retryable ? "Couldn’t look up the address" : "Something went wrong",
      address: err.message || "Please check your connection and try again.",
      meta: err.retryable ? `We tried ${MAX_RETRIES + 1} times. You can try again now.` : "",
      retry: Boolean(err.retryable),
    });
    if (err.retryable) el.retryButton.focus();
  } finally {
    setBusy(false);
  }
}

// --- Input validation (mirrors the backend's rules in backend/src/validate.mjs) ---
const MIN_LENGTH = 3;
// A real address must contain at least one letter — not only digits,
// whitespace or symbols (e.g. "12345" or "][')\;" are rejected).
const hasLetter = (s) => /\p{L}/u.test(s);
// Letters (incl. macrons), digits and the punctuation used in NZ addresses.
const hasOnlyAddressChars = (s) => /^[\p{L}\p{M}\p{N} ,.'’/#&()-]+$/u.test(s);

function validationMessage(query) {
  if (!query) return "Please enter an address.";
  if (!hasLetter(query)) {
    return "Please enter a valid address. It should include a street or place name, not only numbers or symbols.";
  }
  if (query.length < MIN_LENGTH) return `Please enter at least ${MIN_LENGTH} characters.`;
  if (!hasOnlyAddressChars(query)) {
    return "Please remove unsupported characters. Addresses can contain letters, numbers, spaces and , . ' / - # & ( )";
  }
  return "";
}

// --- Autocomplete ---
const SUGGEST_DELAY_MS = 250; // debounce: one request after the user pauses typing
const suggestCache = new Map(); // per-page cache, so backspacing doesn't re-request
const ac = { items: [], active: -1, timer: 0, controller: null };

function closeSuggestions() {
  clearTimeout(ac.timer);
  ac.controller?.abort();
  ac.items = [];
  ac.active = -1;
  el.suggestions.hidden = true;
  el.suggestions.innerHTML = "";
  el.input.setAttribute("aria-expanded", "false");
  el.input.removeAttribute("aria-activedescendant");
}

function renderSuggestions(items) {
  if (!items.length) {
    closeSuggestions();
    return;
  }
  ac.items = items;
  ac.active = -1;
  el.suggestions.innerHTML = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.id = `suggestion-${i}`;
    li.className = "suggestions__item";
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.textContent = item.label;
    // Keep focus in the input so the blur handler doesn't close the list first.
    li.addEventListener("pointerdown", (e) => e.preventDefault());
    li.addEventListener("click", () => chooseSuggestion(i));
    el.suggestions.appendChild(li);
  });
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

function setActiveSuggestion(index) {
  const options = el.suggestions.children;
  if (!options.length) return;
  ac.active = (index + options.length) % options.length;
  [...options].forEach((li, i) => li.setAttribute("aria-selected", String(i === ac.active)));
  const active = options[ac.active];
  el.input.setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView({ block: "nearest" });
}

function chooseSuggestion(index) {
  const place = ac.items[index];
  if (!place) return;
  el.input.value = place.label;
  el.input.setCustomValidity("");
  closeSuggestions();
  // A suggestion already carries coordinates — no second lookup needed.
  checkPlace(place);
}

function scheduleSuggestions() {
  clearTimeout(ac.timer);
  ac.controller?.abort();

  const query = el.input.value.trim();
  if (validationMessage(query)) {
    closeSuggestions();
    return;
  }
  const key = query.toLowerCase().replace(/\s+/g, " ");
  if (suggestCache.has(key)) {
    renderSuggestions(suggestCache.get(key));
    return;
  }

  ac.timer = setTimeout(async () => {
    const controller = new AbortController();
    ac.controller = controller;
    try {
      const items = await suggestAddresses(query, NEAR, controller.signal);
      suggestCache.set(key, items);
      if (!controller.signal.aborted) renderSuggestions(items);
    } catch {
      // Suggestions are a convenience: on failure (or abort) just hide them.
      // The user can still submit, and a real error shows then.
      if (!controller.signal.aborted) closeSuggestions();
    }
  }, SUGGEST_DELAY_MS);
}

// --- Events ---
el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  closeSuggestions();
  const query = el.input.value.trim();

  const message = validationMessage(query);
  el.input.setCustomValidity(message);
  if (message) {
    el.input.reportValidity();
    return;
  }

  check(query);
});

el.input.addEventListener("input", () => {
  // Clear the custom validity as soon as the user edits the field.
  el.input.setCustomValidity("");
  scheduleSuggestions();
});

el.input.addEventListener("keydown", (event) => {
  const open = !el.suggestions.hidden;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (open) setActiveSuggestion(ac.active + 1);
      else scheduleSuggestions();
      break;
    case "ArrowUp":
      if (!open) return;
      event.preventDefault();
      setActiveSuggestion(ac.active - 1);
      break;
    case "Enter":
      // Enter on a highlighted suggestion picks it; otherwise the form submits.
      if (open && ac.active >= 0) {
        event.preventDefault();
        chooseSuggestion(ac.active);
      }
      break;
    case "Escape":
      if (open) {
        event.preventDefault();
        closeSuggestions();
      }
      break;
  }
});

el.input.addEventListener("blur", closeSuggestions);

el.retryButton.addEventListener("click", () => {
  if (lastQuery) check(lastQuery);
});

el.clearButton.addEventListener("click", () => {
  el.input.value = "";
  el.input.setCustomValidity("");
  closeSuggestions();
  hideCandidates();
  el.result.hidden = true;
  el.result.dataset.verdict = "";
  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }
  map.fitBounds(polygonLayer.getBounds(), { padding: [30, 30] });
  el.input.focus();
});

// --- Init ---
refreshCopy();
el.input.focus();

// Name the area from the polygon centre (unless config already set everything).
(async () => {
  if (zone.name && zone.region) return;
  try {
    const [lat, lon] = CENTER;
    const info = await reverseGeocode(lat, lon, ZONE.nameZoom || 12);
    zone.name = zone.name || info.name;
    zone.region = zone.region || info.region;
  } catch {
    /* keep generic copy if reverse geocoding is unavailable */
  } finally {
    refreshCopy();
  }
})();
