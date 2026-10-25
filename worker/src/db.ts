import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Portas } from "./flow";
import type { Conversa, DataEntrega, Pedido, Produto } from "./types";

export type Db = SupabaseClient;

export function criarDb(url: string, serviceKey: string): Db {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export async function catalogo(db: Db, apenasAtivos = true) {
  let qp = db.from("products").select("*").order("ordem").order("nome");
  let qd = db.from("datas_entrega").select("*").order("ordem");
  if (apenasAtivos) {
    qp = qp.eq("ativo", true);
    qd = qd.eq("ativo", true);
  }
  const [p, d] = await Promise.all([qp, qd]);
  return { produtos: ok(p) as Produto[], datas: ok(d) as DataEntrega[] };
}

const SELECT_PEDIDO =
  "*, datas_entrega(rotulo), order_items(product_id, qtd, preco_unit_centavos, products(nome))";

function montarPedido(r: any): Pedido {
  return {
    ...r,
    data_rotulo: r.datas_entrega?.rotulo ?? r.data_entrega_id,
    itens: (r.order_items ?? []).map((i: any) => ({
      product_id: i.product_id,
      nome: i.products?.nome ?? i.product_id,
      qtd: i.qtd,
      preco_unit_centavos: i.preco_unit_centavos,
    })),
  };
}

export async function buscarPedido(db: Db, id: string): Promise<Pedido | null> {
  const r = ok(await db.from("orders").select(SELECT_PEDIDO).eq("id", id).maybeSingle());
  return r ? montarPedido(r) : null;
}

export async function buscarPedidoPorToken(db: Db, token: string): Promise<Pedido | null> {
  const r = ok(
    await db.from("orders").select(SELECT_PEDIDO).eq("edit_token", token).in("status", ["pendente", "confirmado"]).maybeSingle(),
  );
  return r ? montarPedido(r) : null;
}

export async function listarPedidos(db: Db, status?: string): Promise<(Pedido & { created_at: string; whatsapp_status: string; whatsapp_erro: string | null })[]> {
  let q = db.from("orders").select(SELECT_PEDIDO).order("created_at", { ascending: false }).limit(1000);
  if (status) q = q.eq("status", status);
  return (ok(await q) as any[]).map(montarPedido) as any;
}

export async function criarPedido(db: Db, payload: Record<string, unknown>) {
  const r = await db.rpc("criar_pedido", { p: payload });
  if (r.error) throw new Error(r.error.message);
  return r.data as { id: string };
}

export async function pedidosRecentes(db: Db, telefoneChave: string, desdeIso: string) {
  const r = await db.from("orders").select("id", { count: "exact", head: true }).eq("telefone_chave", telefoneChave).gte("created_at", desdeIso);
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

export async function marcarWhatsapp(db: Db, id: string, status: "enviado" | "falhou" | "sem_optin", erro: string | null = null) {
  ok(await db.from("orders").update({ whatsapp_status: status, whatsapp_erro: erro }).eq("id", id));
}

export function portasDb(db: Db): Omit<Portas, "enviar" | "agora" | "config"> {
  return {
    async buscarConversa({ telefoneChave, pollId }) {
      let q = db.from("conversations").select("*");
      if (pollId) q = q.eq("poll_message_id", pollId);
      else if (telefoneChave) q = q.eq("telefone_chave", telefoneChave);
      else return null;
      return (ok(await q.limit(1).maybeSingle()) as Conversa | null) ?? null;
    },
    async salvarConversa(c) {
      ok(await db.from("conversations").upsert({ ...c, updated_at: new Date().toISOString() }));
    },
    buscarPedido: (id) => buscarPedido(db, id),
    async atualizarPedido(id, patch) {
      ok(await db.from("orders").update(patch).eq("id", id));
    },
    async marcarProcessado(id) {
      const r = await db.from("processed_messages").insert({ id });
      if (!r.error) return true;
      if (r.error.code === "23505") return false;
      throw new Error(r.error.message);
    },
  };
}
