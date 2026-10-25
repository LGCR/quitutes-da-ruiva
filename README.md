# Quitutes da Ruiva: pré-venda de panetones

O cliente preenche o formulário e recebe no WhatsApp o cardápio, o resumo do pedido e uma **enquete** para confirmar. Depois vem outra enquete para escolher o pagamento. A Ruiva acompanha tudo no painel `/admin`, onde também fica a **lista de compras de ingredientes**: a receita de cada sabor multiplicada pelos panetones confirmados.

```
Formulário (Cloudflare Pages) ──POST /api/pedidos──► Worker ──► Supabase (pedido "pendente")
                                                       └──► Evolution API: cardápio + resumo + enquete
WhatsApp do cliente ──voto / "1,2,3"──► Evolution ──webhook──► Worker ──► confirma, pede pagamento, manda Pix
Painel /admin (Pages + login Supabase) ──► Worker /api/admin/* ──► pedidos, lista de compras, cardápio
```

## Fluxo no WhatsApp

1. Cardápio (imagem ou texto) com a saudação "Oi, {nome}! Aqui é a Ruiva 🎀"
2. Resumo do pedido com o total
3. Enquete **"Está tudo certo com o seu pedido?"**
   - ✅ Confirmar pedido → enquete de pagamento: Pix (50% de sinal), dinheiro ou cartão na entrega → pedido **confirmado**. O cliente recebe a chave Pix e a Ruiva recebe um aviso.
   - ✏️ Quero alterar → link do formulário já preenchido. Ao reenviar, o pedido antigo vira "substituído".
   - 💬 Falar com a Ruiva → o bot para de responder esse cliente e avisa a Ruiva. Se o cliente mandar `menu`, o bot volta.

**Por que enquete e não botões:** numa Evolution conectada por QR Code (Baileys), botões e listas do WhatsApp não funcionam de forma confiável, mas enquete funciona. O cliente também pode responder com o número (1, 2, 3). Se ele mandar uma mensagem que o bot não entende, recebe uma ajuda curta, no máximo uma vez a cada 2 minutos.

O bot **só responde números que fizeram pedido pelo formulário**. As outras conversas do WhatsApp da Ruiva continuam normais.

## Pastas

| Pasta | O que tem |
|---|---|
| `web/` | Site estático: formulário (`index.html`), painel (`admin/`), `config.js` |
| `worker/` | API em Cloudflare Workers (Hono): pedidos, webhook da Evolution, admin |
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
npx wrangler secret put EVOLUTION_URL         # https://evolution.seudominio.com.br
npx wrangler secret put EVOLUTION_KEY         # apikey global ou da instância
npx wrangler secret put WEBHOOK_TOKEN         # gere com: openssl rand -hex 24
npx wrangler secret put ADMIN_EMAILS          # ruiva@exemplo.com (separe vários com vírgula)
npx wrangler secret put PIX_KEY               # chave Pix enviada ao cliente
npx wrangler secret put RUIVA_PHONE           # 55DDDNÚMERO para receber avisos (opcional)
npx wrangler deploy
```

No `wrangler.toml`, ajuste:
- `EVOLUTION_INSTANCE`: o nome da instância na Evolution.
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

### 4. Webhook da Evolution

Aponte o webhook da instância para o Worker, com os eventos de mensagem:

```bash
curl -X POST "$EVOLUTION_URL/webhook/set/quitutes" \
  -H "apikey: $EVOLUTION_KEY" -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"https://SEU-DOMINIO/api/webhook/evolution/SEU_WEBHOOK_TOKEN","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT","MESSAGES_UPDATE"]}}'
```

Também dá para configurar no Evolution Manager → instância → Webhook.

### 5. Turnstile (anti-spam, opcional)

Crie um widget em Cloudflare → Turnstile. Coloque a site key em `turnstileSiteKey` no `config.js` e rode `npx wrangler secret put TURNSTILE_SECRET`. Mesmo sem Turnstile, a API aceita no máximo 5 pedidos por número por hora.

## Painel `/admin`

- **Pedidos:**
  - números do dia (confirmados, aguardando no WhatsApp, panetones, faturamento)
  - filtros por status, data e busca
  - troca de status e de pagamento
  - "Reenviar" o WhatsApp quando o envio falhou
  - exportação CSV
- **Lista de compras:** ingredientes somados dos pedidos confirmados, com a opção de incluir os pendentes. Mostra quantas embalagens comprar e a contagem de panetones por sabor. Exporta CSV.
- **Cardápio e receitas:** sabores, preços, peso, quantidade mínima e ativo/inativo. Tem também a receita **por unidade** de cada sabor e o cadastro de ingredientes com o tamanho da embalagem.
- **Datas de entrega:** as opções que aparecem no formulário. Desative quando a data lotar.

## Rodar localmente

```bash
cd worker
cp .dev.vars.example .dev.vars   # EVOLUTION_MOCK=1 só registra as mensagens no log, sem enviar
npm install
npm test                         # testes do fluxo do WhatsApp e da leitura do webhook
npx wrangler dev                 # API em http://127.0.0.1:8787
```

Sirva a pasta `web/` (ex.: `npx serve web -l 5173`) com `apiBase: "http://127.0.0.1:8787"` no `config.js`.

Para simular um voto pelo webhook:

```bash
curl -X POST http://127.0.0.1:8787/api/webhook/evolution/SEU_TOKEN -H 'Content-Type: application/json' \
  -d '{"event":"messages.upsert","instance":"quitutes","data":{"key":{"remoteJid":"5511987654321@s.whatsapp.net","fromMe":false,"id":"T1"},"message":{"conversation":"1"}}}'
```

## Cuidados

- Mensagens só vão para quem marcou a autorização no formulário. Isso reduz o risco de bloqueio do número conectado por QR Code.
- Os preços são recalculados no banco (`criar_pedido`). O valor que vem do navegador é ignorado.
- Todas as tabelas têm RLS ligado e nenhuma policy: com a chave pública (anon), ninguém lê nem grava nada. Só o Worker, com a service role, acessa o banco.
- O mesmo evento do webhook nunca é processado duas vezes (tabela `processed_messages`). Votos em enquetes antigas são ignorados.
- Números com e sem o nono dígito são reconhecidos como o mesmo cliente.
