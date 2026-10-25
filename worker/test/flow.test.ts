import { describe, expect, it } from "vitest";
import { iniciarConversa, tratarEntrada, type Portas } from "../src/flow";
import { ENQUETE_CONFIRMAR, ENQUETE_PAGAMENTO } from "../src/messages";
import { chaveTelefone, normalizarTelefone } from "../src/phone";
import type { Conversa, Pedido, Produto } from "../src/types";
import { escolha, lerWebhook } from "../src/webhook";

const produtos: Produto[] = [
  { id: "chocotone", nome: "Chocotone", descricao: null, peso_g: 750, sabor: null, tamanho: null, preco_centavos: 7490, qtd_minima: 1, ativo: true, ordem: 1 },
];

function novoPedido(): Pedido {
  return {
    id: "o1", codigo: "QR-0101", nome: "Maria Silva", telefone: "5511987654321", telefone_chave: "551187654321",
    tipo_entrega: "retirada", endereco: null, data_entrega_id: "19-20-dez", data_rotulo: "Sábado 19 ou domingo 20 de dezembro",
    obs: null, pagamento: null, status: "pendente", total_centavos: 14980, edit_token: "tok-123",
    itens: [{ product_id: "chocotone", nome: "Chocotone", qtd: 2, preco_unit_centavos: 7490 }],
  };
}

function montar(opts: { imagem?: string } = {}) {
  const enviados: { tipo: string; para: string; conteudo: unknown[] }[] = [];
  const conversas = new Map<string, Conversa>();
  const processados = new Set<string>();
  const pedido = novoPedido();
  let n = 0;
  let relogio = new Date("2026-11-03T14:00:00Z");
  const env = (tipo: string) => async (para: string, ...conteudo: unknown[]) => {
    enviados.push({ tipo, para, conteudo });
    return { id: `MSG${++n}`, jid: "551187654321@s.whatsapp.net" };
  };
  const portas: Portas = {
    async buscarConversa({ telefoneChave, pollId }) {
      for (const c of conversas.values()) {
        if (pollId && c.poll_message_id === pollId) return { ...c };
        if (!pollId && telefoneChave && c.telefone_chave === telefoneChave) return { ...c };
      }
      return null;
    },
    async salvarConversa(c) { conversas.set(c.telefone_chave, { ...c }); },
    async buscarPedido(id) { return id === pedido.id ? pedido : null; },
    async atualizarPedido(_id, patch) { Object.assign(pedido, patch); },
    async marcarProcessado(id) { if (processados.has(id)) return false; processados.add(id); return true; },
    enviar: { texto: env("texto"), imagem: env("imagem"), enquete: env("enquete") },
    agora: () => relogio,
    config: { siteUrl: "https://encomendas.exemplo.com", pixKey: "pix@ruiva.com", ruivaPhone: "5511900000000", cardapioImagemUrl: opts.imagem },
  };
  const conversa = () => conversas.get("551187654321")!;
  const avancar = (ms: number) => { relogio = new Date(relogio.getTime() + ms); };
  return { portas, enviados, conversa, pedido, avancar };
}

let seq = 0;
const texto = (t: string, jid = "551187654321@s.whatsapp.net") =>
  lerWebhook({ event: "messages.upsert", instance: "quitutes", data: { key: { remoteJid: jid, fromMe: false, id: `IN${++seq}` }, message: { conversation: t } } })!;

const votoUpsert = (pollId: string, opcao: string) =>
  lerWebhook({
    event: "messages.upsert",
    data: {
      key: { remoteJid: "551187654321@s.whatsapp.net", fromMe: false, id: `V${++seq}` },
      message: { pollUpdateMessage: { pollCreationMessageKey: { id: pollId }, vote: { selectedOptions: [opcao] } } },
    },
  })!;

