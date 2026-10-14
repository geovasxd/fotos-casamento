// Teste real contra o Supabase Storage, com a mesma URL/chave/bucket/pasta do index.html.
// Verifica que as regras valem NO SERVIDOR (não só no frontend).
// Uso: node --test tests/storage.test.mjs
// Deixa no bucket arquivos "teste-*.jpg"/"teste-*.png" (o papel anon não consegue apagar);
// apague-os pelo painel antes do evento.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, root, log, randomHex } from "./helpers.mjs";

const jpeg = readFileSync(join(root, "tests", "fixtures", "foto-teste.jpg"));
const png = readFileSync(join(root, "tests", "fixtures", "foto-teste.png"));
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + randomHex(4);
const uploaded = [];

function api(path) {
  return `${config.supabaseUrl}/storage/v1/${path}`;
}

function headers(extra = {}) {
  return { apikey: config.supabaseKey, ...extra };
}

async function call(method, path, { body, contentType, extraHeaders } = {}) {
  const h = headers(extraHeaders);
  if (contentType) h["content-type"] = contentType;
  const res = await fetch(api(path), { method, headers: h, body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (parseErr) {
    // Resposta não-JSON (ex.: binário de download) é esperada em alguns casos; registra e segue com o texto.
    log("info", "response.not_json", { method, path, status: res.status, parseError: parseErr.message });
  }
  log("info", "storage.call", { method, path, status: res.status, body: json ?? text.slice(0, 200) });
  return { status: res.status, json, text };
}

function upload(objectPath, body, contentType, extraHeaders = {}) {
  return call("POST", `object/${config.bucket}/${objectPath}`, {
    body,
    contentType,
    extraHeaders: { "x-upsert": "false", ...extraHeaders },
  });
}

function assertDenied(r, label) {
  assert.ok(r.status >= 400, `${label}: esperado erro, veio ${r.status} ${r.text.slice(0, 200)}`);
}

before(() => {
  assert.ok(config.supabaseUrl, "CONFIG.supabaseUrl vazio em index.html");
  assert.ok(config.supabaseKey, "CONFIG.supabaseKey vazio em index.html");
  assert.match(config.supabaseUrl, /^https:\/\/[a-z0-9]+\.supabase\.co$/, "supabaseUrl deve ser https://<ref>.supabase.co");
  assert.doesNotMatch(config.supabaseKey, /^sb_secret_/, "chave secreta não pode ir no index.html");
});

test("convidado envia JPEG válido para a pasta do evento", async () => {
  const p = `${config.folder}/teste-${runId}.jpg`;
  const r = await upload(p, jpeg, "image/jpeg");
  assert.equal(r.status, 200, r.text);
  uploaded.push(p);
});

test("convidado envia PNG válido para a pasta do evento", async () => {
  const p = `${config.folder}/teste-${runId}.png`;
  const r = await upload(p, png, "image/png");
  assert.equal(r.status, 200, r.text);
  uploaded.push(p);
});

test("não sobrescreve arquivo existente (mesmo caminho)", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await upload(uploaded[0], png, "image/jpeg");
  assertDenied(r, "reenvio no mesmo caminho");
});

test("upsert é bloqueado (sem policy de select/update)", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await upload(uploaded[0], png, "image/jpeg", { "x-upsert": "true" });
  assertDenied(r, "upsert");
});

test("bloqueia envio fora da pasta do evento", async () => {
  const r = await upload(`${randomHex(16)}/teste-${runId}.jpg`, jpeg, "image/jpeg");
  assertDenied(r, "outra pasta");
});

test("bloqueia envio na raiz do bucket", async () => {
  const r = await upload(`teste-${runId}.jpg`, jpeg, "image/jpeg");
  assertDenied(r, "raiz");
});

test("bloqueia subpasta dentro da pasta do evento", async () => {
  const r = await upload(`${config.folder}/sub/teste-${runId}.jpg`, jpeg, "image/jpeg");
  assertDenied(r, "subpasta");
});

test("bucket recusa tipo não permitido (text/plain)", async () => {
  const r = await upload(`${config.folder}/teste-${runId}.txt`, Buffer.from("não é imagem"), "text/plain");
  assertDenied(r, "text/plain");
  assert.match(r.text, /mime/i);
});

test("bucket recusa tipo não permitido (image/gif)", async () => {
  const r = await upload(`${config.folder}/teste-${runId}.gif`, jpeg, "image/gif");
  assertDenied(r, "image/gif");
  assert.match(r.text, /mime/i);
});

test("bucket recusa arquivo acima de 20 MB", async () => {
  const big = Buffer.alloc(config.maxFileBytes + 1024);
  jpeg.copy(big, 0, 0, 4);
  const r = await upload(`${config.folder}/teste-${runId}-grande.jpg`, big, "image/jpeg");
  assertDenied(r, "arquivo grande");
  assert.match(r.text, /size|large/i);
});

test("convidado não consegue listar a pasta", async () => {
  const r = await call("POST", `object/list/${config.bucket}`, {
    body: JSON.stringify({ prefix: config.folder, limit: 100, offset: 0 }),
    contentType: "application/json",
  });
  if (r.status === 200) assert.deepEqual(r.json, [], "listagem deveria vir vazia");
  else assertDenied(r, "listagem");
});

test("convidado não consegue baixar foto (rota autenticada)", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await call("GET", `object/authenticated/${config.bucket}/${uploaded[0]}`);
  assertDenied(r, "download autenticado");
});

test("foto não é pública (rota pública)", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await call("GET", `object/public/${config.bucket}/${uploaded[0]}`);
  assertDenied(r, "download público");
});

test("convidado não consegue gerar link assinado", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await call("POST", `object/sign/${config.bucket}/${uploaded[0]}`, {
    body: JSON.stringify({ expiresIn: 60 }),
    contentType: "application/json",
  });
  assertDenied(r, "link assinado");
});

test("convidado não consegue apagar foto", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await call("DELETE", `object/${config.bucket}`, {
    body: JSON.stringify({ prefixes: [uploaded[0]] }),
    contentType: "application/json",
  });
  if (r.status === 200) assert.deepEqual(r.json, [], "nada deveria ter sido apagado");
  else assertDenied(r, "apagar");
  // Confirma que o arquivo continua lá: reenvio no mesmo caminho ainda é recusado como duplicado.
  const again = await upload(uploaded[0], jpeg, "image/jpeg");
  assertDenied(again, "arquivo deveria continuar existindo");
  assert.match(again.text, /exists|duplicate/i);
});

test("convidado não consegue sobrescrever com PUT", async () => {
  assert.ok(uploaded[0], "depende do primeiro upload");
  const r = await call("PUT", `object/${config.bucket}/${uploaded[0]}`, { body: png, contentType: "image/jpeg" });
  assertDenied(r, "PUT");
});

test("convidado não consegue criar bucket", async () => {
  const r = await call("POST", "bucket", {
    body: JSON.stringify({ id: `teste-${randomHex(4)}`, name: `teste-${randomHex(4)}`, public: true }),
    contentType: "application/json",
  });
  assertDenied(r, "criar bucket");
});

test("resumo: arquivos de teste deixados no bucket", () => {
  log("info", "test.files_to_delete", { bucket: config.bucket, files: uploaded });
  assert.equal(uploaded.length, 2);
});
