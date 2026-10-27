export interface Env {
  SUPABASE_URL: string;
  /** secret key (sb_secret_...) ou a service_role key antiga */
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  WHATSAPP_BACKEND_URL: string;
  WHATSAPP_API_KEY: string;
  /** "1" = não chama o whatsapp-backend, só registra no log */
  WHATSAPP_MOCK?: string;
  ADMIN_EMAILS: string;
  PIX_KEY?: string;
  RUIVA_PHONE?: string;
  TURNSTILE_SECRET?: string;
  SITE_URL: string;
  ALLOWED_ORIGINS?: string;
  CARDAPIO_IMAGE_URL?: string;
}

export type StatusPedido = "pendente" | "confirmado" | "substituido" | "cancelado" | "entregue";
export type Pagamento = "pix" | "dinheiro" | "cartao";

export interface Produto {
  id: string;
  nome: string;
  descricao: string | null;
  peso_g: number | null;
  sabor: string | null;
  tamanho: string | null;
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
  optin_whatsapp: boolean;
  substitui_id: string | null;
  itens: ItemPedido[];
}
