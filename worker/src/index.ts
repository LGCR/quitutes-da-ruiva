import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import * as db from "./db";
import { criarEvolution } from "./evolution";
import { iniciarConversa, tratarEntrada, type Portas } from "./flow";
import { chaveTelefone, normalizarTelefone } from "./phone";
import type { Env } from "./types";
import { lerWebhook } from "./webhook";

type App = { Bindings: Env; Variables: { db: db.Db; adminEmail: string } };
const app = new Hono<App>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PEDIDOS_POR_HORA = 5;

app.use("/api/*", async (c, next) => {
  const origens = [c.env.SITE_URL, ...(c.env.ALLOWED_ORIGINS ?? "").split(",")].map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  return cors({ origin: (o) => (origens.includes(o) ? o : null), allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"] })(c, next);
});

app.use("/api/*", async (c, next) => {
  c.set("db", db.criarDb(c.env.SUPABASE_URL, (c.env.SUPABASE_SECRET_KEY || c.env.SUPABASE_SERVICE_KEY)!));
  await next();
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ erro: "Algo deu errado do nosso lado. Tente de novo em instantes." }, 500);
});

function portas(c: Context<App>): Portas {
  const e = c.env;
  return {
    ...db.portasDb(c.get("db")),
    enviar: criarEvolution({ url: e.EVOLUTION_URL, key: e.EVOLUTION_KEY, instance: e.EVOLUTION_INSTANCE, mock: e.EVOLUTION_MOCK === "1" }),
    agora: () => new Date(),
    config: {
      siteUrl: e.SITE_URL,
      pixKey: e.PIX_KEY,
      ruivaPhone: e.RUIVA_PHONE ? normalizarTelefone(e.RUIVA_PHONE) ?? undefined : undefined,
      cardapioImagemUrl: e.CARDAPIO_IMAGE_URL || undefined,
    },
  };
}

/** Envia cardápio + resumo + enquete e registra se deu certo. */
async function enviarWhatsapp(c: Context<App>, orderId: string) {
  const d = c.get("db");
  try {
    const [pedido, { produtos }] = await Promise.all([db.buscarPedido(d, orderId), db.catalogo(d)]);
    if (!pedido) return;
    await iniciarConversa(pedido, produtos, portas(c));
    await db.marcarWhatsapp(d, orderId, "enviado");
  } catch (err) {
    console.error("whatsapp", err);
    await db.marcarWhatsapp(d, orderId, "falhou", String((err as Error).message ?? err).slice(0, 500)).catch(() => {});
  }
}

function emSegundoPlano(c: Context<App>, p: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    return p; // fora do Workers (testes)
  }
}

// Público ---------------------------------------------------------------------

app.get("/", (c) => c.json({ ok: true, api: "Quitutes da Ruiva", catalogo: "/api/catalogo" }));

app.get("/api/catalogo", async (c) => {
  const { produtos, datas } = await db.catalogo(c.get("db"));
  c.header("Cache-Control", "public, max-age=60");
  return c.json({ produtos, datas });
});

app.get("/api/pedidos/:token", async (c) => {
  const token = c.req.param("token");
  if (!UUID.test(token)) return c.json({ erro: "Link inválido." }, 404);
  const p = await db.buscarPedidoPorToken(c.get("db"), token);
  if (!p) return c.json({ erro: "Esse pedido não pode mais ser alterado. Faça um pedido novo." }, 404);
  return c.json({
    codigo: p.codigo,
    nome: p.nome,
    telefone: p.telefone,
    tipo_entrega: p.tipo_entrega,
    endereco: p.endereco,
    data_entrega_id: p.data_entrega_id,
    obs: p.obs,
    itens: p.itens.map((i) => ({ product_id: i.product_id, qtd: i.qtd })),
  });
});

