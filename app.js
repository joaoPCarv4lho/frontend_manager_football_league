const KEY = "league-manager-v1";
const now = new Date();
const currentMonthIndex = now.getMonth();
const currentYear = now.getFullYear();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const initialState = {
  setupDone: false,
  previousYearBalance: 0,
  finance: {},
  members: [],
  matches: []
};

const state = JSON.parse(localStorage.getItem(KEY) || "null") || structuredClone(initialState);

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthKey = (year, monthIdx) => `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
const parseN = (v) => Number.parseFloat(v || 0) || 0;

function saveState() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function computeMonthTotals(m) {
  const convidadosReceita = parseN(m.convidadosQtd) * parseN(m.convidadosValor);
  const receitas = parseN(m.mensalidade) + parseN(m.almocoRecebido) + convidadosReceita;
  const custos = parseN(m.almocoDespesa) + parseN(m.quadra) + parseN(m.custosDiversos);
  const saldoMes = receitas - custos;
  return { convidadosReceita, receitas, custos, saldoMes };
}

function ensureCurrentMonth() {
  const key = monthKey(currentYear, currentMonthIndex);
  if (!state.finance[key]) {
    state.finance[key] = {
      mensalidade: 0,
      almocoRecebido: 0,
      almocoDespesa: 0,
      convidadosQtd: 0,
      convidadosValor: 0,
      quadra: 0,
      custosDiversos: 0
    };
  }
}

function renderOnboarding() {
  const root = document.getElementById("onboarding");
  if (state.setupDone) {
    root.innerHTML = `<h2>Fluxo inicial concluído</h2><p>Saldo do ano anterior e meses passados já foram salvos.</p>`;
    return;
  }

  const pastMonths = Array.from({ length: currentMonthIndex }, (_, i) => i);
  root.innerHTML = `
    <h2>Configuração Inicial</h2>
    <p>1) Informe o saldo acumulado do ano passado.<br/>2) Preencha receitas e custos de ${pastMonths.length ? "cada mês passado" : "nenhum mês passado"} até ${monthNames[currentMonthIndex - 1] || "o mês anterior"}.<br/>3) Salve para iniciar o mês atual (${monthNames[currentMonthIndex]}).</p>
    <form id="onboarding-form" class="form-grid">
      <label>Saldo acumulado do ano passado
        <input type="number" min="0" step="0.01" id="previous-balance" required value="${state.previousYearBalance || 0}" />
      </label>
      ${pastMonths.map(i => `
        <fieldset class="pill">
          <legend>${monthNames[i]} (${currentYear})</legend>
          <div class="form-grid" data-month="${i}"></div>
        </fieldset>
      `).join("")}
      <button type="submit" class="primary">Salvar configuração inicial</button>
    </form>
  `;

  const template = document.getElementById("finance-fields-template").content;
  root.querySelectorAll("[data-month]").forEach((container) => {
    container.appendChild(template.cloneNode(true));
    const idx = Number(container.dataset.month);
    const data = state.finance[monthKey(currentYear, idx)] || {};
    setupFinanceInputs(container, data);
  });

  root.querySelector("#onboarding-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.previousYearBalance = parseN(document.getElementById("previous-balance").value);
    root.querySelectorAll("[data-month]").forEach((container) => {
      const idx = Number(container.dataset.month);
      const key = monthKey(currentYear, idx);
      state.finance[key] = readFinanceFrom(container);
    });
    state.setupDone = true;
    ensureCurrentMonth();
    saveState();
    rerenderAll();
  });
}

function setupFinanceInputs(container, data) {
  const input = (field) => container.querySelector(`[data-field="${field}"]`);
  ["mensalidade", "almocoRecebido", "almocoDespesa", "convidadosQtd", "convidadosValor", "quadra", "custosDiversos"].forEach((f) => {
    if (input(f)) input(f).value = data[f] ?? 0;
  });

  const updateRevenue = () => {
    const v = parseN(input("convidadosQtd")?.value) * parseN(input("convidadosValor")?.value);
    if (input("convidadosReceita")) input("convidadosReceita").value = v.toFixed(2);
  };
  container.querySelectorAll("input").forEach((el) => el.addEventListener("input", updateRevenue));
  updateRevenue();
}

function readFinanceFrom(container) {
  return {
    mensalidade: parseN(container.querySelector('[data-field="mensalidade"]').value),
    almocoRecebido: parseN(container.querySelector('[data-field="almocoRecebido"]').value),
    almocoDespesa: parseN(container.querySelector('[data-field="almocoDespesa"]').value),
    convidadosQtd: parseN(container.querySelector('[data-field="convidadosQtd"]').value),
    convidadosValor: parseN(container.querySelector('[data-field="convidadosValor"]').value),
    quadra: parseN(container.querySelector('[data-field="quadra"]').value),
    custosDiversos: parseN(container.querySelector('[data-field="custosDiversos"]').value)
  };
}

function renderCurrentMonthFinance() {
  ensureCurrentMonth();
  const form = document.getElementById("current-month-form");
  form.innerHTML = "";
  const template = document.getElementById("finance-fields-template").content.cloneNode(true);
  form.appendChild(template);
  const key = monthKey(currentYear, currentMonthIndex);
  setupFinanceInputs(form, state.finance[key]);

  const refreshSummary = () => {
    state.finance[key] = readFinanceFrom(form);
    const t = computeMonthTotals(state.finance[key]);
    document.getElementById("current-month-summary").innerHTML = `
      <strong>${monthNames[currentMonthIndex]} ${currentYear}</strong><br/>
      Receitas: ${fmt(t.receitas)} | Custos: ${fmt(t.custos)} | Saldo do mês: <strong>${fmt(t.saldoMes)}</strong>
    `;
    saveState();
    renderReports();
  };

  form.querySelectorAll("input").forEach((el) => el.addEventListener("input", refreshSummary));
  refreshSummary();
}

function renderMembers() {
  const form = document.getElementById("member-form");
  let editingId = null;

  form.onsubmit = (e) => {
    e.preventDefault();
    const member = {
      id: editingId || crypto.randomUUID(),
      name: document.getElementById("member-name").value.trim(),
      position: document.getElementById("member-position").value,
      goals: parseN(document.getElementById("member-goals").value),
      assists: parseN(document.getElementById("member-assists").value),
      paidCurrentMonth: document.getElementById("member-paid").checked
    };
    if (!member.name) return;

    const idx = state.members.findIndex((m) => m.id === member.id);
    if (idx >= 0) state.members[idx] = member;
    else state.members.push(member);

    editingId = null;
    form.reset();
    saveState();
    fillMembersTable();
    renderMatchPlayers();
    renderReports();
  };

  function fillMembersTable() {
    const tbody = document.querySelector("#members-table tbody");
    tbody.innerHTML = state.members.map((m) => `
      <tr>
        <td>${m.name}</td>
        <td>${m.position}</td>
        <td>${m.goals}</td>
        <td>${m.assists}</td>
        <td><span class="badge ${m.paidCurrentMonth ? "ok" : "no"}">${m.paidCurrentMonth ? "Sim" : "Não"}</span></td>
        <td>
          <button data-edit="${m.id}">Editar</button>
          <button class="danger" data-del="${m.id}">Remover</button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.onclick = () => {
      const m = state.members.find((x) => x.id === btn.dataset.edit);
      editingId = m.id;
      document.getElementById("member-name").value = m.name;
      document.getElementById("member-position").value = m.position;
      document.getElementById("member-goals").value = m.goals;
      document.getElementById("member-assists").value = m.assists;
      document.getElementById("member-paid").checked = !!m.paidCurrentMonth;
    });

    tbody.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = () => {
      state.members = state.members.filter((x) => x.id !== btn.dataset.del);
      saveState();
      fillMembersTable();
      renderMatchPlayers();
      renderReports();
    });
  }

  fillMembersTable();
}

