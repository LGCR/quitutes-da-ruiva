// Cliente do whatsapp-backend (projeto whatsapp-backend, mesmo usado pelo calculacivil).
// Docs: POST /api/v1/messages (multipart) e /api/v1/instances/* com header `X-API-Key`.
// Respostas vêm em { success, data } ou { success: false, error: { code, message } }.

export interface Enviador {
  texto(numero: string, texto: string): Promise<void>;
  imagem(numero: string, url: string, legenda: string): Promise<void>;
}

export type StatusInstancia =
  | "CREATED" | "INITIALIZING" | "WAITING_QRCODE" | "CONNECTING" | "CONNECTED"
  | "DISCONNECTED" | "RECONNECTING" | "FAILED" | "LOGGED_OUT" | "DELETED";

export interface Instancia {
  id: string;
  name: string;
  status: StatusInstancia;
  phone?: string | null;
  displayName?: string | null;
  profilePicture?: string | null;
}

export interface Conexao {
  instanceId: string;
  status: StatusInstancia;
  qrCode?: string;
  qrCodeImage?: string;
  qrCodeExpiresAt?: string;
}

export interface ConfigBackend {
  url: string;
  key: string;
}

/** Erro devolvido pelo whatsapp-backend, com o status HTTP (404 = instância sumiu). */
export class ErroWhatsapp extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function chamar<T>(cfg: ConfigBackend, path: string, init: RequestInit = {}): Promise<T> {
  if (!cfg.url || !cfg.key) throw new ErroWhatsapp("WhatsApp não configurado (WHATSAPP_BACKEND_URL e WHATSAPP_API_KEY).", 0);
  const res = await fetch(`${cfg.url.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { "X-API-Key": cfg.key, ...(init.headers ?? {}) },
  });
  const txt = await res.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { /* resposta vazia ou não JSON */ }
  if (!res.ok || json?.success === false) {
    const code = json?.error?.code;
    const motivo =
      code === "SUBSCRIPTION_SUSPENDED" ? "A assinatura do WhatsApp está suspensa por falta de pagamento."
      : json?.error?.message ?? (txt.slice(0, 300) || res.statusText);
    throw new ErroWhatsapp(`WhatsApp ${res.status}: ${motivo}`, res.status, code);
  }
  return (json?.data !== undefined ? json.data : json) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function instancias(cfg: ConfigBackend) {
  const rota = (id: string, acao = "") => `/api/v1/instances/${encodeURIComponent(id)}${acao}`;
  return {
    criar: (nome: string) => chamar<Instancia>(cfg, "/api/v1/instances", json({ name: nome })),
    ver: (id: string) => chamar<Instancia>(cfg, rota(id)),
    conectar: (id: string) => chamar<Conexao>(cfg, rota(id, "/connect?forceQr=true"), { method: "POST" }),
    desconectar: (id: string) => chamar<Instancia>(cfg, rota(id, "/disconnect"), { method: "POST" }),
  };
}

export function criarWhatsapp(
  cfg: ConfigBackend & { instanceId: string | null; mock?: boolean; baixar?: (url: string) => Promise<Response> },
): Enviador {
  if (cfg.mock) return enviadorMock();

  async function enviar(campos: Record<string, string>, arquivo?: { blob: Blob; nome: string }) {
    if (!cfg.instanceId) throw new ErroWhatsapp("WhatsApp não conectado. Conecte na aba WhatsApp do painel.", 0);
    const form = new FormData();
    form.append("instanceId", cfg.instanceId);
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    if (arquivo) form.append("file", arquivo.blob, arquivo.nome);
    await chamar(cfg, "/api/v1/messages", { method: "POST", body: form });
  }

  return {
    texto: (numero, texto) => enviar({ to: numero, type: "TEXT", body: texto }),
    async imagem(numero, url, legenda) {
      const res = await (cfg.baixar ?? fetch)(url);
      if (!res.ok) throw new Error(`Não consegui baixar a imagem do cardápio (${res.status}).`);
      const blob = await res.blob();
      const nome = url.toLowerCase().endsWith(".png") ? "cardapio.png" : "cardapio.jpg";
      await enviar({ to: numero, type: "IMAGE", body: legenda }, { blob, nome });
    },
  };
}

export function enviadorMock(log: (...a: unknown[]) => void = console.log): Enviador {
  return {
    async texto(numero, texto) { log("[whatsapp mock] texto", numero, texto); },
    async imagem(numero, url, legenda) { log("[whatsapp mock] imagem", numero, url, legenda); },
  };
}
