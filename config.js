/**
 * Coverage zone configuration.
 * ---------------------------------------------------------------------------
 * This is the ONLY file you edit to point the app at a different area.
 * Everything in the UI (title, headings, footer, map, geocoding bias) is
 * derived from the values below.
 *
 *   name        Human-readable zone name, shown throughout the UI.
 *   region      Wider region/country, shown in the footer & used for context.
 *   countryCode ISO 3166-1 alpha-2 code to bias geocoding (e.g. "lk", "us",
 *               "gb"). Set to "" to search worldwide with no bias.
 *   center      [latitude, longitude] used for the initial map view.
 *   polygon     The coverage area as an ordered list of [latitude, longitude]
 *               vertices (5 or more). The ring is left OPEN here — do NOT
 *               repeat the first point; app.js closes it automatically.
 *
 * The default below is a 12-vertex polygon (~1.5 km radius) over Nugegoda,
 * a suburb of Colombo, Sri Lanka (centre ≈ 6.870°N, 79.893°E).
 */
const ZONE = {
  name: "Nugegoda",
  region: "Sri Lanka",
  countryCode: "lk",
  center: [6.8700, 79.8930],
  polygon: [
    [6.88500, 79.89300],
    [6.88212, 79.90000],
    [6.87800, 79.90686],
    [6.87000, 79.90800],
    [6.86300, 79.90510],
    [6.85610, 79.90100],
    [6.85500, 79.89300],
    [6.85790, 79.88600],
    [6.86200, 79.87910],
    [6.87000, 79.87800],
    [6.87700, 79.88090],
    [6.88390, 79.88500],
  ],
};
