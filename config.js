/**
 * Coverage zone configuration.
 * ---------------------------------------------------------------------------
 * In the common case you only edit ONE thing: the `polygon` vertices.
 *
 * The area name, wider region, map centre and geocoding country-bias are all
 * derived automatically from the polygon (via a one-time reverse-geocode of its
 * centre on page load). The fields below are OPTIONAL manual overrides — leave
 * them blank / null to auto-detect.
 *
 *   polygon      The coverage area as an ordered list of [latitude, longitude]
 *                vertices (5 or more). Leave the ring OPEN — do NOT repeat the
 *                first point; the app closes it automatically.
 *
 *   name         (optional) Force the area name shown in the UI.  "" = auto.
 *   region       (optional) Force the wider region in the footer.  "" = auto.
 *   countryCode  (optional) ISO 3166-1 alpha-2 code to bias geocoding
 *                (e.g. "lk", "us").                                "" = auto.
 *   center       (optional) [lat, lon] initial map view.          null = auto.
 *   nameZoom     (optional) Reverse-geocode zoom for auto-naming (default 12).
 *                Lower = broader (city); higher = more local (suburb/street).
 *
 * The default below is a 12-vertex polygon (~1.6 km radius) covering the Nugegoda
 * area, a suburb of Colombo, Sri Lanka, centred on ≈ 6.870°N, 79.893°E. The
 * vertices are spaced around the centre to form a rounded coverage zone.
 */
export const ZONE = {
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

  // Optional overrides — leave as-is to auto-detect everything from the polygon.
  name: "",
  region: "",
  countryCode: "",
  center: null,
  nameZoom: 12,
};
