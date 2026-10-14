// Testes de consistência entre index.html e supabase/setup.sql (e integridade do CDN).
// Uso: node --test tests/config.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { config, indexHtml, setupSql } from "./helpers.mjs";

test("pasta do evento é aleatória (32 caracteres hex)", () => {
  assert.match(config.folder, /^[0-9a-f]{32}$/);
});

test("bucket e pasta iguais no index.html e no setup.sql", () => {
  assert.ok(setupSql.includes(`'${config.bucket}'`), "bucket ausente no setup.sql");
  assert.ok(setupSql.includes(`(storage.foldername(name))[1] = '${config.folder}'`), "pasta ausente na policy");
});

test("bucket é privado no setup.sql", () => {
  const m = setupSql.match(/values\s*\(\s*'[^']+',\s*'[^']+',\s*(true|false),/);
  assert.ok(m, "insert do bucket não encontrado");
  assert.equal(m[1], "false");
});

test("limite de tamanho igual no frontend e no bucket", () => {
  const m = setupSql.match(/false,\s*(\d+),/);
  assert.ok(m, "file_size_limit não encontrado");
  assert.equal(Number(m[1]), config.maxFileBytes);
  assert.equal(config.maxFileBytes, 20 * 1024 * 1024);
});

test("tipos aceitos iguais no frontend e no bucket", () => {
  const sqlTypes = setupSql.match(/array\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)).sort();
  const block = indexHtml.match(/const MIME_TO_EXT = \{([\s\S]*?)\};/)[1];
  const htmlTypes = [...block.matchAll(/"(image\/[a-z]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(htmlTypes, sqlTypes);
});

test("policy só concede INSERT para anon (sem select/update/delete)", () => {
  const policies = [...setupSql.matchAll(/create policy[\s\S]*?;/gi)].map((m) => m[0]);
  assert.equal(policies.length, 1);
  assert.match(policies[0], /for insert\s+to anon/);
});

test("chave do index.html não é secreta", () => {
  const key = config.supabaseKey;
  assert.doesNotMatch(key, /^sb_secret_/);
  // Chave legada (JWT): o papel precisa ser anon, nunca service_role.
  if (key.startsWith("eyJ")) {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    assert.equal(payload.role, "anon");
  }
  // Nenhum valor sb_secret_ literal em lugar nenhum da página.
  assert.doesNotMatch(indexHtml, /sb_secret_[A-Za-z0-9]/);
});

test("upload nunca sobrescreve (upsert: false)", () => {
  assert.match(indexHtml, /upsert:\s*false/);
  assert.doesNotMatch(indexHtml, /upsert:\s*true/);
});

test("sem catch vazio no index.html", () => {
  assert.doesNotMatch(indexHtml, /catch\s*(\([^)]*\))?\s*\{\s*\}/);
});

test("supabase-js do CDN bate com o hash SRI", async () => {
  const tag = indexHtml.match(/<script src="([^"]+)"\s+integrity="([^"]+)"/);
  assert.ok(tag, "script do CDN com integrity não encontrado");
  const [, src, integrity] = tag;
  assert.match(src, /@supabase\/supabase-js@\d+\.\d+\.\d+\//, "versão do CDN precisa ser fixa");
  const res = await fetch(src);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*", "CDN precisa liberar CORS para o SRI");
  const body = Buffer.from(await res.arrayBuffer());
  const hash = "sha384-" + createHash("sha384").update(body).digest("base64");
  assert.equal(hash, integrity);
});

test("sem getUserMedia; câmera via input capture", () => {
  assert.doesNotMatch(indexHtml, /getUserMedia/);
  assert.match(indexHtml, /<input[^>]*accept="image\/\*"[^>]*capture="environment"/);
  assert.match(indexHtml, /<input[^>]*accept="image\/\*"[^>]*multiple/);
});

test("compressão: lado maior 2048 e qualidade 0.8", () => {
  assert.match(indexHtml, /maxSide:\s*2048/);
  assert.match(indexHtml, /quality:\s*0\.8\b/);
});

test("pasta do evento lida do parâmetro ?e=", () => {
  assert.match(indexHtml, /get\("e"\)/);
});

test("sem TODO nem placeholder no index.html", () => {
  assert.doesNotMatch(indexHtml, /TODO|COLE_AQUI|your-project/i);
});

test("aviso para não fechar a página existe", () => {
  assert.match(indexHtml, /Não feche esta página enquanto houver fotos sendo enviadas/);
});

test("themeColor é #RRGGBB", () => {
  assert.match(indexHtml, /themeColor:\s*"#[0-9a-fA-F]{6}"/);
});
