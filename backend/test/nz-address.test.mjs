import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNzAddress } from "../src/nz-address.mjs";

test("street address: number street, suburb, city postcode", () => {
  assert.equal(
    formatNzAddress({ number: "1", street: "Queen Street", suburb: "Auckland Central", city: "Auckland", postcode: "1010" }),
    "1 Queen Street, Auckland Central, Auckland 1010"
  );
});

test("unit is written as unit/number", () => {
  assert.equal(
    formatNzAddress({ unit: "2", number: "15", street: "Queen Street", city: "Auckland", postcode: "1010" }),
    "2/15 Queen Street, Auckland 1010"
  );
});

test("named place leads; street-only name is not repeated", () => {
  assert.equal(
    formatNzAddress({ name: "Sky Tower", number: "72", street: "Victoria Street West", suburb: "Auckland Central", city: "Auckland", postcode: "1010" }),
    "Sky Tower, 72 Victoria Street West, Auckland Central, Auckland 1010"
  );
  assert.equal(
    formatNzAddress({ name: "Queen Street", street: "Queen Street", suburb: "Auckland Central", city: "Auckland" }),
    "Queen Street, Auckland Central, Auckland"
  );
});

test("suburb equal to city and duplicate region are dropped", () => {
  assert.equal(formatNzAddress({ name: "Auckland", suburb: "Auckland", region: "Auckland" }), "Auckland");
  assert.equal(formatNzAddress({ name: "Ponsonby", city: "Auckland", postcode: "1011" }), "Ponsonby, Auckland 1011");
});

test("Auckland local-board names are written as Auckland", () => {
  assert.equal(
    formatNzAddress({ street: "High Street", suburb: "Devonport", city: "Devonport-Takapuna", region: "Auckland", postcode: "0624" }),
    "High Street, Devonport, Auckland 0624"
  );
  // Papakura is a postal town as well as a local board.
  assert.equal(
    formatNzAddress({ street: "Queen Street", suburb: "Pahurehure", city: "Papakura", region: "Auckland", postcode: "2110" }),
    "Queen Street, Pahurehure, Papakura 2110"
  );
  // Same name outside Auckland is untouched.
  assert.equal(formatNzAddress({ name: "Howick", city: "Howick", region: "Somewhere" }), "Howick");
});

test("falls back to region when there is no town/city", () => {
  assert.equal(formatNzAddress({ number: "5", street: "Rural Road", region: "Canterbury", postcode: "7671" }), "5 Rural Road, Canterbury 7671");
});