function renderMatchesForm() {
  const form = document.getElementById("match-form");
  form.innerHTML = `
    <label>Data da partida <input type="date" id="match-date" required value="${now.toISOString().slice(0,10)}" /></label>
    <label>Time A <input id="team-a" value="Azul" /></label>
    <label>Time B <input id="team-b" value="Vermelho" /></label>
    <label>Placar Time A <input type="number" min="0" id="score-a" value="0" /></label>
    <label>Placar Time B <input type="number" min="0" id="score-b" value="0" /></label>
  `;

  document.getElementById("save-match").onclick = () => {
    const selected = [...document.querySelectorAll(".player-card")]
      .filter((card) => card.querySelector("[data-use]").checked)
      .map((card) => ({
        memberId: card.dataset.member,
        shirt: parseN(card.querySelector("[data-shirt]").value),
        goals: parseN(card.querySelector("[data-goals]").value),
        assists: parseN(card.querySelector("[data-assists]").value)
      }));

    const match = {
      id: crypto.randomUUID(),
      date: document.getElementById("match-date").value,
      teamA: document.getElementById("team-a").value,
      teamB: document.getElementById("team-b").value,
      scoreA: parseN(document.getElementById("score-a").value),
      scoreB: parseN(document.getElementById("score-b").value),
      players: selected
    };

    selected.forEach((entry) => {
      const m = state.members.find((x) => x.id === entry.memberId);
      if (m) {
        m.goals += entry.goals;
        m.assists += entry.assists;
      }
    });

    state.matches.unshift(match);
    saveState();
    renderMatchPlayers();
    renderMatchesTable();
    renderMembers();
    renderReports();
  };

  renderMatchPlayers();
  renderMatchesTable();
}

