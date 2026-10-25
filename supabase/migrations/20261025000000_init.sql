-- Quitutes da Ruiva: pré-venda de panetones
-- Todas as tabelas ficam com RLS ligado e sem policies: só o Worker (service role) lê e escreve.

-- Cardápio --------------------------------------------------------------------

create table products (
  id              text primary key,                -- slug, ex.: 'chocotone'
  nome            text not null,
  descricao       text,
  peso_g          int check (peso_g > 0),
  preco_centavos  int not null check (preco_centavos >= 0),
  qtd_minima      int not null default 1 check (qtd_minima >= 1),
  ativo           boolean not null default true,
  ordem           int not null default 0,
  created_at      timestamptz not null default now()
);

create table ingredients (
  id                 bigint generated always as identity primary key,
  nome               text not null unique,
  unidade            text not null check (unidade in ('g', 'ml', 'un')),
  tamanho_embalagem  numeric check (tamanho_embalagem > 0),   -- ex.: 1000 (g) para pacote de 1 kg
  nome_embalagem     text                                     -- ex.: 'pacote 1 kg'
);

-- Quanto de cada ingrediente vai em UMA unidade do produto
create table recipe_items (
  product_id       text   not null references products (id) on delete cascade,
  ingredient_id    bigint not null references ingredients (id) on delete restrict,
  qtd_por_unidade  numeric not null check (qtd_por_unidade > 0),
  primary key (product_id, ingredient_id)
);

create table datas_entrega (
  id      text primary key,          -- ex.: '19-20-dez' (sem barra, vai na URL do admin)
  rotulo  text not null,             -- ex.: 'Sábado 19 ou domingo 20 de dezembro'
  ativo   boolean not null default true,
  ordem   int not null default 0
);

-- Pedidos ---------------------------------------------------------------------

create sequence order_codigo_seq start 101;

create table orders (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique default 'QR-' || lpad(nextval('order_codigo_seq')::text, 4, '0'),
  nome             text not null,
  telefone         text not null,               -- 55DDDNÚMERO, só dígitos
  telefone_chave   text not null,               -- 55 + DDD + últimos 8 dígitos (ignora o nono dígito)
  tipo_entrega     text not null check (tipo_entrega in ('retirada', 'entrega')),
  endereco         text,
  data_entrega_id  text not null references datas_entrega (id),
  obs              text,
  pagamento        text check (pagamento in ('pix', 'dinheiro', 'cartao')),
  status           text not null default 'pendente'
                   check (status in ('pendente', 'confirmado', 'substituido', 'cancelado', 'entregue')),
  total_centavos   int not null,
  optin_whatsapp   boolean not null default false,
  whatsapp_status  text not null default 'pendente' check (whatsapp_status in ('pendente', 'enviado', 'falhou', 'sem_optin')),
  whatsapp_erro    text,
  edit_token       uuid not null unique default gen_random_uuid(),
  substitui_id     uuid references orders (id),
  confirmado_em    timestamptz,
  created_at       timestamptz not null default now()
);
create index orders_telefone_chave_idx on orders (telefone_chave, created_at desc);
create index orders_status_idx on orders (status);

create table order_items (
  order_id             uuid not null references orders (id) on delete cascade,
  product_id           text not null references products (id),
  qtd                  int  not null check (qtd > 0),
  preco_unit_centavos  int  not null,
  primary key (order_id, product_id)
);

-- WhatsApp --------------------------------------------------------------------

create table conversations (
  telefone_chave   text primary key,
  jid              text not null,               -- para onde o bot responde
  order_id         uuid not null references orders (id) on delete cascade,
  step             text not null
                   check (step in ('aguardando_confirmacao', 'aguardando_pagamento', 'alterando', 'confirmado', 'humano')),
  poll_message_id  text,
  poll_options     jsonb not null default '[]',
  ultimo_help_em   timestamptz,
  updated_at       timestamptz not null default now()
);
create index conversations_poll_idx on conversations (poll_message_id);

-- Ids de mensagens já tratadas pelo webhook (a Evolution pode reenviar eventos)
create table processed_messages (
  id          text primary key,
  created_at  timestamptz not null default now()
);

alter table products           enable row level security;
alter table ingredients        enable row level security;
alter table recipe_items       enable row level security;
alter table datas_entrega      enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table conversations      enable row level security;
alter table processed_messages enable row level security;

-- Relatórios ------------------------------------------------------------------

