-- Dados iniciais: datas de entrega + cardápio de Natal (mesmo conteúdo de cardapio_natal.sql).

insert into datas_entrega (id, rotulo, ordem) values
  ('12-13-dez', 'Sábado 12 ou domingo 13 de dezembro', 1),
  ('19-20-dez', 'Sábado 19 ou domingo 20 de dezembro', 2),
  ('23-dez',     'Quarta, 23 de dezembro',              3);

-- Cardápio de Natal 2026 (arte em web/assets/cardapio.jpg): 5 sabores × 500 g e 100 g.
-- Pode rodar mais de uma vez. Os produtos entram INATIVOS e com preço 0:
-- preencha os preços no painel (/admin → Cardápio e receitas) e marque "Ativo".

update products set ativo = false, ordem = ordem + 100
 where id in ('tradicional', 'chocotone', 'doceleite', 'pistache', 'mini') and ordem < 100;

insert into products (id, sabor, tamanho, nome, descricao, peso_g, preco_centavos, qtd_minima, ativo, ordem) values
  ('frutas-500',               'Panetone de Frutas',                  '500 g', 'Panetone de Frutas 500 g',                  'Frutas cristalizadas e uvas-passas', 500, 0, 1, false, 1),
  ('frutas-100',               'Panetone de Frutas',                  '100 g', 'Panetone de Frutas 100 g',                  'Frutas cristalizadas e uvas-passas', 100, 0, 1, false, 2),
  ('chocotone-500',            'Chocotone',                           '500 g', 'Chocotone 500 g',                           'Gotas de chocolate',                 500, 0, 1, false, 3),
  ('chocotone-100',            'Chocotone',                           '100 g', 'Chocotone 100 g',                           'Gotas de chocolate',                 100, 0, 1, false, 4),
  ('pistache-500',             'Panetone de Brigadeiro de Pistache',  '500 g', 'Panetone de Brigadeiro de Pistache 500 g',  'Cobertura e recheio de brigadeiro de pistache', 500, 0, 1, false, 5),
  ('pistache-100',             'Panetone de Brigadeiro de Pistache',  '100 g', 'Panetone de Brigadeiro de Pistache 100 g',  'Cobertura e recheio de brigadeiro de pistache', 100, 0, 1, false, 6),
  ('chocotone-brigadeiro-500', 'Chocotone com Recheio de Brigadeiro', '500 g', 'Chocotone com Recheio de Brigadeiro 500 g', 'Recheio de brigadeiro e granulado',  500, 0, 1, false, 7),
  ('chocotone-brigadeiro-100', 'Chocotone com Recheio de Brigadeiro', '100 g', 'Chocotone com Recheio de Brigadeiro 100 g', 'Recheio de brigadeiro e granulado',  100, 0, 1, false, 8),
  ('chocotone-ninho-500',      'Chocotone com Recheio de Leite Ninho', '500 g', 'Chocotone com Recheio de Leite Ninho 500 g', 'Recheio e cobertura de Leite Ninho', 500, 0, 1, false, 9),
  ('chocotone-ninho-100',      'Chocotone com Recheio de Leite Ninho', '100 g', 'Chocotone com Recheio de Leite Ninho 100 g', 'Recheio e cobertura de Leite Ninho', 100, 0, 1, false, 10)
on conflict (id) do update set
  sabor = excluded.sabor, tamanho = excluded.tamanho, nome = excluded.nome,
  descricao = excluded.descricao, peso_g = excluded.peso_g, ordem = excluded.ordem;
-- preço e "ativo" não são sobrescritos, para não apagar o que já foi preenchido no painel

-- Ingredientes que esses sabores usam. As receitas (quanto vai em cada panetone)
-- são cadastradas no painel; sem receita, o sabor não entra na lista de compras.
insert into ingredients (nome, unidade, tamanho_embalagem, nome_embalagem) values
  ('Farinha de trigo',           'g',  5000, 'pacote 5 kg'),
  ('Açúcar',                     'g',  1000, 'pacote 1 kg'),
  ('Manteiga',                   'g',   500, 'tablete 500 g'),
  ('Ovos',                       'un',   30, 'bandeja 30 un'),
  ('Fermento natural (levain)',  'g',  null, null),
  ('Frutas cristalizadas',       'g',  1000, 'pacote 1 kg'),
  ('Uva-passa',                  'g',   500, 'pacote 500 g'),
  ('Gotas de chocolate',         'g',  1000, 'pacote 1 kg'),
  ('Brigadeiro de pistache',     'g',  1000, 'balde 1 kg'),
  ('Brigadeiro',                 'g',  1000, 'balde 1 kg'),
  ('Chocolate granulado',        'g',  1000, 'pacote 1 kg'),
  ('Recheio de Leite Ninho',     'g',  1000, 'balde 1 kg'),
  ('Forma de panetone 500 g',    'un',   10, 'pacote 10 un'),
  ('Forma de panetone 100 g',    'un',   50, 'pacote 50 un')
on conflict (nome) do nothing;