function renderMatchPlayers() {
  const container = document.getElementById("match-players");
  container.innerHTML = state.members.map((m, idx) => `
    <div class="player-card" data-member="${m.id}">
      <strong>${m.name}</strong> <small>(${m.position})</small>
      <label class="checkbox"><input data-use type="checkbox" /> Incluir na partida</label>
      <label>Camisa na partida <input data-shirt type="number" min="1" value="${idx + 1}" /></label>
      <label>Gols no jogo <input data-goals type="number" min="0" value="0" /></label>
      <label>Assistências no jogo <input data-assists type="number" min="0" value="0" /></label>
    </div>
  `).join("");
}

function renderMatchesTable() {
  const tbody = document.querySelector("#matches-table tbody");
  tbody.innerHTML = state.matches.map((m) => `
    <tr>
      <td>${m.date}</td>
      <td>${m.teamA} ${m.scoreA} x ${m.scoreB} ${m.teamB}</td>
      <td>${m.players.map((p) => {
        const member = state.members.find((x) => x.id === p.memberId);
        return `${member?.name || "Jogador"} (#${p.shirt}, G:${p.goals}, A:${p.assists})`;
      }).join("; ")}</td>
    </tr>
  `).join("");
}

function renderReports() {
  const financeRoot = document.getElementById("finance-report");
  const scoutRoot = document.getElementById("scout-report");

  const keys = Object.keys(state.finance).sort();
  let accum = state.previousYearBalance || 0;

  financeRoot.innerHTML = `
    <p><strong>Saldo inicial (ano passado):</strong> ${fmt(state.previousYearBalance)}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Mês</th><th>Receitas</th><th>Custos</th><th>Saldo mês</th><th>Saldo acumulado</th></tr></thead>
      <tbody>
      ${keys.map((k) => {
        const [y, m] = k.split("-");
        const t = computeMonthTotals(state.finance[k]);
        accum += t.saldoMes;
        return `<tr><td>${monthNames[Number(m) - 1]}/${y}</td><td>${fmt(t.receitas)}</td><td>${fmt(t.custos)}</td><td>${fmt(t.saldoMes)}</td><td>${fmt(accum)}</td></tr>`;
      }).join("")}
      </tbody>
    </table></div>
  `;

  const ranking = [...state.members].sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists));
  const topGoals = [...state.members].sort((a,b)=>b.goals-a.goals)[0];
  const topAssists = [...state.members].sort((a,b)=>b.assists-a.assists)[0];
  const bestDef = [...state.members].filter(m=>m.position === "Zagueiro").sort((a,b)=>(b.goals+b.assists)-(a.goals+a.assists))[0];
  const bestGk = [...state.members].filter(m=>m.position === "Goleiro").sort((a,b)=>(b.goals+b.assists)-(a.goals+a.assists))[0];
  const mvp = ranking[0];

  scoutRoot.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Jogador</th><th>Posição</th><th>Gols</th><th>Assistências</th><th>Scouts totais</th></tr></thead>
      <tbody>
        ${ranking.map((m) => `<tr><td>${m.name}</td><td>${m.position}</td><td>${m.goals}</td><td>${m.assists}</td><td>${m.goals + m.assists}</td></tr>`).join("")}
      </tbody>
    </table></div>
    <div class="pill">
      <h4>Premiações do ano (parcial)</h4>
      <p>🏆 Artilheiro: <strong>${topGoals?.name || "-"}</strong></p>
      <p>🎯 Líder em assistências: <strong>${topAssists?.name || "-"}</strong></p>
      <p>🛡️ Melhor zagueiro: <strong>${bestDef?.name || "-"}</strong></p>
      <p>🧤 Melhor goleiro: <strong>${bestGk?.name || "-"}</strong></p>
      <p>⭐ Craque do ano (G+A): <strong>${mvp?.name || "-"}</strong></p>
    </div>
  `;
}

function rerenderAll() {
  renderOnboarding();
  renderCurrentMonthFinance();
  renderMembers();
  renderMatchesForm();
  renderReports();
}

rerenderAll();
