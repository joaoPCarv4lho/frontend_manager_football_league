/* ============================================================
   Gestão da Liga de Futebol — app mobile-first (vanilla JS)
   Modelo v2: scouts derivados das partidas, mensalidade fixa
   por jogador, pagamento por mês, sorteio de times gravado.
   ============================================================ */

const KEY = "league-manager-v2";

const now = new Date();
const currentMonthIndex = now.getMonth();
const currentYear = now.getFullYear();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const FINANCE_FIELDS = ["almocoRecebido", "almocoDespesa", "convidadosQtd", "convidadosValor", "quadra", "custosDiversos"];

const defaultState = () => ({
  version: 2,
  setupDone: false,
  settings: { monthlyFee: 0 },
  previousYearBalance: 0,
  finance: {},   // key "AAAA-MM" -> { almocoRecebido, almocoDespesa, convidadosQtd, convidadosValor, quadra, custosDiversos, mensalidadeManual|null }
  payments: {},  // key "AAAA-MM" -> { memberId: true }
  members: [],   // { id, name, position, shirt }
  matches: []    // { id, date, teamAName, teamBName, scoreA, scoreB, players:[{memberId, team, shirt, goals, assists}] }
});

let state = loadState();

/* ---------------- Helpers ---------------- */
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && raw.version === 2) return Object.assign(defaultState(), raw);
  } catch (_) {}
  return defaultState();
}
function saveState() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
}
const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseN = (v) => Number.parseFloat(v) || 0;
const monthKey = (year, monthIdx) => `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
const el = (id) => document.getElementById(id);
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const memberById = (id) => state.members.find((m) => m.id === id);

function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

/* ---------------- Cálculos derivados ---------------- */
// Scouts vêm SÓ das partidas.
function scoutsOf(memberId) {
  let goals = 0, assists = 0, games = 0, wins = 0, losses = 0, draws = 0;
  state.matches.forEach((match) => {
    const p = match.players.find((x) => x.memberId === memberId);
    if (!p) return;
    games++;
    goals += parseN(p.goals);
    assists += parseN(p.assists);
    if (p.team === "A" || p.team === "B") {
      const a = parseN(match.scoreA), b = parseN(match.scoreB);
      const won = (p.team === "A" && a > b) || (p.team === "B" && b > a);
      const lost = (p.team === "A" && a < b) || (p.team === "B" && b < a);
      if (won) wins++; else if (lost) losses++; else draws++;
    }
  });
  return { goals, assists, games, wins, losses, draws, total: goals + assists };
}

function paidCount(key) {
  const p = state.payments[key] || {};
  return state.members.reduce((n, m) => n + (p[m.id] ? 1 : 0), 0);
}

// Mensalidade do mês: manual (meses passados do setup) ou automática (pagantes × valor).
function getMensalidade(key) {
  const f = state.finance[key];
  if (f && f.mensalidadeManual != null) return parseN(f.mensalidadeManual);
  return paidCount(key) * parseN(state.settings.monthlyFee);
}

function computeMonthTotals(key) {
  const m = state.finance[key] || {};
  const mensalidade = getMensalidade(key);
  const convidadosReceita = parseN(m.convidadosQtd) * parseN(m.convidadosValor);
  const receitas = mensalidade + parseN(m.almocoRecebido) + convidadosReceita;
  const custos = parseN(m.almocoDespesa) + parseN(m.quadra) + parseN(m.custosDiversos);
  return { mensalidade, convidadosReceita, receitas, custos, saldoMes: receitas - custos };
}

function ensureCurrentMonth() {
  const key = monthKey(currentYear, currentMonthIndex);
  if (!state.finance[key]) {
    // Pré-preenche com o mês anterior (Q13a).
    const prevKey = currentMonthIndex > 0
      ? monthKey(currentYear, currentMonthIndex - 1)
      : monthKey(currentYear - 1, 11);
    const prev = state.finance[prevKey] || {};
    const seed = { mensalidadeManual: null };
    FINANCE_FIELDS.forEach((f) => { seed[f] = f === "convidadosQtd" ? 0 : parseN(prev[f]); });
    // convidados costumam variar; zera a quantidade mas mantém o valor unitário.
    seed.convidadosQtd = 0;
    state.finance[key] = seed;
  }
}

/* ============================================================
   SETUP INICIAL (overlay)
   ============================================================ */
function financeFieldsHTML(prefix, data = {}) {
  const f = (field, label, step = "0.01") =>
    `<label>${label}<input type="number" min="0" step="${step}" data-field="${field}" value="${data[field] ?? 0}" /></label>`;
  return `
    ${f("mensalidadeManual", "Mensalidade recebida (total)")}
    ${f("almocoRecebido", "Recebido p/ almoço")}
    ${f("almocoDespesa", "Despesa do almoço")}
    ${f("convidadosQtd", "Qtd. convidados", "1")}
    ${f("convidadosValor", "Valor por convidado")}
    ${f("quadra", "Quadra")}
    ${f("custosDiversos", "Custos diversos")}
  `;
}

function readFinanceFrom(container, { manual = false } = {}) {
  const get = (field) => {
    const input = container.querySelector(`[data-field="${field}"]`);
    return input ? parseN(input.value) : 0;
  };
  const data = { mensalidadeManual: manual ? get("mensalidadeManual") : null };
  FINANCE_FIELDS.forEach((f) => { data[f] = get(f); });
  return data;
}

function renderSetup() {
  const overlay = el("setup-overlay");
  if (state.setupDone) { overlay.classList.add("hidden"); return; }
  overlay.classList.remove("hidden");

  const pastMonths = Array.from({ length: currentMonthIndex }, (_, i) => i);
  const form = el("setup-form");
  form.innerHTML = `
    <div class="form-grid">
      <label>Saldo do ano passado
        <input type="number" step="0.01" id="setup-prev" value="${state.previousYearBalance || 0}" />
      </label>
      <label>Valor da mensalidade (por jogador)
        <input type="number" min="0" step="0.01" id="setup-fee" value="${state.settings.monthlyFee || 0}" required />
      </label>
    </div>
    ${pastMonths.length ? `<p class="hint">Lance os meses passados de ${currentYear} (mensalidade digitada à mão).</p>` : `<p class="hint">Nenhum mês passado neste ano — é só começar.</p>`}
    ${pastMonths.map((i) => `
      <fieldset class="setup-month" data-month="${i}">
        <div class="legend">${monthNames[i]} / ${currentYear}</div>
        <div class="form-grid">${financeFieldsHTML("m" + i, state.finance[monthKey(currentYear, i)] || {})}</div>
      </fieldset>
    `).join("")}
    <button type="submit" class="primary block">Salvar e começar</button>
  `;

  form.onsubmit = (e) => {
    e.preventDefault();
    state.previousYearBalance = parseN(el("setup-prev").value);
    state.settings.monthlyFee = parseN(el("setup-fee").value);
    form.querySelectorAll("[data-month]").forEach((fs) => {
      const idx = Number(fs.dataset.month);
      state.finance[monthKey(currentYear, idx)] = readFinanceFrom(fs, { manual: true });
    });
    state.setupDone = true;
    ensureCurrentMonth();
    saveState();
    overlay.classList.add("hidden");
    renderAll();
    toast("Tudo pronto! 🎉");
  };
}

/* ============================================================
   FINANCEIRO (mês atual)
   ============================================================ */
function renderFinance() {
  ensureCurrentMonth();
  const key = monthKey(currentYear, currentMonthIndex);
  el("current-month-label").textContent = `${monthNames[currentMonthIndex]} ${currentYear}`;

  const form = el("current-month-form");
  form.innerHTML = `
    <label>Recebido p/ almoço<input type="number" min="0" step="0.01" data-field="almocoRecebido" /></label>
    <label>Despesa do almoço<input type="number" min="0" step="0.01" data-field="almocoDespesa" /></label>
    <label>Qtd. convidados<input type="number" min="0" step="1" data-field="convidadosQtd" /></label>
    <label>Valor por convidado<input type="number" min="0" step="0.01" data-field="convidadosValor" /></label>
    <label>Quadra<input type="number" min="0" step="0.01" data-field="quadra" /></label>
    <label>Custos diversos<input type="number" min="0" step="0.01" data-field="custosDiversos" /></label>
  `;
  const data = state.finance[key];
  FINANCE_FIELDS.forEach((f) => {
    const input = form.querySelector(`[data-field="${f}"]`);
    if (input) input.value = data[f] ?? 0;
  });

  const refresh = () => {
    const updated = readFinanceFrom(form);
    updated.mensalidadeManual = null; // mês atual = automático
    state.finance[key] = updated;
    saveState();
    renderFinanceSummary(key);
    renderReports();
  };
  form.querySelectorAll("input").forEach((i) => i.addEventListener("input", refresh));
  renderFinanceSummary(key);
  renderPayments(key);
}

function renderFinanceSummary(key) {
  const t = computeMonthTotals(key);
  const cls = t.saldoMes >= 0 ? "pos" : "neg";
  el("current-month-summary").innerHTML = `
    <div class="metric"><span>Receitas</span><strong class="pos">${fmt(t.receitas)}</strong></div>
    <div class="metric"><span>Custos</span><strong class="neg">${fmt(t.custos)}</strong></div>
    <div class="metric"><span>Saldo do mês</span><strong class="${cls}">${fmt(t.saldoMes)}</strong></div>
  `;
}

function renderPayments(key) {
  const list = el("payments-list");
  const fee = parseN(state.settings.monthlyFee);
  el("fee-hint").textContent = `Mensalidade: ${fmt(fee)} por jogador. Total recebido no mês é calculado por quem pagou.`;
  if (!state.payments[key]) state.payments[key] = {};
  const paid = state.payments[key];

  if (!state.members.length) {
    list.innerHTML = `<li class="hint">Cadastre membros na aba Membros.</li>`;
    el("payments-count").textContent = "0 pagos";
    return;
  }

  list.innerHTML = state.members.map((m) => `
    <li>
      <label class="toggle">
        <input type="checkbox" data-pay="${m.id}" ${paid[m.id] ? "checked" : ""} />
        <span>${m.name}</span>
      </label>
      <span class="badge ${paid[m.id] ? "ok" : "no"}">${paid[m.id] ? "Pago" : "Pendente"}</span>
    </li>
  `).join("");

  list.querySelectorAll("[data-pay]").forEach((cb) => {
    cb.onchange = () => {
      if (cb.checked) state.payments[key][cb.dataset.pay] = true;
      else delete state.payments[key][cb.dataset.pay];
      saveState();
      renderPayments(key);
      renderFinanceSummary(key);
      renderReports();
    };
  });
  el("payments-count").textContent = `${paidCount(key)}/${state.members.length} pagos`;
}

/* ============================================================
   MEMBROS
   ============================================================ */
let editingMemberId = null;

function renderMemberForm() {
  const form = el("member-form");
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = el("member-name").value.trim();
    if (!name) return;
    const member = {
      id: editingMemberId || uid(),
      name,
      position: el("member-position").value,
      shirt: el("member-shirt").value ? parseN(el("member-shirt").value) : null
    };
    const idx = state.members.findIndex((m) => m.id === member.id);
    if (idx >= 0) state.members[idx] = member;
    else state.members.push(member);
    resetMemberForm();
    saveState();
    renderMembers();
    renderMatchPlayers();
    renderPayments(monthKey(currentYear, currentMonthIndex));
    renderFinanceSummary(monthKey(currentYear, currentMonthIndex));
    renderReports();
    toast(idx >= 0 ? "Membro atualizado" : "Membro adicionado");
  };
  el("member-cancel").onclick = resetMemberForm;
}

function resetMemberForm() {
  editingMemberId = null;
  el("member-form").reset();
  el("member-submit").textContent = "Adicionar membro";
  el("member-cancel").classList.add("hidden");
}

function startEditMember(id) {
  const m = memberById(id);
  if (!m) return;
  editingMemberId = id;
  el("member-name").value = m.name;
  el("member-position").value = m.position;
  el("member-shirt").value = m.shirt ?? "";
  el("member-submit").textContent = "Salvar alterações";
  el("member-cancel").classList.remove("hidden");
  el("member-name").focus();
}

function renderMembers() {
  const list = el("members-list");
  el("members-count").textContent = `${state.members.length} jogador(es)`;
  if (!state.members.length) {
    list.innerHTML = `<p class="hint">Nenhum membro ainda.</p>`;
    return;
  }
  list.innerHTML = state.members.map((m) => {
    const s = scoutsOf(m.id);
    return `
      <div class="member-row" data-profile="${m.id}">
        <div class="member-avatar">${initials(m.name)}</div>
        <div class="member-info">
          <div class="name">${m.name} ${m.shirt ? `<small class="pc-pos">#${m.shirt}</small>` : ""}</div>
          <div class="meta">${m.position} · ${s.games} jogo(s)</div>
        </div>
        <div class="member-stats">${s.goals}G / ${s.assists}A</div>
        <div class="member-actions">
          <button class="tiny ghost" data-edit="${m.id}">✏️</button>
          <button class="tiny danger" data-del="${m.id}">🗑️</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-profile]").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest("[data-edit]") || e.target.closest("[data-del]")) return;
      openProfile(row.dataset.profile);
    };
  });
  list.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => startEditMember(b.dataset.edit));
  list.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    const m = memberById(b.dataset.del);
    if (!confirm(`Remover ${m?.name}? Isso não apaga as partidas já registradas.`)) return;
    state.members = state.members.filter((x) => x.id !== b.dataset.del);
    Object.values(state.payments).forEach((p) => delete p[b.dataset.del]);
    saveState();
    renderMembers();
    renderMatchPlayers();
    renderPayments(monthKey(currentYear, currentMonthIndex));
    renderReports();
  });
}

