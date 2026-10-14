# Fotos do casamento

Página única para os convidados enviarem fotos da festa direto do celular, sem instalar nada.
As fotos vão para uma pasta de um bucket **privado** no Supabase Storage. Os noivos veem e baixam pelo painel do Supabase.

- `index.html` — a página inteira (HTML + CSS + JavaScript puro, supabase-js via CDN com versão fixa e hash SRI). Botões "Tirar foto" e "Escolher da galeria", compressão no celular (lado maior 2048 px, JPEG 0,8, sem EXIF/GPS), fila com retentativa automática e backoff.
- `supabase/setup.sql` — cria o bucket e a regra de acesso. Executar uma vez no SQL Editor do Supabase.
- `tests/` — testes de consistência, teste real de upload contra o Supabase e um servidor local para testar no celular.

Sem framework, sem build, sem backend, sem tabelas.

## Como funciona a segurança

| Regra | Onde é garantida |
|---|---|
| Só imagens JPEG, PNG, WEBP, HEIC, HEIF | Bucket (`allowed_mime_types`) e página |
| Máximo 20 MB por foto | Bucket (`file_size_limit`) e página |
| Convidado só **cria** arquivos, e só dentro da pasta do evento | Policy RLS `convidados_enviam_fotos` (INSERT para `anon`) |
| Convidado não lista, não baixa, não sobrescreve, não apaga | Ausência de policies de select/update/delete |
| Fotos não têm link público | Bucket `public = false` |
| Nome do arquivo não revela o nome original do celular | Página gera `pasta/AAAAMMDD-HHMMSS-<aleatório>.jpg` |
| Foto enviada sem metadados de localização | Re-codificação no canvas descarta EXIF/GPS (se a foto não puder ser re-codificada, ex.: HEIC no Chrome, vai o original) |

A pasta do evento tem nome aleatório (`7646c3cabd95e59fab53bbae5a6c0fdc`). Ela aparece no código da página,
então serve para organizar e dificultar acessos por engano, não como senha.

Limitações conhecidas:

- A chave *publishable* é pública por natureza: qualquer pessoa com o link pode enviar imagens para a pasta (sempre limitadas por tipo e tamanho).
- O tipo do arquivo é verificado pelo cabeçalho enviado; o servidor não inspeciona o conteúdo da imagem.
- Fotos de convidados são dado pessoal. O projeto adota bucket privado e pasta aleatória, mas **não garante conformidade total com a LGPD** — isso depende também de como os noivos guardam, compartilham e apagam as fotos depois.

## Plano Free do Supabase (sem alterar plano)

Segundo a página de preços do Supabase: 1 GB de armazenamento de arquivos, 5 GB de tráfego de saída, e
**projetos Free são pausados após 1 semana de inatividade**. Com o projeto pausado o envio falha.
Por isso, nos dias antes do casamento, entre no painel do projeto e faça um envio de teste pela página.

## Configuração

1. Executar `supabase/setup.sql` no SQL Editor do projeto.
2. Preencher no topo do `<script>` de `index.html` (objeto `CONFIG`):
   - `supabaseUrl`: `https://<ref>.supabase.co`
   - `supabaseKey`: chave **publishable** (`sb_publishable_...`). Nunca a secreta.
   - `coupleNames`, `eventDate`: textos exibidos no topo (opcionais). `themeColor`: cor dos botões (`#RRGGBB`).
   - Pasta do evento: vem de `?e=<pasta>` no link; sem `?e=` vale `folder`. A policy do `setup.sql` só aceita a pasta configurada, então `?e=` com outra pasta é recusado pelo servidor.
   Se mudar `bucket`, `folder` ou `maxFileBytes`, mude igual no `setup.sql` e execute de novo.

## Testes

Requer Node 20+ (sem dependências).

```sh
node --test tests/config.test.mjs    # consistência index.html x setup.sql e integridade do CDN
node --test tests/storage.test.mjs   # upload real + tentativas que o servidor TEM que bloquear
node --test "tests/*.test.mjs"       # os dois juntos
node tests/serve.mjs                 # abre a página em http://localhost:8080 e no IP da rede local
```

O teste real deixa dois arquivos `teste-*.jpg` / `teste-*.png` na pasta do evento (o papel anônimo não consegue apagar).
Apague-os pelo painel: Storage → `fotos-casamento` → pasta → selecionar → Delete.

## Logs

Todo log da página é uma linha JSON no console (`ts`, `level`, `event`, ...). Erros incluem `name`, `message`, `stack`
e, quando existir, `statusCode` e o erro de rede original.
