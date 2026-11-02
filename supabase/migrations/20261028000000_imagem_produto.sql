-- Foto de cada item do cardápio, guardada no próprio banco (base64).
-- O Worker serve a imagem em /api/produtos/:id/imagem; o catálogo só leva a data da última troca.

alter table products
  add column imagem_base64         text,
  add column imagem_tipo           text check (imagem_tipo in ('image/jpeg', 'image/png', 'image/webp')),
  add column imagem_atualizada_em  timestamptz;
