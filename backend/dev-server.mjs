/**
 * Local development server — no AWS needed.
 * ---------------------------------------------------------------------------
 * Serves the static frontend from the repo root and routes /api/* to the same
 * Lambda handler that runs in AWS (with the in-memory cache, since TABLE_NAME
 * is unset). Run from the repo root:  node backend/dev-server.mjs
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handler } from "./src/handler.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 8000;

// Only these files are served — nothing else in the repo is exposed.
const STATIC_FILES = {
  "index.html": "text/html; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
  "app.js": "text/javascript; charset=utf-8",
  "api.js": "text/javascript; charset=utf-8",
  "api-config.js": "text/javascript; charset=utf-8",
  "config.js": "text/javascript; charset=utf-8",
  "geo.js": "text/javascript; charset=utf-8",
};

const server = http.createServer((req, res) => {
  serve(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal error");
  });
});

async function serve(req, res) {
  // Concatenate rather than resolve, so paths like "//x" can't be read as a host.
  const url = new URL(`http://localhost${req.url}`);

  if (url.pathname.startsWith("/api/")) {
    const result = await handler({
      httpMethod: req.method,
      path: url.pathname.slice("/api".length),
      headers: req.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
    });
    res.writeHead(result.statusCode, result.headers).end(result.body);
    return;
  }

  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!Object.hasOwn(STATIC_FILES, file)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const body = await readFile(path.join(ROOT, file));
  res.writeHead(200, { "Content-Type": STATIC_FILES[file], "Cache-Control": "no-store" }).end(body);
}

server.listen(PORT, () => console.log(`Address checker running at http://localhost:${PORT}`));