/* ============================================================
   PERFIL DO JOGADOR (modal)
   ============================================================ */
function openProfile(id) {
  const m = memberById(id);
  if (!m) return;
  const s = scoutsOf(id);
  const payMonths = Object.keys(state.payments)
    .filter((k) => state.payments[k][id])
    .sort();
  const body = el("profile-body");
  body.innerHTML = `
    <div class="profile-head">
      <div class="member-avatar">${initials(m.name)}</div>
      <div>
        <h2>${m.name}</h2>
        <div class="hint">${m.position}${m.shirt ? ` · Camisa #${m.shirt}` : ""}</div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="metric"><span>Jogos</span><strong>${s.games}</strong></div>
      <div class="metric"><span>Gols</span><strong>${s.goals}</strong></div>
      <div class="metric"><span>Assist.</span><strong>${s.assists}</strong></div>
      <div class="metric"><span>Scouts</span><strong>${s.total}</strong></div>
    </div>
    <div class="profile-stats">
      <div class="metric"><span>Vitórias</span><strong class="pos">${s.wins}</strong></div>
      <div class="metric"><span>Empates</span><strong>${s.draws}</strong></div>
      <div class="metric"><span>Derrotas</span><strong class="neg">${s.losses}</strong></div>
      <div class="metric"><span>Aproveit.</span><strong>${s.games ? Math.round((s.wins / s.games) * 100) : 0}%</strong></div>
    </div>
    <h3>Mensalidades pagas</h3>
    ${payMonths.length
      ? `<p>${payMonths.map((k) => { const [y, mo] = k.split("-"); return `<span class="chip">${monthNames[Number(mo) - 1]}/${y}</span>`; }).join(" ")}</p>`
      : `<p class="hint">Nenhum pagamento registrado.</p>`}
  `;
  el("profile-modal").classList.remove("hidden");
}

/* ============================================================
   PARTIDAS
   ============================================================ */
let editingMatchId = null;

function renderMatchForm() {
  const form = el("match-form");
  const editing = editingMatchId ? state.matches.find((x) => x.id === editingMatchId) : null;
  form.innerHTML = `
    <label class="full">Data da partida<input type="date" id="match-date" required value="${editing ? editing.date : now.toISOString().slice(0, 10)}" /></label>
    <label>Time A (nome)<input id="team-a" value="${editing ? editing.teamAName : "Preto"}" /></label>
    <label>Time B (nome)<input id="team-b" value="${editing ? editing.teamBName : "Vermelho"}" /></label>
    <label>Placar A<input type="number" min="0" id="score-a" value="${editing ? editing.scoreA : 0}" /></label>
    <label>Placar B<input type="number" min="0" id="score-b" value="${editing ? editing.scoreB : 0}" /></label>
  `;
  el("match-form-title").textContent = editing ? "Editar partida" : "Nova partida";
  el("match-cancel").classList.toggle("hidden", !editing);
  el("save-match").textContent = editing ? "Salvar alterações" : "Salvar partida";
  renderMatchPlayers(editing);
}

function renderMatchPlayers(editing = null) {
  const container = el("match-players");
  if (!state.members.length) {
    container.innerHTML = `<p class="hint">Cadastre membros para montar a partida.</p>`;
    return;
  }
  const byId = {};
  if (editing) editing.players.forEach((p) => { byId[p.memberId] = p; });

  container.innerHTML = state.members.map((m) => {
    const p = byId[m.id];
    const included = !!p;
    const teamBadge = p && p.team
      ? `<span class="badge team-${p.team.toLowerCase()}">${p.team}</span>`
      : "";
    return `
      <div class="player-card ${included ? "included" : ""}" data-member="${m.id}">
        <div class="pc-head">
          <label class="checkbox"><input type="checkbox" data-use ${included ? "checked" : ""} />
            <span class="pc-name">${m.name}</span> <span class="pc-pos">${m.position}</span>
          </label>
          <span data-team-badge>${teamBadge}</span>
        </div>
        <div class="pc-inputs">
          <label>Camisa<input type="number" min="1" data-shirt value="${p ? p.shirt : (m.shirt ?? "")}" /></label>
          <label>Gols<input type="number" min="0" data-goals value="${p ? p.goals : 0}" /></label>
          <label>Assist.<input type="number" min="0" data-assists value="${p ? p.assists : 0}" /></label>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".player-card").forEach((card) => {
    const cb = card.querySelector("[data-use]");
    cb.onchange = () => card.classList.toggle("included", cb.checked);
  });
}

