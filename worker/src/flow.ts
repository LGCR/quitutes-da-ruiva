// Máquina de estados da conversa no WhatsApp.
//
//  pedido criado ──► aguardando_confirmacao ──(1 Confirmar)──► aguardando_pagamento ──(Pix/Dinheiro/Cartão)──► confirmado
//                          │ (2 Alterar) ──► alterando   (novo envio do form reinicia a conversa)
//                          └ (3 Ruiva)   ──► humano      (bot fica quieto; "menu" religa)
import type { Enviador } from "./evolution";
import { ENQUETE_CONFIRMAR, ENQUETE_PAGAMENTO, PAGAMENTOS, ajudaNumerada, cardapioTexto, legendaCardapio, msg, resumoPedido } from "./messages";
import type { Conversa, Pagamento, Pedido, Produto, Step } from "./types";
import { escolha, type Entrada } from "./webhook";

export interface Portas {
  buscarConversa(por: { telefoneChave?: string | null; pollId?: string | null }): Promise<Conversa | null>;
  salvarConversa(c: Conversa): Promise<void>;
  buscarPedido(id: string): Promise<Pedido | null>;
  atualizarPedido(id: string, patch: { status?: "confirmado"; pagamento?: Pagamento; confirmado_em?: string }): Promise<void>;
  /** true se o id é novo; false se já foi processado */
  marcarProcessado(id: string): Promise<boolean>;
  enviar: Enviador;
  agora(): Date;
  config: { siteUrl: string; pixKey?: string; ruivaPhone?: string; cardapioImagemUrl?: string };
}

const AJUDA_INTERVALO_MS = 2 * 60 * 1000;

/** Manda cardápio, resumo e a enquete de confirmação. Chamado quando o pedido é criado (ou reenviado no admin). */
export async function iniciarConversa(pedido: Pedido, produtos: Produto[], p: Portas): Promise<void> {
  const num = pedido.telefone;
  const r1 = p.config.cardapioImagemUrl
    ? await p.enviar.imagem(num, p.config.cardapioImagemUrl, legendaCardapio(pedido.nome))
    : await p.enviar.texto(num, cardapioTexto(pedido.nome, produtos));
  await p.enviar.texto(num, resumoPedido(pedido));
  const enquete = await p.enviar.enquete(num, ENQUETE_CONFIRMAR.pergunta, ENQUETE_CONFIRMAR.opcoes);
  await p.salvarConversa({
    telefone_chave: pedido.telefone_chave,
    jid: enquete.jid ?? r1.jid ?? `${num}@s.whatsapp.net`,
    order_id: pedido.id,
    step: "aguardando_confirmacao",
    poll_message_id: enquete.id,
    poll_options: ENQUETE_CONFIRMAR.opcoes,
    ultimo_help_em: null,
  });
}

export async function tratarEntrada(e: Entrada, p: Portas): Promise<void> {
  const conversa =
    (e.pollId ? await p.buscarConversa({ pollId: e.pollId }) : null) ??
    (e.telefoneChave ? await p.buscarConversa({ telefoneChave: e.telefoneChave }) : null);
  // Só responde quem fez pedido pelo formulário: o número da Ruiva continua livre para outras conversas.
  if (!conversa) return;
  if (!(await p.marcarProcessado(e.dedupeId))) return;

  const pedido = await p.buscarPedido(conversa.order_id);
  if (!pedido || pedido.status === "substituido" || pedido.status === "cancelado") return;

  const para = conversa.jid;
  const salvar = (step: Step, extra: Partial<Conversa> = {}) => p.salvarConversa({ ...conversa, step, ...extra });

  if (e.tipo === "texto" && /^\s*menu\s*$/i.test(e.texto ?? "")) {
    if (pedido.status === "pendente") {
      await p.enviar.texto(para, resumoPedido(pedido));
      const enq = await p.enviar.enquete(para, ENQUETE_CONFIRMAR.pergunta, ENQUETE_CONFIRMAR.opcoes);
      await salvar("aguardando_confirmacao", { poll_message_id: enq.id, poll_options: ENQUETE_CONFIRMAR.opcoes });
    } else {
      await p.enviar.texto(para, msg.statusAtual(pedido));
      await salvar("confirmado", { poll_message_id: null, poll_options: [] });
    }
    return;
  }

  if (conversa.step !== "aguardando_confirmacao" && conversa.step !== "aguardando_pagamento") return;

  // Voto numa enquete antiga (por exemplo, a de confirmação depois de já ter confirmado): ignora.
  if (e.tipo === "voto" && e.pollId && conversa.poll_message_id && e.pollId !== conversa.poll_message_id) return;

  const i = await escolha(e, conversa.poll_options);

  if (i === null) {
    if (e.tipo === "voto") return; // voto removido ou ilegível
    const ultimo = conversa.ultimo_help_em ? Date.parse(conversa.ultimo_help_em) : 0;
    if (p.agora().getTime() - ultimo < AJUDA_INTERVALO_MS) return;
    await p.enviar.texto(para, ajudaNumerada(conversa.poll_options));
    await salvar(conversa.step, { ultimo_help_em: p.agora().toISOString() });
    return;
  }

  if (conversa.step === "aguardando_confirmacao") {
    if (i === 0) {
      await p.enviar.texto(para, msg.confirmouItens());
      const enq = await p.enviar.enquete(para, ENQUETE_PAGAMENTO.pergunta, ENQUETE_PAGAMENTO.opcoes);
      await salvar("aguardando_pagamento", { poll_message_id: enq.id, poll_options: ENQUETE_PAGAMENTO.opcoes, ultimo_help_em: null });
    } else if (i === 1) {
      await p.enviar.texto(para, msg.linkAlterar(p.config.siteUrl, pedido.edit_token));
      await salvar("alterando", { poll_message_id: null, poll_options: [] });
    } else {
      await p.enviar.texto(para, msg.chamouRuiva());
      await salvar("humano", { poll_message_id: null, poll_options: [] });
      if (p.config.ruivaPhone) await p.enviar.texto(p.config.ruivaPhone, msg.avisoRuivaHumano(pedido)).catch(() => {});
    }
    return;
  }

  // aguardando_pagamento
  const pagamento = PAGAMENTOS[i];
  await p.atualizarPedido(pedido.id, { status: "confirmado", pagamento, confirmado_em: p.agora().toISOString() });
  if (pagamento === "pix") {
    await p.enviar.texto(para, msg.pix(pedido.total_centavos, p.config.pixKey ?? "(chave Pix não configurada)"));
  } else {
    await p.enviar.texto(para, msg.pagamentoNaEntrega(pagamento));
  }
  await p.enviar.texto(para, msg.confirmado(pedido));
  await salvar("confirmado", { poll_message_id: null, poll_options: [] });
  if (p.config.ruivaPhone) await p.enviar.texto(p.config.ruivaPhone, msg.avisoRuivaConfirmado(pedido)).catch(() => {});
}