app.post("/api/pedidos", async (c) => {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== "object") return c.json({ erro: "Pedido inválido." }, 400);

  const erros: Record<string, string> = {};
  const nome = String(b.nome ?? "").trim().slice(0, 80);
  if (nome.length < 2) erros.nome = "Digite seu nome.";
  const telefone = normalizarTelefone(String(b.telefone ?? ""));
  if (!telefone) erros.telefone = "Digite o WhatsApp com DDD, como (11) 98765-4321.";
  const tipo = b.tipo_entrega === "entrega" ? "entrega" : "retirada";
  const endereco = String(b.endereco ?? "").trim().slice(0, 200);
  if (tipo === "entrega" && endereco.length < 5) erros.endereco = "Informe o endereço com o bairro.";
  const obs = String(b.obs ?? "").trim().slice(0, 500);
  const optin = b.optin === true;

  const somados = new Map<string, number>();
  for (const it of Array.isArray(b.itens) ? b.itens : []) {
    const id = String(it?.product_id ?? "");
    const q = Math.floor(Number(it?.qtd));
    if (id && q > 0) somados.set(id, (somados.get(id) ?? 0) + q);
  }
  if (!somados.size) erros.itens = "Escolha pelo menos um panetone.";
  const editToken = typeof b.edit_token === "string" && UUID.test(b.edit_token) ? b.edit_token : null;

  if (Object.keys(erros).length) return c.json({ erro: "Confira os campos destacados.", campos: erros }, 400);

  if (c.env.TURNSTILE_SECRET) {
    const form = new FormData();
    form.append("secret", c.env.TURNSTILE_SECRET);
    form.append("response", String(b.turnstile_token ?? ""));
    const ip = c.req.header("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then((r) => r.json<any>());
    if (!v.success) return c.json({ erro: "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo." }, 400);
  }

  const d = c.get("db");
  const chave = chaveTelefone(telefone!)!;
  const umaHora = new Date(Date.now() - 3600_000).toISOString();
  if ((await db.pedidosRecentes(d, chave, umaHora)) >= MAX_PEDIDOS_POR_HORA) {
    return c.json({ erro: "Recebemos vários pedidos desse número na última hora. Fale com a Ruiva pelo WhatsApp." }, 429);
  }

  let criado: { id: string; codigo?: string; total_centavos?: number; edit_token?: string };
  try {
    criado = await db.criarPedido(d, {
      nome,
      telefone,
      telefone_chave: chave,
      tipo_entrega: tipo,
      endereco: tipo === "entrega" ? endereco : "",
      data_entrega_id: String(b.data_entrega_id ?? ""),
      obs,
      optin_whatsapp: optin,
      edit_token: editToken,
      itens: [...somados].map(([product_id, qtd]) => ({ product_id, qtd })),
    });
  } catch (err) {
    const m = String((err as Error).message);
    if (m.includes("data_invalida")) return c.json({ erro: "Essa data de entrega não está mais disponível.", campos: { data: "Escolha outra data." } }, 400);
    if (m.includes("produto_invalido")) return c.json({ erro: "Um dos sabores saiu do cardápio. Recarregue a página." }, 400);
    if (m.includes("qtd_invalida")) return c.json({ erro: "Quantidade inválida para um dos sabores (confira o mínimo).", campos: { itens: "Confira as quantidades." } }, 400);
    throw err;
  }

  if (optin) await emSegundoPlano(c, enviarWhatsapp(c, criado.id));
  else await db.marcarWhatsapp(d, criado.id, "sem_optin");

  return c.json({ codigo: criado.codigo, total_centavos: criado.total_centavos, whatsapp: optin }, 201);
});

// Webhook da Evolution --------------------------------------------------------

app.post("/api/webhook/evolution/:token", async (c) => {
  if (!c.env.WEBHOOK_TOKEN || c.req.param("token") !== c.env.WEBHOOK_TOKEN) return c.text("forbidden", 403);
  const body = await c.req.json().catch(() => null);
  if (body?.instance && c.env.EVOLUTION_INSTANCE && body.instance !== c.env.EVOLUTION_INSTANCE) return c.text("ok");
  const entrada = lerWebhook(body);
  if (entrada) {
    await emSegundoPlano(
      c,
      tratarEntrada(entrada, portas(c)).catch((err) => console.error("webhook", err)),
    );
  }
  return c.text("ok");
});

// Admin -----------------------------------------------------------------------

const admin = new Hono<App>();

admin.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ erro: "Entre com seu e-mail e senha." }, 401);
  const { data, error } = await c.get("db").auth.getUser(token);
  const email = data?.user?.email?.toLowerCase();
  const permitidos = (c.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (error || !email) return c.json({ erro: "Sua sessão expirou. Entre de novo." }, 401);
  if (!permitidos.includes(email)) return c.json({ erro: "Esse e-mail não tem acesso ao painel." }, 403);
  c.set("adminEmail", email);
  await next();
});

admin.get("/me", (c) => c.json({ email: c.get("adminEmail") }));

admin.get("/pedidos", async (c) => {
  const status = c.req.query("status") || undefined;
  return c.json(await db.listarPedidos(c.get("db"), status));
});

const STATUS = ["pendente", "confirmado", "substituido", "cancelado", "entregue"];
const PAGTOS = ["pix", "dinheiro", "cartao"];

admin.patch("/pedidos/:id", async (c) => {
  const b = await c.req.json<any>();
  const patch: Record<string, unknown> = {};
  if (b.status !== undefined) {
    if (!STATUS.includes(b.status)) return c.json({ erro: "Status inválido." }, 400);
    patch.status = b.status;
    if (b.status === "confirmado") patch.confirmado_em = new Date().toISOString();
  }
  if (b.pagamento !== undefined) {
    if (b.pagamento !== null && !PAGTOS.includes(b.pagamento)) return c.json({ erro: "Pagamento inválido." }, 400);
    patch.pagamento = b.pagamento;
  }
  const r = await c.get("db").from("orders").update(patch).eq("id", c.req.param("id"));
  if (r.error) throw new Error(r.error.message);
  return c.json({ ok: true });
});

