# Quitutes da Ruiva: pré-venda de panetones

O cliente preenche o formulário e recebe no WhatsApp o cardápio e o resumo do pedido. A confirmação e o pagamento são combinados com a Ruiva na própria conversa. A Ruiva acompanha tudo no painel `/admin`, onde também fica a **lista de compras de ingredientes**: a receita de cada sabor multiplicada pelos panetones confirmados.

```
Formulário (Cloudflare Pages) ──POST /api/pedidos──► Worker ──► Supabase (pedido "pendente")
                                                       └──► whatsapp-backend: cardápio + resumo (cliente), aviso (Ruiva)
Painel /admin (Pages + login Supabase) ──► Worker /api/admin/* ──► pedidos, lista de compras, cardápio, conexão do WhatsApp
```

## Fluxo no WhatsApp

As mensagens saem pelo [whatsapp-backend](../whatsapp-backend) (o mesmo do calculacivil). O número é conectado por QR Code na aba **WhatsApp** do painel.

1. Cardápio (imagem ou texto) com a saudação "Oi, {nome}! Aqui é a Ruiva 🎀"
2. Resumo do pedido com o total, o link para alterar (formulário já preenchido; o pedido antigo vira "substituído") e o pedido para responder a mensagem para confirmar.
3. A Ruiva recebe no `RUIVA_PHONE` um aviso de cada pedido novo ou alterado.
4. Quando a Ruiva muda o status no painel, o cliente recebe um aviso:
   - **Confirmado**: com a chave Pix e o valor do sinal (50%), se o pagamento marcado for Pix.
   - **Entregue** e **Cancelado**: mensagem curta.

Não há bot por enquanto: o whatsapp-backend ainda não tem enquete nem repassa as mensagens recebidas. O bot antigo (enquetes pela Evolution) está no histórico do Git, e as tabelas `conversations` e `processed_messages` continuam no banco para quando ele voltar.

## Pastas

| Pasta | O que tem |
|---|---|
| `web/` | Site estático: formulário (`index.html`), painel (`admin/`), `config.js` |
| `worker/` | API em Cloudflare Workers (Hono): pedidos, envio pelo whatsapp-backend, admin |
| `supabase/` | Migração do banco (tabelas, relatórios, função `criar_pedido`) e `seed.sql` com dados de exemplo |

## Passo a passo do deploy

### 1. Supabase

1. Crie um projeto em supabase.com.
2. No **SQL Editor**, rode nesta ordem:
   1. `supabase/migrations/20261025000000_init.sql`
   2. `supabase/migrations/20261026000000_tamanhos.sql`
   3. `supabase/seed.sql`: datas de entrega e o cardápio de Natal (5 sabores × 500 g e 100 g)
   - Os produtos entram **inativos e com preço 0**. No painel, preencha o preço, marque "Ativo" e cadastre as receitas.
   - Se você já tinha rodado o seed antigo, rode só a migração `20261026...` e depois `supabase/cardapio_natal.sql`. Os sabores de exemplo são desativados.
   - Se preferir o CLI: `supabase link --project-ref SEU_REF` e depois `supabase db push`.
3. Em **Authentication → Users → Add user**, crie o usuário da Ruiva com e-mail e senha. Desative o cadastro público em Authentication → Providers → Email → "Allow new users to sign up".
4. Anote, em Project Settings → API:
   - a `URL`
   - a `publishable key` (`sb_publishable_...`), que é pública e vai no `config.js`
   - a `secret key` (`sb_secret_...`), que é **secreta** e fica só no Worker. Nunca coloque no código nem no `config.js`.

