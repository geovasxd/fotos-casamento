// Lê a configuração real de index.html e supabase/setup.sql, para os testes
// sempre validarem exatamente o que vai para produção.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const indexHtml = readFileSync(join(root, "index.html"), "utf8");
export const setupSql = readFileSync(join(root, "supabase", "setup.sql"), "utf8");

function configString(key) {
  const m = indexHtml.match(new RegExp(`\\b${key}:\\s*"([^"]*)"`));
  if (!m) throw new Error(`CONFIG.${key} não encontrado em index.html`);
  return m[1];
}

function configExpr(key) {
  const m = indexHtml.match(new RegExp(`\\b${key}:\\s*([^,\\n]+),`));
  if (!m) throw new Error(`CONFIG.${key} não encontrado em index.html`);
  return m[1].trim();
}

export const config = {
  supabaseUrl: configString("supabaseUrl").replace(/\/+$/, ""),
  supabaseKey: configString("supabaseKey"),
  bucket: configString("bucket"),
  folder: configString("folder"),
  // Expressão numérica simples como "20 * 1024 * 1024"; só dígitos, espaços e "*".
  maxFileBytes: (() => {
    const expr = configExpr("maxFileBytes");
    if (!/^[\d\s*]+$/.test(expr)) throw new Error(`maxFileBytes inesperado: ${expr}`);
    return expr.split("*").reduce((acc, n) => acc * Number(n.trim()), 1);
  })(),
};

export function log(level, event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}

export function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}
