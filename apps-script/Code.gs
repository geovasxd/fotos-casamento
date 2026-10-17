/**
 * Copia as fotos do Supabase Storage para pastas do Google Drive.
 * Roda como a conta Google dona do script (sem OAuth client, sem expirar).
 *
 * Propriedades do script (Configurações do projeto > Propriedades do script):
 *   SUPABASE_KEY = chave secreta do Supabase (sb_secret_... / service_role)
 *
 * Uso: rode instalarGatilho() uma vez. Depois sincronizar() roda a cada 15 min.
 * Só copia arquivos novos; nunca apaga nada no Drive.
 */

const SUPABASE_URL = "https://hwepfyjipnwusjbtelcr.supabase.co";
const BUCKET = "fotos-casamento";

// pasta do Supabase (valor de ?e=) -> ID da pasta no Drive
const EVENTOS = {
  "7646c3cabd95e59fab53bbae5a6c0fdc": "1l0mrBi_LjFemUWEWLfN3LUK_mi_rPCah", // Fotos Casamento
  "3726a2f810a1948920bf609baefd59c0": "13mxaWd2IoCAoBMZwElgWjbBw1I2klzpb", // Despedida de Solteiro
};

const PAGE = 100;
const BUDGET_MS = 5 * 60 * 1000; // o Apps Script corta em 6 min

function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sincronizar").timeBased().everyMinutes(15).create();
}

function sincronizar() {
  const key = PropertiesService.getScriptProperties().getProperty("SUPABASE_KEY");
  if (!key) throw new Error("Falta a propriedade SUPABASE_KEY");
  const headers = { Authorization: "Bearer " + key, apikey: key };
  const inicio = Date.now();
  let copiadas = 0;

  for (const prefixo of Object.keys(EVENTOS)) {
    const pasta = DriveApp.getFolderById(EVENTOS[prefixo]);
    const existentes = new Set();
    const it = pasta.getFiles();
    while (it.hasNext()) existentes.add(it.next().getName());

    for (let offset = 0; ; offset += PAGE) {
      const lista = listar(headers, prefixo, offset);
      for (const obj of lista) {
        if (Date.now() - inicio > BUDGET_MS) {
          console.log("Tempo esgotado; continua na próxima execução. Copiadas: " + copiadas);
          return;
        }
        if (!obj.id || obj.name.startsWith(".") || existentes.has(obj.name)) continue;
        const blob = baixar(headers, prefixo + "/" + obj.name);
        const mime = (obj.metadata && obj.metadata.mimetype) || blob.getContentType();
        pasta.createFile(blob.setName(obj.name).setContentType(mime));
        existentes.add(obj.name);
        copiadas++;
      }
      if (lista.length < PAGE) break;
    }
  }
  console.log("Concluído. Copiadas: " + copiadas);
}

function listar(headers, prefixo, offset) {
  const r = UrlFetchApp.fetch(SUPABASE_URL + "/storage/v1/object/list/" + BUCKET, {
    method: "post",
    contentType: "application/json",
    headers,
    payload: JSON.stringify({ prefix: prefixo, limit: PAGE, offset, sortBy: { column: "name", order: "asc" } }),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error("Listagem falhou: " + r.getResponseCode() + " " + r.getContentText());
  return JSON.parse(r.getContentText());
}

function baixar(headers, caminho) {
  const url = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + caminho.split("/").map(encodeURIComponent).join("/");
  const r = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Download falhou (" + caminho + "): " + r.getResponseCode());
  return r.getBlob();
}