describe("telefone", () => {
  it("normaliza e gera a chave sem o nono dígito", () => {
    expect(normalizarTelefone("(11) 98765-4321")).toBe("5511987654321");
    expect(normalizarTelefone("+55 11 98765-4321")).toBe("5511987654321");
    expect(normalizarTelefone("123")).toBeNull();
    expect(chaveTelefone("5511987654321")).toBe("551187654321");
    expect(chaveTelefone("551187654321")).toBe("551187654321");
  });
});

describe("lerWebhook", () => {
  it("ignora mensagens enviadas por nós e de grupos", () => {
    expect(lerWebhook({ event: "messages.upsert", data: { key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: true, id: "x" }, message: { conversation: "oi" } } })).toBeNull();
    expect(lerWebhook({ event: "messages.upsert", data: { key: { remoteJid: "123@g.us", id: "x" }, message: { conversation: "oi" } } })).toBeNull();
  });

  it("lê voto do messages.update (pollUpdates) mesmo com fromMe", () => {
    const e = lerWebhook({
      event: "MESSAGES_UPDATE",
      data: { keyId: "POLL1", remoteJid: "5511987654321@s.whatsapp.net", fromMe: true, pollUpdates: [{ vote: { selectedOptions: [{ name: "✅ Confirmar pedido" }] } }] },
    })!;
    expect(e.tipo).toBe("voto");
    expect(e.pollId).toBe("POLL1");
    expect(e.selecionadas).toEqual(["✅ Confirmar pedido"]);
  });

  it("ignora atualização de status de entrega", () => {
    expect(lerWebhook({ event: "messages.update", data: { keyId: "A", remoteJid: "5511987654321@s.whatsapp.net", status: "READ" } })).toBeNull();
  });

  it("usa o senderPn quando o chat vem como @lid", () => {
    const e = lerWebhook({ event: "messages.upsert", data: { key: { remoteJid: "999@lid", senderPn: "5511987654321@s.whatsapp.net", id: "L1" }, message: { conversation: "1" } } })!;
    expect(e.telefoneChave).toBe("551187654321");
    expect(e.jid).toBe("999@lid");
  });
});

describe("escolha", () => {
  const ops = ENQUETE_CONFIRMAR.opcoes;
  it("aceita número, número com ponto e o texto da opção", async () => {
    expect(await escolha(texto("1"), ops)).toBe(0);
    expect(await escolha(texto(" 2. "), ops)).toBe(1);
    expect(await escolha(texto("falar com a ruiva"), ops)).toBe(2);
    expect(await escolha(texto("9"), ops)).toBeNull();
    expect(await escolha(texto("quero 1 panetone a mais"), ops)).toBeNull();
  });

  it("aceita voto com hash SHA-256 em bytes ou base64", async () => {
    const buf = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ops[1])));
    const bytes = { tipo: "voto", dedupeId: "a", jid: "j", telefoneChave: null, selecionadas: [] } as any;
    const comBytes = lerWebhook({
      event: "messages.upsert",
      data: { key: { remoteJid: "5511987654321@s.whatsapp.net", id: "H1" }, message: { pollUpdateMessage: { pollCreationMessageKey: { id: "P" }, vote: { selectedOptions: [{ type: "Buffer", data: [...buf] }] } } } },
    })!;
    expect(await escolha(comBytes, ops)).toBe(1);
    const b64 = btoa(String.fromCharCode(...buf));
    expect(await escolha({ ...bytes, selecionadas: [b64] }, ops)).toBe(1);
  });
});

