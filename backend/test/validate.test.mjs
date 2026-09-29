import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidationError, parseAddressQuery, parseLatLon, parseNear, parseZoom } from "../src/validate.mjs";

test("normalises whitespace and builds a lowercase cache key", () => {
  assert.deepEqual(parseAddressQuery("  1   Queen Street,\tAuckland "), {
    text: "1 Queen Street, Auckland",
    key: "1 queen street, auckland",
  });
});

test("accepts NZ address punctuation and macrons", () => {
  for (const q of ["2/15 Queen Street", "Flat 3, 12-14 St John's Road", "Ōtāhuhu", "Unit #4 (Rear) Kāpiti Rd & Main St"]) {
    assert.equal(parseAddressQuery(q).text, q);
  }
});

test("rejects empty, too short, too long, letterless and unsafe input", () => {
  for (const q of [undefined, "", "   ", "ab", "12345", "][')\\;", "<script>alert(1)</script>", "Queen St; DROP TABLE", "a".repeat(201)]) {
    assert.throws(() => parseAddressQuery(q), ValidationError, `expected rejection: ${q}`);
  }
});

test("lat/lon must be decimal numbers inside New Zealand", () => {
  assert.deepEqual(parseLatLon("-36.8485", "174.7633"), { lat: -36.8485, lon: 174.7633 });
  assert.deepEqual(parseLatLon("-43.95", "-176.55"), { lat: -43.95, lon: -176.55 }); // Chatham Islands
  for (const [lat, lon] of [["6.87", "79.89"], ["abc", "174"], ["-36.8", ""], ["1e3", "174"]]) {
    assert.throws(() => parseLatLon(lat, lon), ValidationError);
  }
});

test("near is optional and rounded for cache sharing", () => {
  assert.equal(parseNear(undefined), null);
  assert.deepEqual(parseNear("-36.84851,174.76333"), { lat: -36.85, lon: 174.76, key: "-36.85,174.76" });
  assert.throws(() => parseNear("-36.8"), ValidationError);
});

test("zoom defaults to 12 and must be 3..18", () => {
  assert.equal(parseZoom(undefined), 12);
  assert.equal(parseZoom("16"), 16);
  for (const z of ["2", "19", "12.5", "x"]) assert.throws(() => parseZoom(z), ValidationError);
});