-- Lista de compras: soma dos ingredientes dos pedidos confirmados,
-- e a projeção incluindo os pendentes (ainda não responderam no WhatsApp).
create view v_lista_compras with (security_invoker = true) as
select
  i.id                as ingredient_id,
  i.nome,
  i.unidade,
  i.tamanho_embalagem,
  i.nome_embalagem,
  coalesce(sum(oi.qtd * ri.qtd_por_unidade) filter (where o.status in ('confirmado', 'entregue')), 0) as total_confirmado,
  coalesce(sum(oi.qtd * ri.qtd_por_unidade) filter (where o.status in ('confirmado', 'entregue', 'pendente')), 0) as total_com_pendentes,
  ceil(coalesce(sum(oi.qtd * ri.qtd_por_unidade) filter (where o.status in ('confirmado', 'entregue')), 0)
       / nullif(i.tamanho_embalagem, 0)) as embalagens_confirmado,
  ceil(coalesce(sum(oi.qtd * ri.qtd_por_unidade) filter (where o.status in ('confirmado', 'entregue', 'pendente')), 0)
       / nullif(i.tamanho_embalagem, 0)) as embalagens_com_pendentes
from ingredients i
left join recipe_items ri on ri.ingredient_id = i.id
left join order_items oi on oi.product_id = ri.product_id
left join orders o on o.id = oi.order_id
group by i.id
order by i.nome;

create view v_resumo_sabores with (security_invoker = true) as
select
  p.id as product_id,
  p.nome,
  coalesce(sum(oi.qtd) filter (where o.status in ('confirmado', 'entregue')), 0)::int as qtd_confirmado,
  coalesce(sum(oi.qtd) filter (where o.status = 'pendente'), 0)::int                  as qtd_pendente,
  coalesce(sum(oi.qtd * oi.preco_unit_centavos) filter (where o.status in ('confirmado', 'entregue')), 0)::bigint as receita_confirmada_centavos
from products p
left join order_items oi on oi.product_id = p.id
left join orders o on o.id = oi.order_id
group by p.id
order by p.ordem, p.nome;

-- Criação do pedido -----------------------------------------------------------
-- Recalcula preços no banco e, se vier edit_token, marca o pedido antigo como substituído.
-- Tudo numa transação só.

create or replace function criar_pedido(p jsonb) returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  novo     orders;
  item     jsonb;
  prod     products;
  qtd      int;
  total    int := 0;
  antigo   uuid;
begin
  if jsonb_typeof(p -> 'itens') <> 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'sem_itens';
  end if;

  if not exists (select 1 from datas_entrega where id = p ->> 'data_entrega_id' and ativo) then
    raise exception 'data_invalida';
  end if;

  for item in select * from jsonb_array_elements(p -> 'itens') loop
    select * into prod from products where id = item ->> 'product_id' and ativo;
    if not found then
      raise exception 'produto_invalido:%', item ->> 'product_id';
    end if;
    qtd := (item ->> 'qtd')::int;
    if qtd < prod.qtd_minima or qtd > 100 then
      raise exception 'qtd_invalida:%', prod.id;
    end if;
    total := total + prod.preco_centavos * qtd;
  end loop;

  if nullif(p ->> 'edit_token', '') is not null then
    update orders set status = 'substituido'
     where edit_token = (p ->> 'edit_token')::uuid
       and status in ('pendente', 'confirmado')
    returning id into antigo;
  end if;

  insert into orders (nome, telefone, telefone_chave, tipo_entrega, endereco, data_entrega_id,
                      obs, total_centavos, optin_whatsapp, substitui_id)
  values (p ->> 'nome', p ->> 'telefone', p ->> 'telefone_chave', p ->> 'tipo_entrega',
          nullif(p ->> 'endereco', ''), p ->> 'data_entrega_id', nullif(p ->> 'obs', ''),
          total, coalesce((p ->> 'optin_whatsapp')::boolean, false), antigo)
  returning * into novo;

  insert into order_items (order_id, product_id, qtd, preco_unit_centavos)
  select novo.id, pr.id, (x ->> 'qtd')::int, pr.preco_centavos
    from jsonb_array_elements(p -> 'itens') x
    join products pr on pr.id = x ->> 'product_id';

  return novo;
end;
$$;

revoke execute on function criar_pedido(jsonb) from public, anon, authenticated;
grant execute on function criar_pedido(jsonb) to service_role;
