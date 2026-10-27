import type { Pedido, Produto } from "./types";

export const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

export function legendaCardapio(nome: string) {
  return `Oi, ${primeiroNome(nome)}! Aqui é a Ruiva 🎀\nRecebi sua encomenda de panetone. Esse é o nosso cardápio de Natal.`;
}

export function cardapioTexto(nome: string, produtos: Produto[]) {
  const linhas = produtos
    .filter((p) => p.ativo)
    .map((p) => `• *${p.nome}*${p.peso_g && !p.tamanho ? ` (${p.peso_g} g)` : ""} — ${brl(p.preco_centavos)}`);
  return `${legendaCardapio(nome)}\n\n🎄 *Cardápio de Natal*\n${linhas.join("\n")}`;
}

export function resumoPedido(p: Pedido) {
  const itens = p.itens.map((i) => `• ${i.qtd}x ${i.nome} — ${brl(i.qtd * i.preco_unit_centavos)}`).join("\n");
  const entrega = p.tipo_entrega === "entrega" ? `🚗 Entrega: ${p.endereco ?? ""}` : "🏠 Retirada com a Ruiva";
  const obs = p.obs ? `\n📝 ${p.obs}` : "";
  return `*Pedido #${p.codigo}*\n${itens}\n\n*Total: ${brl(p.total_centavos)}*\n${entrega}\n📅 ${p.data_rotulo}${obs}`;
}

const linkAlterar = (siteUrl: string, token: string) => `${siteUrl.replace(/\/+$/, "")}/?editar=${token}`;

export const msg = {
  pedidoRecebido: (p: Pedido, siteUrl: string) =>
    `${resumoPedido(p)}\n\nPara confirmar e combinar o pagamento, é só responder esta mensagem 💬\nSe quiser mudar algo, ajuste por aqui:\n${linkAlterar(siteUrl, p.edit_token)}`,
  statusConfirmado: (p: Pedido, pixKey?: string) => {
    const pix = p.pagamento === "pix" && pixKey
      ? `\n\nO Pix de *${brl(Math.round(p.total_centavos / 2))}* (50% do pedido) vai para a chave:\n*${pixKey}*\nDepois é só mandar o comprovante aqui 📎`
      : "";
    return `🎀 *Pedido #${p.codigo} confirmado!*\nTe vejo em ${p.data_rotulo}. Obrigada por escolher a Quitutes da Ruiva!${pix}`;
  },
  statusEntregue: (p: Pedido) =>
    `🎄 Pedido #${p.codigo} entregue! Obrigada, ${primeiroNome(p.nome)}. Bom apetite e feliz Natal! 🎀`,
  statusCancelado: (p: Pedido) =>
    `O pedido #${p.codigo} foi cancelado. Se foi engano ou quiser fazer outro, é só responder aqui 💬`,
  avisoRuivaNovo: (p: Pedido) =>
    `${p.substitui_id ? "✏️ Pedido alterado pelo cliente" : "🔔 Novo pedido"} #${p.codigo}: ${p.nome} (${p.telefone}), ${brl(p.total_centavos)} — ${p.itens.map((i) => `${i.qtd}x ${i.nome}`).join(", ")}. ${p.tipo_entrega === "entrega" ? "Entrega" : "Retirada"} em ${p.data_rotulo}.`,
  teste: () => "Teste do painel da Quitutes da Ruiva ✅ O WhatsApp está conectado.",
};