function collectMatchPlayers() {
  return [...document.querySelectorAll(".player-card")]
    .filter((card) => card.querySelector("[data-use]").checked)
    .map((card) => {
      const badge = card.querySelector("[data-team-badge] .badge");
      const team = badge ? badge.textContent.trim() : null;
      return {
        memberId: card.dataset.member,
        team: team === "A" || team === "B" ? team : null,
        shirt: parseN(card.querySelector("[data-shirt]").value),
        goals: parseN(card.querySelector("[data-goals]").value),
        assists: parseN(card.querySelector("[data-assists]").value)
      };
    });
}

// Sorteio: 2 times equilibrados por posição + nível (scouts), só dos presentes (Q11).
function drawTeams() {
  const cards = [...document.querySelectorAll(".player-card")].filter((c) => c.querySelector("[data-use]").checked);
  if (cards.length < 2) { toast("Marque ao menos 2 jogadores"); return; }

  const present = cards.map((card) => {
    const m = memberById(card.dataset.member);
    return { card, skill: scoutsOf(m.id).total, position: m.position };
  });

  const order = { Goleiro: 0, Zagueiro: 1, Meio: 2, Ataque: 3 };
  present.sort((a, b) => (order[a.position] - order[b.position]) || (b.skill - a.skill));

  const teams = { A: { players: [], skill: 0 }, B: { players: [], skill: 0 } };
  present.forEach((p) => {
    // vai para o time com menos jogadores; empate -> menor soma de nível.
    const target = teams.A.players.length !== teams.B.players.length
      ? (teams.A.players.length < teams.B.players.length ? "A" : "B")
      : (teams.A.skill <= teams.B.skill ? "A" : "B");
    teams[target].players.push(p);
    teams[target].skill += p.skill;
    const badge = p.card.querySelector("[data-team-badge]");
    badge.innerHTML = `<span class="badge team-${target.toLowerCase()}">${target}</span>`;
  });
  toast(`Times sorteados: A(${teams.A.players.length}) x B(${teams.B.players.length})`);
}

