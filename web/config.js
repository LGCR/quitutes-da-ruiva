// Configuração pública do site (nada aqui é segredo).
window.QR_CONFIG = {
  // Vazio = a API está no mesmo domínio (/api/*). Em desenvolvimento: "http://127.0.0.1:8787"
  apiBase: "",
  // Para o painel /admin (Supabase > Project Settings > API)
  supabaseUrl: "https://tohkbwlvlujxrsqajrjx.supabase.co",
  // chave publicável (sb_publishable_...): pode ficar no site. A secret key fica só no Worker.
  supabaseAnonKey: "sb_publishable_Gd7AStkE6ne0oid9MHEL_w_nlIWzgL-",
  // Cloudflare Turnstile (opcional). Se preencher, configure TURNSTILE_SECRET no Worker.
  turnstileSiteKey: "",
  prazo: "Encomendas até 30 de novembro",
};
