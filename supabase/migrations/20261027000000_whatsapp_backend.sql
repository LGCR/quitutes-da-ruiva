-- WhatsApp passa a sair pelo whatsapp-backend. A instância é criada e conectada pelo painel
-- (aba WhatsApp) e o id dela fica guardado aqui, numa linha só.
-- conversations e processed_messages ficam no banco para quando o bot voltar.

create table whatsapp_config (
  id             boolean primary key default true check (id),
  instance_id    text,
  instance_name  text,
  updated_at     timestamptz not null default now()
);

alter table whatsapp_config enable row level security;
