/**
 * Coverage zone configuration.
 * ---------------------------------------------------------------------------
 * In the common case you only edit ONE thing: the `polygon` vertices.
 *
 * The checker covers New Zealand addresses only (the backend restricts every
 * lookup to NZ and formats results as NZ addresses), so the polygon must be in
 * New Zealand. The area name, wider region and map centre are derived
 * automatically from the polygon (via a one-time reverse-geocode of its centre
 * on page load). The fields below are OPTIONAL manual overrides — leave them
 * blank / null to auto-detect.
 *
 *   polygon      The coverage area as an ordered list of [latitude, longitude]
 *                vertices (5 or more). Leave the ring OPEN — do NOT repeat the
 *                first point; the app closes it automatically.
 *
 *   name         (optional) Force the area name shown in the UI.  "" = auto.
 *   region       (optional) Force the wider region in the footer.  "" = auto.
 *   center       (optional) [lat, lon] initial map view.          null = auto.
 *   nameZoom     (optional) Reverse-geocode zoom for auto-naming (default 12).
 *                Lower = broader (city); higher = more local (suburb/street).
 *
 * The default below is a 12-vertex polygon (~1.6 km radius) covering Auckland
 * City Centre, New Zealand, centred on ≈ 36.8485°S, 174.7633°E.
 */
export const ZONE = {
  polygon: [
    [-36.83400, 174.76330],
    [-36.83594, 174.77236],
    [-36.84125, 174.77899],
    [-36.84850, 174.78143],
    [-36.85575, 174.77899],
    [-36.86106, 174.77236],
    [-36.86306, 174.76330],
    [-36.86106, 174.75424],
    [-36.85575, 174.74761],
    [-36.84850, 174.74518],
    [-36.84125, 174.74761],
    [-36.83594, 174.75424],
  ],

  // Optional overrides — leave as-is to auto-detect everything from the polygon.
  name: "Auckland City Centre",
  region: "",
  center: null,
  nameZoom: 12,
};
