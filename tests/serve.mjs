// Servidor estático mínimo para testar index.html no computador e no celular (mesma rede Wi-Fi).
// Uso: node tests/serve.mjs   (porta padrão 8080; outra porta: PORT=9000 node tests/serve.mjs)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8080);

function log(level, event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path !== "/" && path !== "/index.html") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Não encontrado");
    log("warn", "http.not_found", { path });
    return;
  }
  try {
    const body = await readFile(join(root, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
    log("info", "http.ok", { path, ua: req.headers["user-agent"] });
  } catch (err) {
    log("error", "http.read_failed", { path, error: { name: err.name, message: err.message, stack: err.stack } });
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Erro interno");
  }
});

server.on("error", (err) => {
  log("error", "server.error", { error: { name: err.name, message: err.message, stack: err.stack } });
  process.exitCode = 1;
});

server.listen(port, "0.0.0.0", () => {
  const urls = [`http://localhost:${port}/`];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) urls.push(`http://${ni.address}:${port}/`);
    }
  }
  log("info", "server.listening", { urls });
});
