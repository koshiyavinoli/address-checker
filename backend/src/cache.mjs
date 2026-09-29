/**
 * Two-level cache for geocoder responses.
 * ---------------------------------------------------------------------------
 *   L1  in-memory Map, per warm Lambda container (free, lost on cold start).
 *   L2  DynamoDB table shared by all containers, when TABLE_NAME is set.
 *
 * Items expire through DynamoDB TTL (`expiresAt`, epoch seconds). TTL deletion
 * is lazy, so expiry is also checked on read. Cache failures never fail the
 * request — they just fall through to the upstream geocoder.
 */

const TABLE_NAME = process.env.TABLE_NAME || "";
const KEY_PREFIX = "v1#"; // bump to invalidate everything after a format change
const L1_MAX_ENTRIES = 500;

const memory = new Map();
let dynamo = null;

async function db() {
  if (!dynamo) {
    // Loaded lazily so local development needs no AWS SDK install
    // (the Lambda Node.js runtime ships the SDK).
    const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient, GetCommand, PutCommand } = await import("@aws-sdk/lib-dynamodb");
    dynamo = { doc: DynamoDBDocumentClient.from(new DynamoDBClient({})), GetCommand, PutCommand };
  }
  return dynamo;
}

function remember(key, value, expiresAt) {
  memory.delete(key);
  memory.set(key, { value, expiresAt });
  if (memory.size > L1_MAX_ENTRIES) memory.delete(memory.keys().next().value); // oldest
}

/**
 * Return the cached value for `key`, or compute, store and return it.
 * `ttlFor(value)` gives the lifetime in seconds (e.g. shorter for empty results).
 */
export async function cached(key, compute, ttlFor) {
  const pk = KEY_PREFIX + key;
  const now = Math.floor(Date.now() / 1000);

  const local = memory.get(pk);
  if (local && local.expiresAt > now) return local.value;

  if (TABLE_NAME) {
    try {
      const { doc, GetCommand } = await db();
      const { Item } = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: { pk } }));
      if (Item && Item.expiresAt > now) {
        remember(pk, Item.value, Item.expiresAt);
        return Item.value;
      }
    } catch (err) {
      console.warn("Cache read failed", err);
    }
  }

  const value = await compute();
  const expiresAt = now + ttlFor(value);
  remember(pk, value, expiresAt);

  if (TABLE_NAME) {
    try {
      const { doc, PutCommand } = await db();
      await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: { pk, value, expiresAt } }));
    } catch (err) {
      console.warn("Cache write failed", err);
    }
  }
  return value;
}

/** Test helper: empty the in-memory cache. */
export function clearMemoryCache() {
  memory.clear();
}
