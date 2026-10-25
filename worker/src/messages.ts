import type { Pedido, Produto } from "./types";

export const brl = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

export const ENQUETE_CONFIRMAR = {
  pergunta: "Está tudo certo com o seu pedido?",
  opcoes: ["✅ Confirmar pedido", "✏️ Quero alterar", "💬 Falar com a Ruiva"],
};

export const ENQUETE_PAGAMENTO = {
  pergunta: "Como você prefere pagar?",
  opcoes: ["Pix (50% agora, resto na entrega)", "Dinheiro na entrega", "Cartão na entrega"],
};

export const PAGAMENTOS = ["pix", "dinheiro", "cartao"] as const;

export function legendaCardapio(nome: string) {
  return `Oi, ${primeiroNome(nome)}! Aqui é a Ruiva 🎀\nRecebi sua encomenda de panetone. Esse é o nosso cardápio de Natal.`;
}

export function cardapioTexto(nome: string, produtos: Produto[]) {
  const linhas = produtos
    .filter((p) => p.ativo)
    .map((p) => `• *${p.nome}*${p.peso_g ? ` (${p.peso_g} g)` : ""} — ${brl(p.preco_centavos)}`);
  return `${legendaCardapio(nome)}\n\n🎄 *Cardápio de Natal*\n${linhas.join("\n")}`;
}

export function resumoPedido(p: Pedido) {
  const itens = p.itens.map((i) => `• ${i.qtd}x ${i.nome} — ${brl(i.qtd * i.preco_unit_centavos)}`).join("\n");
  const entrega = p.tipo_entrega === "entrega" ? `🚗 Entrega: ${p.endereco ?? ""}` : "🏠 Retirada com a Ruiva";
  const obs = p.obs ? `\n📝 ${p.obs}` : "";
  return `*Pedido #${p.codigo}*\n${itens}\n\n*Total: ${brl(p.total_centavos)}*\n${entrega}\n📅 ${p.data_rotulo}${obs}`;
}

export function ajudaNumerada(opcoes: string[]) {
  return `Não entendi 🙈 Toque em uma opção da enquete acima ou responda com o número:\n${opcoes
    .map((o, i) => `*${i + 1}* - ${o}`)
    .join("\n")}`;
}

export const msg = {
  confirmouItens: () => "Oba! Seu panetone já está reservado 🥰",
  linkAlterar: (siteUrl: string, token: string) =>
    `Sem problema! Ajuste seu pedido por este link e eu te mando o resumo de novo:\n${siteUrl.replace(/\/+$/, "")}/?editar=${token}`,
  chamouRuiva: () => "Chamei a Ruiva! Ela responde por aqui rapidinho. Pode ir escrevendo sua dúvida 💬",
  pix: (total: number, chave: string) =>
    `Perfeito! Faça o Pix de *${brl(Math.round(total / 2))}* (50% do pedido) para a chave:\n*${chave}*\n\nDepois é só mandar o comprovante aqui 📎`,
  pagamentoNaEntrega: (tipo: "dinheiro" | "cartao") =>
    `Combinado, pagamento ${tipo === "dinheiro" ? "em dinheiro" : "no cartão"} na entrega.`,
  confirmado: (p: Pedido) =>
    `🎀 *Pedido #${p.codigo} confirmado!*\nPerto da data (${p.data_rotulo}) eu te lembro por aqui. Obrigada por escolher a Quitutes da Ruiva!`,
  avisoRuivaHumano: (p: Pedido) =>
    `🔔 ${p.nome} (${p.telefone}) pediu para falar com você sobre o pedido #${p.codigo}. O bot parou de responder essa conversa. Para religar, peça para a pessoa mandar "menu".`,
  avisoRuivaConfirmado: (p: Pedido) =>
    `✅ Novo pedido confirmado #${p.codigo}: ${p.nome}, ${brl(p.total_centavos)} (${p.itens.map((i) => `${i.qtd}x ${i.nome}`).join(", ")}).`,
  statusAtual: (p: Pedido) =>
    `${resumoPedido(p)}\n\nStatus: *${p.status === "confirmado" ? "confirmado" : p.status === "pendente" ? "aguardando confirmação" : p.status}*`,
};