admin.post("/pedidos/:id/reenviar", async (c) => {
  const atual = await c.get("db").from("orders").select("status").eq("id", c.req.param("id")).maybeSingle();
  if (atual.data?.status !== "pendente") return c.json({ erro: "Só dá para reenviar pedidos pendentes." }, 400);
  await enviarWhatsapp(c, c.req.param("id"));
  const p = await c.get("db").from("orders").select("whatsapp_status, whatsapp_erro").eq("id", c.req.param("id")).single();
  return c.json(p.data);
});

admin.get("/lista-compras", async (c) => {
  const r = await c.get("db").from("v_lista_compras").select("*");
  if (r.error) throw new Error(r.error.message);
  return c.json(r.data);
});

admin.get("/sabores", async (c) => {
  const r = await c.get("db").from("v_resumo_sabores").select("*");
  if (r.error) throw new Error(r.error.message);
  return c.json(r.data);
});

admin.get("/catalogo", async (c) => {
  const d = c.get("db");
  const [{ produtos, datas }, ing, rec] = await Promise.all([
    db.catalogo(d, false),
    d.from("ingredients").select("*").order("nome"),
    d.from("recipe_items").select("*"),
  ]);
  if (ing.error || rec.error) throw new Error((ing.error ?? rec.error)!.message);
  return c.json({ produtos, datas, ingredientes: ing.data, receitas: rec.data });
});

admin.put("/produtos/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return c.json({ erro: "Use só letras minúsculas, números e hífen no código do sabor." }, 400);
  const b = await c.req.json<any>();
  const row = {
    id,
    nome: String(b.nome ?? "").trim(),
    descricao: b.descricao ? String(b.descricao) : null,
    peso_g: b.peso_g ? Number(b.peso_g) : null,
    sabor: b.sabor ? String(b.sabor).trim() : null,
    tamanho: b.tamanho ? String(b.tamanho).trim() : null,
    preco_centavos: Math.round(Number(b.preco_centavos)),
    qtd_minima: Math.max(1, Math.floor(Number(b.qtd_minima ?? 1))),
    ativo: b.ativo !== false,
    ordem: Number(b.ordem ?? 0),
  };
  if (!row.nome || !Number.isFinite(row.preco_centavos) || row.preco_centavos < 0) return c.json({ erro: "Preencha nome e preço." }, 400);
  const r = await c.get("db").from("products").upsert(row);
  if (r.error) throw new Error(r.error.message);
  return c.json({ ok: true });
});

admin.post("/ingredientes", async (c) => {
  const b = await c.req.json<any>();
  const row = {
    nome: String(b.nome ?? "").trim(),
    unidade: ["g", "ml", "un"].includes(b.unidade) ? b.unidade : "g",
    tamanho_embalagem: b.tamanho_embalagem ? Number(b.tamanho_embalagem) : null,
    nome_embalagem: b.nome_embalagem ? String(b.nome_embalagem) : null,
  };
  if (!row.nome) return c.json({ erro: "Dê um nome ao ingrediente." }, 400);
  const d = c.get("db");
  const r = b.id ? await d.from("ingredients").update(row).eq("id", b.id) : await d.from("ingredients").insert(row);
  if (r.error) return c.json({ erro: r.error.code === "23505" ? "Já existe um ingrediente com esse nome." : r.error.message }, 400);
  return c.json({ ok: true });
});

admin.delete("/ingredientes/:id", async (c) => {
  const r = await c.get("db").from("ingredients").delete().eq("id", c.req.param("id"));
  if (r.error) return c.json({ erro: r.error.code === "23503" ? "Esse ingrediente está em uma receita. Tire da receita antes." : r.error.message }, 400);
  return c.json({ ok: true });
});

/** Substitui a receita inteira de um sabor. */
admin.put("/receitas/:productId", async (c) => {
  const pid = c.req.param("productId");
  const b = await c.req.json<any>();
  const itens = (Array.isArray(b.itens) ? b.itens : [])
    .map((i: any) => ({ product_id: pid, ingredient_id: Number(i.ingredient_id), qtd_por_unidade: Number(i.qtd_por_unidade) }))
    .filter((i: any) => i.ingredient_id && i.qtd_por_unidade > 0);
  const d = c.get("db");
  const del = await d.from("recipe_items").delete().eq("product_id", pid);
  if (del.error) throw new Error(del.error.message);
  if (itens.length) {
    const ins = await d.from("recipe_items").insert(itens);
    if (ins.error) throw new Error(ins.error.message);
  }
  return c.json({ ok: true });
});

admin.put("/datas/:id", async (c) => {
  if (!/^[a-z0-9-]{2,20}$/i.test(c.req.param("id"))) return c.json({ erro: "Use só letras, números e hífen no código da data (ex.: 24-dez)." }, 400);
  const b = await c.req.json<any>();
  const r = await c.get("db").from("datas_entrega").upsert({ id: c.req.param("id"), rotulo: String(b.rotulo ?? "").trim(), ativo: b.ativo !== false, ordem: Number(b.ordem ?? 0) });
  if (r.error) throw new Error(r.error.message);
  return c.json({ ok: true });
});

app.route("/api/admin", admin);

export default app;
