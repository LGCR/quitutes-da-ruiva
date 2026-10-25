// Transforma o payload do webhook da Evolution em algo simples para o fluxo.
// A Evolution (Baileys) já mudou o formato dos votos de enquete algumas vezes, então aceitamos:
//  - messages.upsert com message.pollUpdateMessage (vote.selectedOptions com nomes ou hashes)
//  - messages.update com pollUpdates[].vote.selectedOptions
//  - qualquer "selectedOptions" aninhado no evento
import { chaveTelefone, numeroDoJid } from "./phone";

export interface Entrada {
  /** id único para não processar o mesmo evento duas vezes */
  dedupeId: string;
  /** JID do chat (pode ser @lid) */
  jid: string;
  /** chave do telefone quando dá para descobrir */
  telefoneChave: string | null;
  tipo: "texto" | "voto";
  texto?: string;
  /** id da mensagem da enquete votada */
  pollId?: string | null;
  /** opções escolhidas: nomes ou hashes SHA-256 (hex) */
  selecionadas?: string[];
}

export function lerWebhook(body: any): Entrada | null {
  const evento = String(body?.event ?? "").toLowerCase().replace(/_/g, ".");
  const dados = Array.isArray(body?.data) ? body.data[0] : body?.data;
  if (!dados || typeof dados !== "object") return null;
  if (evento && evento !== "messages.upsert" && evento !== "messages.update") return null;

  const key = dados.key ?? { remoteJid: dados.remoteJid, fromMe: dados.fromMe, id: dados.keyId ?? dados.messageId };
  const jid: string | undefined = key?.remoteJid;
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return null;

  const numero =
    numeroDoJid(jid) ??
    numeroDoJid(key?.remoteJidAlt) ??
    numeroDoJid(key?.senderPn) ??
    numeroDoJid(dados?.senderPn) ??
    (typeof key?.senderPn === "string" ? key.senderPn.replace(/\D/g, "") : null);
  const telefoneChave = numero ? chaveTelefone(numero) : null;

  const m = dados.message ?? {};
  const pu = m.pollUpdateMessage;
  const votos = dados.pollUpdates ?? dados.update?.pollUpdates;

  if (pu || votos || evento === "messages.update") {
    const selecionadas = acharSelecionadas(pu ?? votos ?? dados);
    if (!selecionadas) return null;
    // Em messages.update o key é da própria enquete (enviada por nós), então fromMe é esperado.
    const pollId: string | null = pu?.pollCreationMessageKey?.id ?? (votos || evento === "messages.update" ? key?.id : null) ?? null;
    if (pu && key?.fromMe) return null;
    return {
      dedupeId: `voto:${pollId}:${key?.id}:${selecionadas.join("|")}`,
      jid,
      telefoneChave,
      tipo: "voto",
      pollId,
      selecionadas,
    };
  }

  if (key?.fromMe) return null;
  const texto: string | undefined =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.ephemeralMessage?.message?.conversation ??
    m.ephemeralMessage?.message?.extendedTextMessage?.text;
  if (!texto || !key?.id) return null;
  return { dedupeId: `msg:${key.id}`, jid, telefoneChave, tipo: "texto", texto };
}

function acharSelecionadas(obj: unknown, prof = 0): string[] | null {
  if (!obj || typeof obj !== "object" || prof > 6) return null;
  if (Array.isArray(obj)) {
    for (const x of obj) {
      const r = acharSelecionadas(x, prof + 1);
      if (r) return r;
    }
    return null;
  }
  const o = obj as Record<string, unknown>;
  if (Array.isArray(o.selectedOptions)) {
    return o.selectedOptions.map(opcaoParaString).filter((s): s is string => !!s);
  }
  for (const v of Object.values(o)) {
    const r = acharSelecionadas(v, prof + 1);
    if (r) return r;
  }
  return null;
}

/** Nome da opção, ou o hash SHA-256 em hex quando vier como bytes/base64. */
function opcaoParaString(x: unknown): string | null {
  if (typeof x === "string") return x;
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.name === "string") return o.name;
  if (typeof o.optionName === "string") return o.optionName;
  let bytes: number[] | null = null;
  if (Array.isArray(o.data)) bytes = o.data as number[];
  else if (Object.keys(o).length && Object.keys(o).every((k) => /^\d+$/.test(k))) bytes = Object.values(o) as number[];
  return bytes ? "sha256:" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("") : null;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ParaHex(s: string): string | null {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(s)) return null; // 32 bytes em base64
  try {
    return [...atob(s)].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

const limpar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** Índice da opção escolhida (0, 1, 2...) ou null se não deu para entender. */
export async function escolha(entrada: Entrada, opcoes: string[]): Promise<number | null> {
  if (!opcoes.length) return null;
  if (entrada.tipo === "voto") {
    const sel = entrada.selecionadas?.[0];
    if (!sel) return null;
    const exato = opcoes.findIndex((o) => o === sel || limpar(o) === limpar(sel));
    if (exato >= 0) return exato;
    const hex = sel.startsWith("sha256:") ? sel.slice(7) : base64ParaHex(sel) ?? (/^[0-9a-f]{64}$/i.test(sel) ? sel.toLowerCase() : null);
    if (!hex) return null;
    for (let i = 0; i < opcoes.length; i++) if ((await sha256Hex(opcoes[i])) === hex) return i;
    return null;
  }
  const t = (entrada.texto ?? "").trim();
  const num = t.match(/^\*?(\d{1,2})\*?(?:\s|[.)\-]|$)/);
  if (num) {
    const i = Number(num[1]) - 1;
    return i >= 0 && i < opcoes.length ? i : null;
  }
  const lt = limpar(t);
  if (!lt) return null;
  const i = opcoes.findIndex((o) => limpar(o) === lt);
  return i >= 0 ? i : null;
}
