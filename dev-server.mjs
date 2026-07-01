import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const publicDirectory = process.env.PUBLIC_DIR || "public";
const root = decodeURIComponent(new URL(`./${publicDirectory}/`, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const port = Number(process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const path = normalize(join(root, requested));

  if (!path.startsWith(normalize(root))) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = (await stat(path)).isDirectory() ? join(path, "index.html") : path;
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Study Tracker online test: http://127.0.0.1:${port}`);
});
