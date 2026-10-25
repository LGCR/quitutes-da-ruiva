-- Cada sabor do cardápio vem em mais de um tamanho (500 g e 100 g).
-- Cada tamanho continua sendo um produto (preço e receita próprios); `sabor` agrupa no formulário.

alter table products
  add column sabor   text,
  add column tamanho text;

update products set sabor = nome where sabor is null;

drop view v_resumo_sabores;
create view v_resumo_sabores with (security_invoker = true) as
select
  p.id as product_id,
  p.nome,
  p.sabor,
  p.tamanho,
  coalesce(sum(oi.qtd) filter (where o.status in ('confirmado', 'entregue')), 0)::int as qtd_confirmado,
  coalesce(sum(oi.qtd) filter (where o.status = 'pendente'), 0)::int                  as qtd_pendente,
  coalesce(sum(oi.qtd * oi.preco_unit_centavos) filter (where o.status in ('confirmado', 'entregue')), 0)::bigint as receita_confirmada_centavos
from products p
left join order_items oi on oi.product_id = p.id
left join orders o on o.id = oi.order_id
group by p.id
order by p.ordem, p.nome;
