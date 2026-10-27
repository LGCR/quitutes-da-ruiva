(() => {
  const CFG = window.QR_CONFIG || {};
  const API = (CFG.apiBase || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  let produtos = [];
  const qtd = {};
  const editToken = new URLSearchParams(location.search).get("editar");
  let turnstileToken = "";

  // Logo: se o arquivo não existir, mostra o selo desenhado
  desenharSelo();
  $("logo").addEventListener("error", () => { $("logo").hidden = true; $("selo").hidden = false; });
  if ($("logo").complete && !$("logo").naturalWidth) $("logo").dispatchEvent(new Event("error"));

  if (CFG.prazo) $("prazo").textContent = CFG.prazo;

  function desenharSelo() {
    const borda = (rx, ry, n, amp) => {
      let d = "";
      for (let i = 0; i <= 720; i++) {
        const t = (i / 720) * Math.PI * 2;
        const k = 1 + amp * Math.cos(n * t);
        d += (i ? "L" : "M") + (200 + rx * k * Math.cos(t)).toFixed(1) + " " + (230 + ry * k * Math.sin(t)).toFixed(1);
      }
      return d + "Z";
    };
    $("selo-fundo").setAttribute("d", borda(186, 216, 22, 0.022));
    $("selo-dentro").setAttribute("d", borda(170, 200, 22, 0.022));
  }

  // Cardápio ----------------------------------------------------------------

  // Tamanhos do mesmo sabor (500 g, 100 g) ficam juntos num card só
  function porSabor() {
    const grupos = new Map();
    for (const p of produtos) {
      const k = p.sabor || p.nome;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(p);
    }
    return [...grupos];
  }

  function renderMenu() {
    if (!produtos.length) {
      $("menu").innerHTML = `<div class="carregando">O cardápio abre em breve. Volte mais tarde ou chame a Ruiva no WhatsApp.</div>`;
      return;
    }
    const grupos = porSabor();
    $("menu").innerHTML = grupos.map(([sabor, ps]) => `
      <div class="sabor ${ps.some((p) => qtd[p.id]) ? "on" : ""}">
        <svg class="azevinho esq" viewBox="0 0 30 22" aria-hidden="true"><use href="#azevinho"/></svg>
        <svg class="azevinho" viewBox="0 0 30 22" aria-hidden="true"><use href="#azevinho"/></svg>
        <img class="foto" src="/assets/sabores/${esc(ps[0].id.replace(/-\d+$/, ""))}.jpg" alt="" width="190" height="143" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="info">
          <h3>${esc(sabor)}</h3>
          ${ps[0].descricao ? `<p>${esc(ps[0].descricao)}</p>` : ""}
        </div>
        <div class="tamanhos">
          ${ps.map((p) => {
            const rotulo = p.tamanho || (p.peso_g ? `${p.peso_g} g` : "");
            return `
            <div class="tam">
              ${rotulo ? `<span class="peso">${esc(rotulo)}</span>` : ""}
              <span class="preco">${brl(p.preco_centavos)}</span>
              <div class="step" role="group" aria-label="Quantidade de ${esc(p.nome)}">
                <button type="button" id="menos-${p.id}" data-id="${p.id}" data-d="-1" aria-label="Menos ${esc(p.nome)}">−</button>
                <output aria-live="polite">${qtd[p.id] || 0}</output>
                <button type="button" id="mais-${p.id}" data-id="${p.id}" data-d="1" aria-label="Mais ${esc(p.nome)}">+</button>
              </div>
              ${p.qtd_minima > 1 ? `<small class="min">mín. ${p.qtd_minima}</small>` : ""}
            </div>`;
          }).join("")}
        </div>
      </div>`).join("") +
      `<p class="nota">Tudo feito com ingredientes selecionados e muito carinho! ♥</p>`;
  }

  $("menu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    const p = produtos.find((x) => x.id === b.dataset.id);
    const d = Number(b.dataset.d);
    let v = (qtd[p.id] || 0) + d;
    if (p.qtd_minima > 1) {
      if (d > 0 && v < p.qtd_minima) v = p.qtd_minima;
      if (d < 0 && v < p.qtd_minima) v = 0;
    }
    qtd[p.id] = Math.max(0, Math.min(100, v));
    renderMenu();
    $(b.id)?.focus();
    atualizarTotal();
  });

  function itens() { return produtos.filter((p) => qtd[p.id] > 0).map((p) => ({ product_id: p.id, qtd: qtd[p.id], preco: p.preco_centavos })); }

  function atualizarTotal() {
    const its = itens();
    const n = its.reduce((s, i) => s + i.qtd, 0);
    $("total").textContent = brl(its.reduce((s, i) => s + i.qtd * i.preco, 0));
    $("qtd-l").textContent = n ? `Total · ${n} ${n > 1 ? "panetones" : "panetone"}` : "Total";
  }

  // Campos ------------------------------------------------------------------

  function mascaraTelefone(v) {
    let d = v.replace(/\D/g, "");
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length > 7) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return d;
  }
  $("telefone").addEventListener("input", (e) => { e.target.value = mascaraTelefone(e.target.value); });
  const tipo = () => document.querySelector("input[name=tipo]:checked").value;
  document.querySelectorAll("input[name=tipo]").forEach((r) => r.addEventListener("change", () => { $("box-endereco").hidden = tipo() !== "entrega"; }));

  function mostrarErros(campos) {
    for (const k of ["itens", "nome", "telefone", "endereco", "data", "optin"]) {
      $("err-" + k).textContent = campos[k] || "";
      const el = $(k === "itens" ? "menu" : k);
      if (el && el.tagName !== "DIV") el.classList.toggle("invalid", !!campos[k]);
    }
    const primeiro = ["itens", "nome", "telefone", "endereco", "data", "optin"].find((k) => campos[k]);
    if (primeiro) {
      const el = $(primeiro === "itens" ? "menu" : primeiro);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (primeiro !== "itens") el.focus({ preventScroll: true });
    }
  }

  function validar() {
    const c = {};
    if (!itens().length) c.itens = "Escolha pelo menos um panetone.";
    if ($("nome").value.trim().length < 2) c.nome = "Digite seu nome.";
    if ($("telefone").value.replace(/\D/g, "").length !== 11) c.telefone = "Digite o WhatsApp com DDD, como (11) 98765-4321.";
    if (tipo() === "entrega" && $("endereco").value.trim().length < 5) c.endereco = "Informe o endereço com o bairro.";
    if (!$("data").value) c.data = "Escolha uma data.";
    if (!$("optin").checked) c.optin = "Precisamos dessa autorização para mandar a confirmação no WhatsApp.";
    return c;
  }

  // Envio -------------------------------------------------------------------

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("erro-geral").hidden = true;
    const campos = validar();
    mostrarErros(campos);
    if (Object.keys(campos).length) return;
    if (CFG.turnstileSiteKey && !turnstileToken) {
      $("erro-geral").textContent = "Aguarde a verificação anti-robô terminar e envie de novo.";
      $("erro-geral").hidden = false;
      return;
    }

    const btn = $("enviar");
    btn.disabled = true;
    btn.textContent = "Enviando…";
    try {
      const r = await fetch(`${API}/api/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: $("nome").value,
          telefone: $("telefone").value,
          tipo_entrega: tipo(),
          endereco: $("endereco").value,
          data_entrega_id: $("data").value,
          obs: $("obs").value,
          optin: $("optin").checked,
          itens: itens().map(({ product_id, qtd }) => ({ product_id, qtd })),
          edit_token: editToken || undefined,
          turnstile_token: turnstileToken || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.campos) mostrarErros(j.campos);
        throw new Error(j.erro || "Não foi possível enviar agora. Tente de novo em instantes.");
      }
      $("ok-codigo").textContent = `Pedido #${j.codigo}`;
      $("ok-texto").textContent = j.whatsapp
        ? `${$("nome").value.trim().split(/\s+/)[0]}, em instantes chega no seu WhatsApp (${$("telefone").value}) o cardápio e o resumo do pedido. Responda por lá para confirmar e combinar o pagamento.`
        : "Recebemos seu pedido. A Ruiva vai entrar em contato para confirmar.";
      $("card-form").hidden = true;
      $("card-ok").hidden = false;
      $("card-ok").scrollIntoView({ behavior: "smooth", block: "center" });
      if (editToken) history.replaceState(null, "", location.pathname);
    } catch (err) {
      $("erro-geral").textContent = err.message === "Failed to fetch" ? "Sem conexão com o servidor. Confira sua internet e tente de novo." : err.message;
      $("erro-geral").hidden = false;
      window.turnstile?.reset();
      turnstileToken = "";
    } finally {
      btn.disabled = false;
      btn.textContent = "Enviar pedido";
    }
  });

  $("novo").addEventListener("click", () => {
    for (const k in qtd) qtd[k] = 0;
    $("form").reset();
    $("box-endereco").hidden = true;
    renderMenu();
    atualizarTotal();
    $("card-ok").hidden = true;
    $("card-form").hidden = false;
    $("aviso-edicao").hidden = true;
  });

  // Turnstile (opcional)
  if (CFG.turnstileSiteKey) {
    window.onTurnstileLoad = () => window.turnstile.render("#turnstile", {
      sitekey: CFG.turnstileSiteKey,
      language: "pt-BR",
      callback: (t) => { turnstileToken = t; },
      "expired-callback": () => { turnstileToken = ""; },
    });
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    s.async = true;
    document.head.appendChild(s);
  }

  // Início ------------------------------------------------------------------

  async function iniciar() {
    try {
      const r = await fetch(`${API}/api/catalogo`);
      if (!r.ok) throw new Error();
      const { produtos: ps, datas } = await r.json();
      produtos = ps;
      $("data").innerHTML = datas.map((d) => `<option value="${esc(d.id)}">${esc(d.rotulo)}</option>`).join("");
    } catch {
      $("menu").innerHTML = `<div class="carregando">Não conseguimos carregar o cardápio. Recarregue a página.</div>`;
      return;
    }

    if (editToken) {
      try {
        const r = await fetch(`${API}/api/pedidos/${encodeURIComponent(editToken)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro);
        $("nome").value = j.nome;
        $("telefone").value = mascaraTelefone(j.telefone);
        document.getElementById(`tipo-${j.tipo_entrega}`).checked = true;
        $("box-endereco").hidden = j.tipo_entrega !== "entrega";
        $("endereco").value = j.endereco || "";
        $("data").value = j.data_entrega_id;
        $("obs").value = j.obs || "";
        for (const i of j.itens) qtd[i.product_id] = i.qtd;
        $("aviso-edicao").hidden = false;
        $("cod-edicao").textContent = `#${j.codigo}`;
      } catch (err) {
        $("erro-geral").textContent = err.message || "Esse link de alteração não vale mais. Faça um pedido novo.";
        $("erro-geral").hidden = false;
      }
    }
    renderMenu();
    atualizarTotal();
  }
  iniciar();
})();