describe("fluxo completo", () => {
  it("cardápio → resumo → enquete, confirma, paga com Pix", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    expect(t.enviados.map((e) => e.tipo)).toEqual(["texto", "texto", "enquete"]);
    expect(t.enviados[0].conteudo[0]).toContain("Oi, Maria!");
    expect(t.enviados[1].conteudo[0]).toContain("Pedido #QR-0101");
    expect(t.conversa().step).toBe("aguardando_confirmacao");

    const pollConfirmar = t.conversa().poll_message_id!;
    await tratarEntrada(votoUpsert(pollConfirmar, "✅ Confirmar pedido"), t.portas);
    expect(t.conversa().step).toBe("aguardando_pagamento");
    expect(t.conversa().poll_options).toEqual(ENQUETE_PAGAMENTO.opcoes);

    // voto atrasado na enquete antiga não faz nada
    const antes = t.enviados.length;
    await tratarEntrada(votoUpsert(pollConfirmar, "💬 Falar com a Ruiva"), t.portas);
    expect(t.enviados.length).toBe(antes);

    await tratarEntrada(votoUpsert(t.conversa().poll_message_id!, ENQUETE_PAGAMENTO.opcoes[0]), t.portas);
    expect(t.pedido.status).toBe("confirmado");
    expect(t.pedido.pagamento).toBe("pix");
    const textos = t.enviados.map((e) => String(e.conteudo[0]).replace(/\u00a0/g, " "));
    expect(textos.some((s) => s.includes("pix@ruiva.com") && s.includes("R$ 74,90"))).toBe(true);
    expect(textos.some((s) => s.includes("confirmado!"))).toBe(true);
    expect(t.enviados.at(-1)!.para).toBe("5511900000000"); // aviso para a Ruiva
    expect(t.conversa().step).toBe("confirmado");
  });

  it("usa imagem do cardápio quando configurada", async () => {
    const t = montar({ imagem: "https://exemplo.com/cardapio.png" });
    await iniciarConversa(t.pedido, produtos, t.portas);
    expect(t.enviados[0].tipo).toBe("imagem");
  });

  it("resposta numerada funciona como a enquete", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    await tratarEntrada(texto("1"), t.portas);
    await tratarEntrada(texto("3"), t.portas);
    expect(t.pedido.pagamento).toBe("cartao");
    expect(t.conversa().step).toBe("confirmado");
  });

  it("número sem o nono dígito ainda encontra a conversa", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    await tratarEntrada(texto("1", "551187654321@s.whatsapp.net"), t.portas);
    expect(t.conversa().step).toBe("aguardando_pagamento");
  });

  it("alterar manda o link de edição", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    await tratarEntrada(texto("2"), t.portas);
    expect(String(t.enviados.at(-1)!.conteudo[0])).toContain("https://encomendas.exemplo.com/?editar=tok-123");
    expect(t.conversa().step).toBe("alterando");
  });

  it("falar com a Ruiva silencia o bot até mandar menu", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    await tratarEntrada(texto("3"), t.portas);
    expect(t.conversa().step).toBe("humano");
    expect(t.enviados.at(-1)!.para).toBe("5511900000000");
    const antes = t.enviados.length;
    await tratarEntrada(texto("oi, tem sem uva-passa?"), t.portas);
    expect(t.enviados.length).toBe(antes);
    await tratarEntrada(texto("menu"), t.portas);
    expect(t.conversa().step).toBe("aguardando_confirmacao");
    expect(t.enviados.at(-1)!.tipo).toBe("enquete");
  });

  it("texto solto recebe ajuda, no máximo a cada 2 minutos", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    const base = t.enviados.length;
    await tratarEntrada(texto("oi"), t.portas);
    await tratarEntrada(texto("alô?"), t.portas);
    expect(t.enviados.length).toBe(base + 1);
    expect(String(t.enviados.at(-1)!.conteudo[0])).toContain("*1* - ✅ Confirmar pedido");
    t.avancar(3 * 60 * 1000);
    await tratarEntrada(texto("??"), t.portas);
    expect(t.enviados.length).toBe(base + 2);
  });

  it("não processa o mesmo evento duas vezes e ignora quem não fez pedido", async () => {
    const t = montar();
    await iniciarConversa(t.pedido, produtos, t.portas);
    const e = texto("1");
    await tratarEntrada(e, t.portas);
    await tratarEntrada(e, t.portas);
    expect(t.enviados.filter((x) => x.tipo === "enquete").length).toBe(2);
    const antes = t.enviados.length;
    await tratarEntrada(texto("1", "5521999998888@s.whatsapp.net"), t.portas);
    expect(t.enviados.length).toBe(antes);
  });
});
