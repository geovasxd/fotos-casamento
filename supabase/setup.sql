-- Configuração do Storage para o álbum do casamento.
-- Executar uma vez no SQL Editor do projeto Supabase. Pode ser executado de novo
-- com segurança: atualiza o bucket e recria a policy.
-- Não cria tabelas. Os valores de bucket e pasta precisam ser idênticos aos do CONFIG em index.html.

-- Bucket privado, com limite de tamanho e de tipo aplicados pelo servidor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos-casamento',
  'fotos-casamento',
  false,
  20971520, -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Convidados (chave publishable, papel anon) só podem CRIAR arquivos,
-- e só diretamente dentro da pasta aleatória do evento.
-- Sem policies de select/update/delete: ninguém com a chave pública lista, baixa,
-- sobrescreve ou apaga fotos. Os noivos acessam pelo painel do Supabase.
drop policy if exists "convidados_enviam_fotos" on storage.objects;
create policy "convidados_enviam_fotos"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'fotos-casamento'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] in (
    '7646c3cabd95e59fab53bbae5a6c0fdc', -- casamento
    '3726a2f810a1948920bf609baefd59c0', -- despedida de solteiro
    'keepalive'                         -- pings do workflow keepalive-supabase.yml (não vai ao Drive)
  )
);

-- Conferência: deve retornar 1 linha com public = false, 20971520 e os 5 tipos.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'fotos-casamento';
