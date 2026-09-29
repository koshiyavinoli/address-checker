/**
 * New Zealand address formatting.
 * ---------------------------------------------------------------------------
 * Follows the NZ Post addressing standard, written on one line:
 *
 *   [Unit/]Number Street, Suburb, Town/City Postcode
 *   e.g. "2/15 Queen Street, Auckland Central, Auckland 1010"
 *
 * The country is omitted because every result is domestic. Place results
 * without a street (a suburb, a landmark) keep their name as the first part.
 */

const clean = (s) => String(s ?? "").trim();

// OpenStreetMap often tags Auckland addresses with the council *local board*
// as the city ("Waitematā", "Devonport-Takapuna"). Postal addresses use
// "Auckland" there. Papakura and Waiheke are left alone: they are also postal
// towns.
const AUCKLAND_LOCAL_BOARDS = new Set([
  "albert-eden", "devonport-takapuna", "franklin", "great barrier", "henderson-massey",
  "hibiscus and bays", "howick", "kaipātiki", "māngere-ōtāhuhu", "manurewa",
  "maungakiekie-tāmaki", "ōrākei", "ōtara-papatoetoe", "puketāpapa", "rodney",
  "upper harbour", "waitākere ranges", "waitematā", "whau",
]);

export function normaliseCity(city, region) {
  const c = clean(city);
  if (clean(region).toLowerCase() === "auckland" && AUCKLAND_LOCAL_BOARDS.has(c.toLowerCase())) {
    return "Auckland";
  }
  return c;
}

export function formatNzAddress({
  name = "",
  unit = "",
  number = "",
  street = "",
  suburb = "",
  city = "",
  postcode = "",
  region = "",
} = {}) {
  [name, unit, number, street, suburb, postcode, region] =
    [name, unit, number, street, suburb, postcode, region].map(clean);
  city = normaliseCity(city, region);

  const houseNumber = unit && number ? `${unit}/${number}` : number;
  const streetLine = street ? [houseNumber, street].filter(Boolean).join(" ") : "";
  const cityLine = [city || region, postcode].filter(Boolean).join(" ");

  const parts = [];
  // A named place ("Sky Tower") leads, unless the name is just the street/area.
  if (name && ![street, streetLine, suburb, city, houseNumber].includes(name)) parts.push(name);
  if (streetLine) parts.push(streetLine);
  if (suburb && suburb !== city) parts.push(suburb);
  if (cityLine) parts.push(cityLine);

  // Drop exact repeats (e.g. a city name that is also the region).
  const seen = new Set();
  return parts
    .filter((part) => !seen.has(part.toLowerCase()) && seen.add(part.toLowerCase()))
    .join(", ");
}
