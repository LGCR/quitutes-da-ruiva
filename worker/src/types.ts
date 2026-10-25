export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  EVOLUTION_URL: string;
  EVOLUTION_KEY: string;
  EVOLUTION_INSTANCE: string;
  EVOLUTION_MOCK?: string;
  WEBHOOK_TOKEN: string;
  ADMIN_EMAILS: string;
  PIX_KEY?: string;
  RUIVA_PHONE?: string;
  TURNSTILE_SECRET?: string;
  SITE_URL: string;
  ALLOWED_ORIGINS?: string;
  CARDAPIO_IMAGE_URL?: string;
}

export type Step = "aguardando_confirmacao" | "aguardando_pagamento" | "alterando" | "confirmado" | "humano";
export type StatusPedido = "pendente" | "confirmado" | "substituido" | "cancelado" | "entregue";
export type Pagamento = "pix" | "dinheiro" | "cartao";

export interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  peso_g: number | null;
  preco_centavos: number;
  qtd_minima: number;
  ativo: boolean;
  ordem: number;
}

export interface DataEntrega {
  id: string;
  rotulo: string;
  ativo: boolean;
  ordem: number;
}

export interface ItemPedido {
  product_id: string;
  nome: string;
  qtd: number;
  preco_unit_centavos: number;
}

export interface Pedido {
  id: string;
  codigo: string;
  nome: string;
  telefone: string;
  telefone_chave: string;
  tipo_entrega: "retirada" | "entrega";
  endereco: string | null;
  data_entrega_id: string;
  data_rotulo: string;
  obs: string | null;
  pagamento: Pagamento | null;
  status: StatusPedido;
  total_centavos: number;
  edit_token: string;
  itens: ItemPedido[];
}

export interface Conversa {
  telefone_chave: string;
  jid: string;
  order_id: string;
  step: Step;
  poll_message_id: string | null;
  poll_options: string[];
  ultimo_help_em: string | null;
}
