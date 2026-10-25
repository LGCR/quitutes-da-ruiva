// Cliente mínimo da Evolution API v2 (instância Baileys).
// Docs: POST /message/sendText|sendMedia|sendPoll/{instance} com header `apikey`.

export interface Enviador {
  texto(numero: string, texto: string): Promise<Enviado>;
  imagem(numero: string, url: string, legenda: string): Promise<Enviado>;
  enquete(numero: string, pergunta: string, opcoes: string[]): Promise<Enviado>;
}

/** id da mensagem criada e o JID real para onde foi (pode vir sem o nono dígito). */
export interface Enviado {
  id: string | null;
  jid: string | null;
}

const DIGITANDO_MS = 1200;

export function criarEvolution(cfg: { url: string; key: string; instance: string; mock?: boolean }): Enviador {
  if (cfg.mock) return enviadorMock();
  const base = cfg.url.replace(/\/+$/, "");
  const inst = encodeURIComponent(cfg.instance);

  async function post(rota: string, body: unknown): Promise<Enviado> {
    const res = await fetch(`${base}/message/${rota}/${inst}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`Evolution ${rota} ${res.status}: ${txt.slice(0, 300)}`);
    let json: any = {};
    try { json = JSON.parse(txt); } catch { /* resposta vazia */ }
    return { id: json?.key?.id ?? null, jid: json?.key?.remoteJid ?? null };
  }

  return {
    texto: (numero, texto) => post("sendText", { number: numero, text: texto, delay: DIGITANDO_MS }),
    imagem: (numero, url, legenda) =>
      post("sendMedia", {
        number: numero,
        mediatype: "image",
        mimetype: url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        media: url,
        fileName: "cardapio",
        caption: legenda,
        delay: DIGITANDO_MS,
      }),
    enquete: (numero, pergunta, opcoes) =>
      post("sendPoll", { number: numero, name: pergunta, selectableCount: 1, values: opcoes, delay: DIGITANDO_MS }),
  };
}

export function enviadorMock(log: (...a: unknown[]) => void = console.log): Enviador {
  let n = 0;
  const id = () => `MOCK${Date.now()}${n++}`;
  return {
    async texto(numero, texto) { log("[evolution mock] texto", numero, texto); return { id: id(), jid: `${numero}@s.whatsapp.net` }; },
    async imagem(numero, url, legenda) { log("[evolution mock] imagem", numero, url, legenda); return { id: id(), jid: `${numero}@s.whatsapp.net` }; },
    async enquete(numero, pergunta, opcoes) { log("[evolution mock] enquete", numero, pergunta, opcoes); return { id: id(), jid: `${numero}@s.whatsapp.net` }; },
  };
}
