/**
 * Address API client.
 * ---------------------------------------------------------------------------
 * The browser never calls a geocoder directly: every lookup goes through our
 * API (API Gateway → Lambda), which validates, throttles and caches it.
 * Every place comes back as { label, lat, lon, kind }, with `label` already
 * written in NZ address format.
 *
 * Temporary failures (network error, throttling, geocoder down) are retried
 * up to MAX_RETRIES times with exponential backoff before giving up; the
 * thrown ApiError then has `retryable: true` so the UI can offer "Try again".
 */
import { API_BASE } from "./api-config.js";

export const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1 s, 2 s, 4 s (± 20% jitter)
// 429 = throttled by API Gateway; 502/503/504 = geocoder unavailable or slow.
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export class ApiError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function buildUrl(path, params) {
  const url = new URL(API_BASE.replace(/\/$/, "") + path, window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  }
  return url;
}

async function request(url, signal) {
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Couldn’t reach the address service. Please check your connection.", { retryable: true });
  }

  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;

  const message =
    res.status === 429
      ? "Too many requests. Please wait a moment and try again."
      : body.error || body.message || `The address service returned ${res.status}.`;
  throw new ApiError(message, { status: res.status, retryable: RETRYABLE_STATUS.has(res.status) });
}

const backoff = (attempt) =>
  new Promise((resolve) =>
    setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt * (0.8 + Math.random() * 0.4))
  );

/**
 * GET a JSON endpoint. With `retries`, temporary failures are retried;
 * `onRetry(n, total)` is called before retry n so the UI can show progress.
 */
async function getJson(path, params, { signal, retries = 0, onRetry } = {}) {
  const url = buildUrl(path, params);
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(url, signal);
    } catch (err) {
      if (!err.retryable || attempt >= retries) throw err;
      onRetry?.(attempt + 1, retries);
      await backoff(attempt);
    }
  }
}

/**
 * Autocomplete: up to 6 NZ places matching partial input. Not retried — the
 * next keystroke supersedes it anyway, and the user can still press Check.
 */
export async function suggestAddresses(query, near, signal) {
  return (await getJson("/suggest", { q: query, near }, { signal })).results || [];
}

/** Full geocode: 0 (not found), 1 (match) or several (ambiguous) places. */
export async function geocodeAddress(query, near, { onRetry } = {}) {
  return (await getJson("/geocode", { q: query, near }, { retries: MAX_RETRIES, onRetry })).results || [];
}

/** Coordinates → { name, region }. Used once on load to name the zone. */
export async function reverseGeocode(lat, lon, zoom = 12) {
  return getJson("/reverse", { lat: lat.toFixed(6), lon: lon.toFixed(6), zoom }, { retries: MAX_RETRIES });
}
