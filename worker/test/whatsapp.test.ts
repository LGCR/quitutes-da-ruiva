import { afterEach, describe, expect, it, vi } from "vitest";
import { brl, msg } from "../src/messages";
import type { Pedido } from "../src/types";
import { criarWhatsapp, ErroWhatsapp, instancias } from "../src/whatsapp";

const cfg = { url: "https://wa.exemplo.com/", key: "chave-123" };

function novoPedido(extra: Partial<Pedido> = {}): Pedido {
  return {
    id: "o1", codigo: "QR-0101", nome: "Maria Silva", telefone: "5511987654321", telefone_chave: "551187654321",
    tipo_entrega: "retirada", endereco: null, data_entrega_id: "19-20-dez", data_rotulo: "Sábado 19 ou domingo 20 de dezembro",
    obs: null, pagamento: null, status: "pendente", total_centavos: 14980, edit_token: "tok-123",
    optin_whatsapp: true, substitui_id: null,
    itens: [{ product_id: "chocotone", nome: "Chocotone", qtd: 2, preco_unit_centavos: 7490 }],
    ...extra,
  };
}

const resposta = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function mockFetch(...respostas: Response[]) {
  const f = vi.fn(async (..._a: [RequestInfo | URL, RequestInit?]) => respostas.shift() ?? resposta(202, { success: true, data: {} }));
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("envio pelo whatsapp-backend", () => {
  it("manda texto como multipart com a API key e a instância", async () => {
    const f = mockFetch(resposta(202, { success: true, data: { providerMessageId: "X", status: "SENT" } }));
    await criarWhatsapp({ ...cfg, instanceId: "inst-1" }).texto("5511987654321", "Oi");

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://wa.exemplo.com/api/v1/messages");
    expect(init!.method).toBe("POST");
    expect((init!.headers as Record<string, string>)["X-API-Key"]).toBe("chave-123");
    const form = init!.body as FormData;
    expect(form.get("instanceId")).toBe("inst-1");
    expect(form.get("to")).toBe("5511987654321");
    expect(form.get("type")).toBe("TEXT");
    expect(form.get("body")).toBe("Oi");
  });

  it("baixa a imagem do cardápio e manda como arquivo com legenda", async () => {
    const f = mockFetch(new Response(new Blob(["jpg"], { type: "image/jpeg" })), resposta(202, { success: true, data: {} }));
    await criarWhatsapp({ ...cfg, instanceId: "inst-1" }).imagem("5511987654321", "https://site/cardapio.jpg", "Cardápio");

    expect(f.mock.calls[0][0]).toBe("https://site/cardapio.jpg");
    const form = f.mock.calls[1][1]!.body as FormData;
    expect(form.get("type")).toBe("IMAGE");
    expect(form.get("body")).toBe("Cardápio");
    expect((form.get("file") as File).name).toBe("cardapio.jpg");
  });

  it("usa o baixador informado para a imagem (service binding do site)", async () => {
    const f = mockFetch(resposta(202, { success: true, data: {} }));
    const baixar = vi.fn(async () => new Response(new Blob(["jpg"], { type: "image/jpeg" })));
    await criarWhatsapp({ ...cfg, instanceId: "inst-1", baixar }).imagem("5511987654321", "https://site/cardapio.jpg", "Cardápio");
    expect(baixar).toHaveBeenCalledWith("https://site/cardapio.jpg");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("explica a assinatura suspensa", async () => {
    mockFetch(resposta(402, { success: false, error: { code: "SUBSCRIPTION_SUSPENDED", message: "Payment required" } }));
    const p = criarWhatsapp({ ...cfg, instanceId: "inst-1" }).texto("5511987654321", "Oi");
    await expect(p).rejects.toThrow(/assinatura do WhatsApp está suspensa/);
  });

  it("falha sem instância conectada, sem chamar a API", async () => {
    const f = mockFetch();
    await expect(criarWhatsapp({ ...cfg, instanceId: null }).texto("5511987654321", "Oi")).rejects.toThrow(/aba WhatsApp/);
    expect(f).not.toHaveBeenCalled();
  });

  it("mock só registra no log", async () => {
    const f = mockFetch();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await criarWhatsapp({ ...cfg, instanceId: null, mock: true }).texto("5511987654321", "Oi");
    expect(f).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("instâncias", () => {
  it("desembrulha o envelope e pede QR novo ao conectar", async () => {
    const f = mockFetch(resposta(200, { success: true, data: { instanceId: "inst-1", status: "WAITING_QRCODE", qrCodeImage: "data:image/png;base64,AAA" } }));
    const r = await instancias(cfg).conectar("inst-1");
    expect(r.qrCodeImage).toContain("data:image/png");
    expect(f.mock.calls[0][0]).toBe("https://wa.exemplo.com/api/v1/instances/inst-1/connect?forceQr=true");
  });

  it("devolve o status HTTP no erro (404 = instância sumiu)", async () => {
    mockFetch(resposta(404, { success: false, error: { code: "NOT_FOUND", message: "Instance not found" } }));
    const err = await instancias(cfg).ver("x").catch((e) => e);
    expect(err).toBeInstanceOf(ErroWhatsapp);
    expect(err.status).toBe(404);
  });
});

describe("mensagens", () => {
  it("pedido recebido tem o resumo e o link para alterar", () => {
    const t = msg.pedidoRecebido(novoPedido(), "https://encomendas.exemplo.com/");
    expect(t).toContain("*Pedido #QR-0101*");
    expect(t).toContain("https://encomendas.exemplo.com/?editar=tok-123");
  });

  it("confirmado só manda a chave Pix quando o pagamento é Pix", () => {
    expect(msg.statusConfirmado(novoPedido({ pagamento: "pix" }), "pix@ruiva.com")).toContain(brl(7490));
    expect(msg.statusConfirmado(novoPedido({ pagamento: "pix" }), "pix@ruiva.com")).toContain("pix@ruiva.com");
    expect(msg.statusConfirmado(novoPedido({ pagamento: "dinheiro" }), "pix@ruiva.com")).not.toContain("pix@ruiva.com");
  });

  it("aviso para a Ruiva diferencia pedido alterado", () => {
    expect(msg.avisoRuivaNovo(novoPedido())).toMatch(/^🔔 Novo pedido #QR-0101/);
    expect(msg.avisoRuivaNovo(novoPedido({ substitui_id: "o0" }))).toMatch(/^✏️ Pedido alterado/);
  });
});
