-- Dados de EXEMPLO. Troque pelos sabores, preços e receitas reais no painel admin.

insert into products (id, nome, descricao, peso_g, preco_centavos, qtd_minima, ordem) values
  ('tradicional', 'Tradicional',            'Frutas cristalizadas e uvas-passas, fermentação natural', 750, 6990, 1, 1),
  ('chocotone',   'Chocotone',              'Gotas de chocolate meio amargo',                         750, 7490, 1, 2),
  ('doceleite',   'Doce de leite & nozes',  'Recheio cremoso com nozes tostadas',                     800, 8990, 1, 3),
  ('pistache',    'Pistache',               'Creme de pistache e cobertura de chocolate branco',      800, 10490, 1, 4),
  ('mini',        'Mini panetone',          'Ótimo para lembrancinha (mín. 6 unidades)',              100, 1490, 6, 5);

insert into ingredients (nome, unidade, tamanho_embalagem, nome_embalagem) values
  ('Farinha de trigo',        'g',  5000, 'pacote 5 kg'),
  ('Açúcar',                  'g',  1000, 'pacote 1 kg'),
  ('Manteiga',                'g',   500, 'tablete 500 g'),
  ('Ovos',                    'un',   30, 'bandeja 30 un'),
  ('Fermento natural (levain)', 'g', null, null),
  ('Frutas cristalizadas',    'g',  1000, 'pacote 1 kg'),
  ('Uva-passa',               'g',   500, 'pacote 500 g'),
  ('Gotas de chocolate',      'g',  1000, 'pacote 1 kg'),
  ('Doce de leite',           'g',  1000, 'balde 1 kg'),
  ('Nozes',                   'g',   500, 'pacote 500 g'),
  ('Creme de pistache',       'g',   600, 'pote 600 g'),
  ('Chocolate branco',        'g',  1000, 'barra 1 kg'),
  ('Forma de panetone 750 g', 'un',   10, 'pacote 10 un'),
  ('Forma de mini panetone',  'un',   50, 'pacote 50 un');

-- Receita base de 750 g: ~300 g farinha, 90 g açúcar, 90 g manteiga, 3 ovos, 60 g levain
insert into recipe_items (product_id, ingredient_id, qtd_por_unidade)
select r.product_id, i.id, r.qtd
from (values
  ('tradicional', 'Farinha de trigo', 300), ('tradicional', 'Açúcar', 90), ('tradicional', 'Manteiga', 90),
  ('tradicional', 'Ovos', 3), ('tradicional', 'Fermento natural (levain)', 60),
  ('tradicional', 'Frutas cristalizadas', 120), ('tradicional', 'Uva-passa', 80), ('tradicional', 'Forma de panetone 750 g', 1),

  ('chocotone', 'Farinha de trigo', 300), ('chocotone', 'Açúcar', 90), ('chocotone', 'Manteiga', 90),
  ('chocotone', 'Ovos', 3), ('chocotone', 'Fermento natural (levain)', 60),
  ('chocotone', 'Gotas de chocolate', 180), ('chocotone', 'Forma de panetone 750 g', 1),

  ('doceleite', 'Farinha de trigo', 300), ('doceleite', 'Açúcar', 80), ('doceleite', 'Manteiga', 90),
  ('doceleite', 'Ovos', 3), ('doceleite', 'Fermento natural (levain)', 60),
  ('doceleite', 'Doce de leite', 200), ('doceleite', 'Nozes', 60), ('doceleite', 'Forma de panetone 750 g', 1),

  ('pistache', 'Farinha de trigo', 300), ('pistache', 'Açúcar', 80), ('pistache', 'Manteiga', 90),
  ('pistache', 'Ovos', 3), ('pistache', 'Fermento natural (levain)', 60),
  ('pistache', 'Creme de pistache', 180), ('pistache', 'Chocolate branco', 80), ('pistache', 'Forma de panetone 750 g', 1),

  ('mini', 'Farinha de trigo', 40), ('mini', 'Açúcar', 12), ('mini', 'Manteiga', 12),
  ('mini', 'Ovos', 0.4), ('mini', 'Fermento natural (levain)', 8),
  ('mini', 'Gotas de chocolate', 20), ('mini', 'Forma de mini panetone', 1)
) as r(product_id, ingrediente, qtd)
join ingredients i on i.nome = r.ingrediente;

insert into datas_entrega (id, rotulo, ordem) values
  ('12-13-dez', 'Sábado 12 ou domingo 13 de dezembro', 1),
  ('19-20-dez', 'Sábado 19 ou domingo 20 de dezembro', 2),
  ('23-dez',     'Quarta, 23 de dezembro',              3);