### 2. Worker (API)

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put SUPABASE_URL          # https://xxxx.supabase.co
npx wrangler secret put SUPABASE_SECRET_KEY   # sb_secret_...
npx wrangler secret put WHATSAPP_BACKEND_URL  # https://wa.seudominio.com.br
npx wrangler secret put WHATSAPP_API_KEY      # API key do tenant: messages:send, instances:read, instances:manage
npx wrangler secret put ADMIN_EMAILS          # ruiva@exemplo.com (separe vários com vírgula)
npx wrangler secret put PIX_KEY               # chave Pix enviada ao cliente
npx wrangler secret put RUIVA_PHONE           # 55DDDNÚMERO para receber avisos (opcional)
npm run deploy
```

`npm run deploy` reenvia, a cada deploy, as chaves do Supabase e o `ADMIN_EMAILS` guardados em `worker/.secrets.prod.json` (fora do Git, no formato `{"NOME": "valor"}`), e mantém as variáveis criadas no painel da Cloudflare (`--keep-vars`).

No `wrangler.toml`, ajuste:
- `SITE_URL`: o endereço público do formulário. É usado no link "Quero alterar".
- `CARDAPIO_IMAGE_URL`: a arte do cardápio publicada pelo Pages (`<SITE_URL>/assets/cardapio.jpg`). Ela vai como foto no WhatsApp. Se ficar vazia, o cardápio vai como texto gerado a partir dos sabores ativos.
- `routes`: coloque o Worker em `seu-dominio/api/*` para o site e a API ficarem no mesmo domínio.

### 3. Site (Cloudflare Pages)

1. Coloque a logo em `web/assets/logo.png`. Enquanto o arquivo não existir, aparece um selo desenhado no mesmo estilo.
2. Edite `web/config.js` com a `supabaseUrl`, a `supabaseAnonKey` e o texto do prazo.
   - Deixe `apiBase` vazio se o Worker estiver em `seu-dominio/api/*`. Senão, coloque a URL do Worker e adicione a origem do site em `ALLOWED_ORIGINS`.
3. Publique:

```bash
npx wrangler pages deploy web --project-name quitutes-da-ruiva
```

Depois, em Pages → Custom domains, aponte para o mesmo domínio da rota do Worker.

### 4. Conectar o WhatsApp

1. No whatsapp-backend, crie uma API key para o tenant com os escopos `messages:send`, `instances:read` e `instances:manage`, e guarde em `WHATSAPP_API_KEY`.
2. Aplique a migration `supabase/migrations/20261027000000_whatsapp_backend.sql` (tabela `whatsapp_config`, onde fica o id da instância).
3. No painel, abra a aba **WhatsApp** → **Criar conexão** → **Conectar** e leia o QR Code no celular (WhatsApp → Aparelhos conectados). O status muda para "Conectado" sozinho.
4. Toque em **Enviar teste para a Ruiva** para confirmar que a mensagem chega no `RUIVA_PHONE`.

### 5. Turnstile (anti-spam, opcional)

Crie um widget em Cloudflare → Turnstile. Coloque a site key em `turnstileSiteKey` no `config.js` e rode `npx wrangler secret put TURNSTILE_SECRET`. Mesmo sem Turnstile, a API aceita no máximo 5 pedidos por número por hora.

## Painel `/admin`

- **Pedidos:**
  - números do dia (confirmados, aguardando confirmação, panetones, faturamento)
  - filtros por status, data e busca
  - troca de status e de pagamento (confirmado, entregue e cancelado avisam o cliente no WhatsApp)
  - "Reenviar" o WhatsApp quando o envio falhou
  - exportação CSV
- **Lista de compras:** ingredientes somados dos pedidos confirmados, com a opção de incluir os pendentes. Mostra quantas embalagens comprar e a contagem de panetones por sabor. Exporta CSV.
- **Cardápio e receitas:** sabores, preços, peso, quantidade mínima e ativo/inativo. Tem também a receita **por unidade** de cada sabor e o cadastro de ingredientes com o tamanho da embalagem.
- **Datas de entrega:** as opções que aparecem no formulário. Desative quando a data lotar.
- **WhatsApp:** status da conexão, QR Code para conectar, desconectar/sair do aparelho e mensagem de teste.

## Rodar localmente

```bash
cd worker
cp .dev.vars.example .dev.vars   # WHATSAPP_MOCK=1 só registra as mensagens no log, sem enviar
npm install
npm test                         # testes do cliente do whatsapp-backend e das mensagens
npx wrangler dev                 # API em http://127.0.0.1:8787
```

Sirva a pasta `web/` (ex.: `npx serve web -l 5173`) com `apiBase: "http://127.0.0.1:8787"` no `config.js`.

## Cuidados

- Mensagens só vão para quem marcou a autorização no formulário. Isso reduz o risco de bloqueio do número conectado por QR Code.
- Os preços são recalculados no banco (`criar_pedido`). O valor que vem do navegador é ignorado.
- Todas as tabelas têm RLS ligado e nenhuma policy: com a chave pública (anon), ninguém lê nem grava nada. Só o Worker, com a service role, acessa o banco.
- A API key do whatsapp-backend fica só no Worker. O navegador fala com o Worker, que repassa para o whatsapp-backend.
- Números com e sem o nono dígito são reconhecidos como o mesmo cliente.
