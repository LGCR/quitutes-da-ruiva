// Telefones brasileiros: o cliente digita (11) 98765-4321 e a Evolution manda 5511987654321@s.whatsapp.net,
// às vezes sem o nono dígito (551187654321). A "chave" ignora o nono dígito para casar os dois.

/** Normaliza para 55DDDNÚMERO ou devolve null se não parecer um celular brasileiro. */
export function normalizarTelefone(entrada: string): string | null {
  let d = entrada.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (!d.startsWith("55") || (d.length !== 12 && d.length !== 13)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

/** 55 + DDD + últimos 8 dígitos. */
export function chaveTelefone(numero: string): string | null {
  const d = numero.replace(/\D/g, "");
  if (d.length < 12 || !d.startsWith("55")) return null;
  return d.slice(0, 4) + d.slice(-8);
}

/** Extrai o número de um JID (5511...@s.whatsapp.net). Retorna null para grupos, LIDs e broadcast. */
export function numeroDoJid(jid: string | undefined | null): string | null {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  return jid.split("@")[0].split(":")[0];
}
