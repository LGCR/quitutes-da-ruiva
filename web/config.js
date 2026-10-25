// Configuração pública do site (nada aqui é segredo).
window.QR_CONFIG = {
  // Vazio = a API está no mesmo domínio (/api/*). Em desenvolvimento: "http://127.0.0.1:8787"
  apiBase: "",
  // Para o painel /admin (Supabase > Project Settings > API)
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "SUA-ANON-KEY",
  // Cloudflare Turnstile (opcional). Se preencher, configure TURNSTILE_SECRET no Worker.
  turnstileSiteKey: "",
  prazo: "Encomendas até 30 de novembro",
};