function saveMatch() {
  const players = collectMatchPlayers();
  if (!players.length) { toast("Selecione quem jogou"); return; }
  const data = {
    date: el("match-date").value,
    teamAName: el("team-a").value.trim() || "Time A",
    teamBName: el("team-b").value.trim() || "Time B",
    scoreA: parseN(el("score-a").value),
    scoreB: parseN(el("score-b").value),
    players
  };
  if (editingMatchId) {
    const idx = state.matches.findIndex((x) => x.id === editingMatchId);
    if (idx >= 0) state.matches[idx] = Object.assign({ id: editingMatchId }, data);
    editingMatchId = null;
  } else {
    state.matches.unshift(Object.assign({ id: uid() }, data));
  }
  saveState();
  renderMatchForm();
  renderMatchesList();
  renderMembers();
  renderReports();
  toast("Partida salva ✅");
}

function renderMatchesList() {
  const list = el("matches-list");
  el("matches-count").textContent = `${state.matches.length} partida(s)`;
  if (!state.matches.length) {
    list.innerHTML = `<p class="hint">Nenhuma partida registrada.</p>`;
    return;
  }
  list.innerHTML = state.matches.map((m) => {
    const players = m.players.map((p) => {
      const mem = memberById(p.memberId);
      const nm = mem ? mem.name : "Jogador";
      const sc = (p.goals || p.assists) ? ` (${p.goals}G/${p.assists}A)` : "";
      return nm + sc;
    }).join(", ");
    return `
      <div class="match-item">
        <div class="mi-top">
          <span class="score">${m.teamAName} ${m.scoreA} × ${m.scoreB} ${m.teamBName}</span>
          <span class="mi-date">${formatDate(m.date)}</span>
        </div>
        <div class="mi-players">${players}</div>
        <div class="mi-actions">
          <button class="tiny ghost" data-edit-match="${m.id}">Editar</button>
          <button class="tiny danger" data-del-match="${m.id}">Excluir</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-edit-match]").forEach((b) => b.onclick = () => {
    editingMatchId = b.dataset.editMatch;
    renderMatchForm();
    document.querySelector('[data-tab="matches"]').click();
    el("match-form").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  list.querySelectorAll("[data-del-match]").forEach((b) => b.onclick = () => {
    if (!confirm("Excluir esta partida? Os scouts serão recalculados.")) return;
    state.matches = state.matches.filter((x) => x.id !== b.dataset.delMatch);
    if (editingMatchId === b.dataset.delMatch) { editingMatchId = null; renderMatchForm(); }
    saveState();
    renderMatchesList();
    renderMembers();
    renderReports();
    toast("Partida excluída");
  });
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ============================================================
   RELATÓRIOS + GRÁFICOS
   ============================================================ */
let charts = { balance: null, scouts: null };

function renderReports() {
  const keys = Object.keys(state.finance).sort();
  let accum = parseN(state.previousYearBalance);
  const rows = [];
  const labels = [], balances = [];
  keys.forEach((k) => {
    const [y, m] = k.split("-");
    const t = computeMonthTotals(k);
    accum += t.saldoMes;
    rows.push({ label: `${monthNames[Number(m) - 1]}/${y}`, t, accum });
    labels.push(`${monthNames[Number(m) - 1].slice(0, 3)}/${y.slice(2)}`);
    balances.push(Number(accum.toFixed(2)));
  });

  el("finance-report").innerHTML = `
    <p class="hint">Saldo inicial (ano passado): <strong>${fmt(state.previousYearBalance)}</strong></p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mês</th><th>Receitas</th><th>Custos</th><th>Saldo</th><th>Acumulado</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td>${r.label}</td>
          <td class="pos">${fmt(r.t.receitas)}</td>
          <td class="neg">${fmt(r.t.custos)}</td>
          <td class="${r.t.saldoMes >= 0 ? "pos" : "neg"}">${fmt(r.t.saldoMes)}</td>
          <td class="${r.accum >= 0 ? "pos" : "neg"}"><strong>${fmt(r.accum)}</strong></td>
        </tr>`).join("")}
      </tbody>
    </table></div>
  `;

  // Ranking de scouts
  const ranked = state.members
    .map((m) => ({ m, s: scoutsOf(m.id) }))
    .sort((a, b) => b.s.total - a.s.total);

  const topGoals = [...ranked].sort((a, b) => b.s.goals - a.s.goals)[0];
  const topAssists = [...ranked].sort((a, b) => b.s.assists - a.s.assists)[0];
  const bestDef = ranked.filter((r) => r.m.position === "Zagueiro")[0];
  const bestGk = ranked.filter((r) => r.m.position === "Goleiro")[0];
  const mvp = ranked[0];
  const award = (r, min = 0) => (r && r.s.total > min ? r.m.name : "—");

  el("scout-report").innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Jogador</th><th>Pos.</th><th>Gols</th><th>Assist.</th><th>Total</th></tr></thead>
      <tbody>
        ${ranked.map((r, i) => `<tr>
          <td>${i + 1}</td><td>${r.m.name}</td><td>${r.m.position}</td>
          <td>${r.s.goals}</td><td>${r.s.assists}</td><td><strong>${r.s.total}</strong></td>
        </tr>`).join("") || `<tr><td colspan="6" class="hint">Sem dados ainda.</td></tr>`}
      </tbody>
    </table></div>
    <div class="awards">
      <div class="award"><span>🏆 Artilheiro</span><strong>${topGoals && topGoals.s.goals ? topGoals.m.name : "—"}</strong></div>
      <div class="award"><span>🎯 Assistências</span><strong>${topAssists && topAssists.s.assists ? topAssists.m.name : "—"}</strong></div>
      <div class="award"><span>🛡️ Melhor zagueiro</span><strong>${award(bestDef)}</strong></div>
      <div class="award"><span>🧤 Melhor goleiro</span><strong>${bestGk ? bestGk.m.name : "—"}</strong></div>
      <div class="award"><span>⭐ Craque do ano</span><strong>${award(mvp)}</strong></div>
    </div>
  `;

  drawCharts(labels, balances, ranked.slice(0, 6));
}

function drawCharts(labels, balances, topRanked) {
  if (typeof Chart === "undefined") return;
  const accent = "#dc2626";
  const black = "#18181b";

  if (charts.balance) charts.balance.destroy();
  charts.balance = new Chart(el("chart-balance"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Saldo acumulado",
        data: balances,
        borderColor: accent,
        backgroundColor: "rgba(220,38,38,0.1)",
        fill: true,
        tension: 0.3,
        pointBackgroundColor: accent
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: (v) => "R$ " + v } } }
    }
  });

  if (charts.scouts) charts.scouts.destroy();
  charts.scouts = new Chart(el("chart-scouts"), {
    type: "bar",
    data: {
      labels: topRanked.map((r) => r.m.name),
      datasets: [
        { label: "Gols", data: topRanked.map((r) => r.s.goals), backgroundColor: black },
        { label: "Assist.", data: topRanked.map((r) => r.s.assists), backgroundColor: accent }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { precision: 0 } } }
    }
  });
}

/* ============================================================
   CONFIGURAÇÕES + BACKUP
   ============================================================ */
function openSettings() {
  el("setting-fee").value = state.settings.monthlyFee || 0;
  el("setting-prev-balance").value = state.previousYearBalance || 0;
  el("settings-modal").classList.remove("hidden");
}

function bindSettings() {
  el("open-settings").onclick = openSettings;
  el("settings-close").onclick = () => el("settings-modal").classList.add("hidden");
  el("profile-close").onclick = () => el("profile-modal").classList.add("hidden");

  el("settings-form").onsubmit = (e) => {
    e.preventDefault();
    state.settings.monthlyFee = parseN(el("setting-fee").value);
    state.previousYearBalance = parseN(el("setting-prev-balance").value);
    saveState();
    el("settings-modal").classList.add("hidden");
    renderAll();
    toast("Configurações salvas");
  };

  el("export-data").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liga-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado ⬇️");
  };

  el("import-data").onclick = () => el("import-file").click();
  el("import-file").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== "object" || !("members" in data)) throw new Error("formato");
        if (!confirm("Importar vai substituir todos os dados atuais. Continuar?")) return;
        state = Object.assign(defaultState(), data);
        state.version = 2;
        saveState();
        el("settings-modal").classList.add("hidden");
        renderAll();
        toast("Dados importados ⬆️");
      } catch (_) {
        toast("Arquivo inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  el("reset-data").onclick = () => {
    if (!confirm("Isso apaga TODOS os dados. Tem certeza?")) return;
    if (!confirm("Última chance: apagar tudo mesmo?")) return;
    state = defaultState();
    saveState();
    el("settings-modal").classList.add("hidden");
    renderAll();
    toast("Dados resetados");
  };

  // Fechar modais ao tocar no fundo.
  [el("settings-modal"), el("profile-modal")].forEach((modal) => {
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add("hidden"); };
  });
}

/* ============================================================
   NAVEGAÇÃO POR ABAS
   ============================================================ */
function bindTabs() {
  const buttons = document.querySelectorAll(".nav-btn");
  const panels = document.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => btn.onclick = () => {
    buttons.forEach((b) => b.classList.toggle("active", b === btn));
    panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === btn.dataset.tab));
    window.scrollTo({ top: 0 });
  });
  // aba inicial
  document.querySelector('[data-tab="finance"]').classList.add("active");
  document.querySelector('[data-panel="finance"]').classList.add("active");
}

/* ============================================================
   BOOT
   ============================================================ */
function renderAll() {
  renderSetup();
  if (state.setupDone) {
    renderFinance();
    renderMembers();
    renderMatchForm();
    renderMatchesList();
    renderReports();
  }
}

function init() {
  bindTabs();
  bindSettings();
  renderMemberForm();
  el("save-match").onclick = saveMatch;
  el("draw-teams").onclick = drawTeams;
  el("match-cancel").onclick = () => { editingMatchId = null; renderMatchForm(); };
  renderAll();
}

init();
