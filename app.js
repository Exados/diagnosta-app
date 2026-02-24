// ==============================
// HELPERY (MUSZĄ BYĆ NA GÓRZE)
// ==============================
function $(sel) {
  return document.querySelector(sel);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==============================
// DANE (ŁADOWANE Z PLIKÓW JSON)
// ==============================
let QUESTIONS = [];
let KNOWLEDGE = [];
let DOCUMENTS = [];
let OPENQ = [];

// ==============================
// STANY
// ==============================
let learnIndex = 0;
let learnOrder = [];
let learnModule = "ALL";

const TEST_LEN = 30;

let testModule = "ALL";
let testState = {
  started: false,
  order: [],
  idx: 0,
  correct: 0,
  answers: [], // {id, chosen, correct}
};

// ==============================
// ŁADOWANIE DANYCH
// ==============================
async function loadData() {
  const [qRes, kRes, dRes, oqRes] = await Promise.all([
    fetch("./questions.json", { cache: "no-store" }),
    fetch("./knowledge.json", { cache: "no-store" }),
    fetch("./documents.json", { cache: "no-store" }),
    fetch("./open_questions.json", { cache: "no-store" }),
  ]);

  if (!qRes.ok)
    throw new Error("Nie mogę wczytać questions.json (sprawdź nazwę/ścieżkę).");
  if (!kRes.ok)
    throw new Error("Nie mogę wczytać knowledge.json (sprawdź nazwę/ścieżkę).");
  if (!dRes.ok)
    throw new Error("Nie mogę wczytać documents.json (sprawdź nazwę/ścieżkę).");
  if (!oqRes.ok)
    throw new Error(
      "Nie mogę wczytać open_questions.json (sprawdź nazwę/ścieżkę).",
    );

  QUESTIONS = await qRes.json();
  KNOWLEDGE = await kRes.json();
  DOCUMENTS = await dRes.json();
  OPENQ = await oqRes.json();

  if (!Array.isArray(DOCUMENTS))
    throw new Error("documents.json musi zawierać tablicę [].");
  if (!Array.isArray(QUESTIONS))
    throw new Error("questions.json musi zawierać tablicę [].");
  if (!Array.isArray(KNOWLEDGE))
    throw new Error("knowledge.json musi zawierać tablicę [].");
  if (!Array.isArray(OPENQ))
    throw new Error("open_questions.json musi zawierać tablicę [].");

  // Normalizacja / walidacja minimum + moduły
  QUESTIONS = QUESTIONS.filter(
    (q) => q && q.id != null && q.text && q.choices && q.correct,
  ).map((q) => ({
    ...q,
    correct: String(q.correct).toUpperCase(),
    module:
      q.module && String(q.module).trim() ? String(q.module).trim() : "Inne",
  }));

  learnIndex = 0;
  learnOrder = buildLearnOrder();

  populateModuleSelects();
}

// ==============================
// MODUŁY
// ==============================
function getModules() {
  const mods = Array.from(new Set(QUESTIONS.map((q) => q.module))).sort(
    (a, b) => a.localeCompare(b, "pl"),
  );
  return ["ALL", ...mods];
}

function populateModuleSelects() {
  const learnSel = $("#learnModule");
  const testSel = $("#testModule");

  const modules = getModules();

  if (learnSel) {
    learnSel.innerHTML = modules
      .map((m) => {
        const label = m === "ALL" ? "Wszystkie" : m;
        return `<option value="${escapeHtml(m)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    learnSel.value = learnModule;

    learnSel.onchange = () => {
      learnModule = learnSel.value;
      learnIndex = 0;
      learnOrder = buildLearnOrder();
      renderLearn();
    };
  }

  if (testSel) {
    testSel.innerHTML = modules
      .map((m) => {
        const label = m === "ALL" ? "Wszystkie" : m;
        return `<option value="${escapeHtml(m)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    testSel.value = testModule;

    testSel.onchange = () => {
      testModule = testSel.value;
      renderTestIdle();
    };
  }
}

function buildLearnOrder() {
  const pool =
    learnModule === "ALL"
      ? QUESTIONS
      : QUESTIONS.filter((q) => q.module === learnModule);

  return shuffle(pool.map((q) => q.id));
}

function buildTestOrder() {
  const pool =
    testModule === "ALL"
      ? QUESTIONS
      : QUESTIONS.filter((q) => q.module === testModule);

  const len = Math.min(TEST_LEN, pool.length);
  return shuffle(pool.map((q) => q.id)).slice(0, len);
}

// ==============================
// NAWIGACJA (ZAKŁADKI)
// ==============================
const tabs = document.querySelectorAll(".tab");
tabs.forEach((btn) =>
  btn.addEventListener("click", () => setView(btn.dataset.view)),
);

function setView(view) {
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(`#view-${view}`)?.classList.remove("hidden");

  if (view === "knowledge") renderKnowledge();
  if (view === "learn") renderLearn();
  if (view === "test") renderTestIdle();
  if (view === "add") initAddTool();
  if (view === "documents") renderDocuments();
  if (view === "openq") renderOpenQ();
  if (view === "home") renderHome();

  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderHome() {
  document.querySelectorAll("[data-go]").forEach((btn) => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener("click", () => setView(clone.dataset.go));
  });
}
// ==============================
// BAZA WIEDZY
// ==============================
function renderKnowledge() {
  const host = $("#knowledgeList");
  if (!host) return;

  host.innerHTML = "";

  if (!KNOWLEDGE.length) {
    host.innerHTML = `<div class="card"><p class="muted">Brak wpisów w knowledge.json</p></div>`;
    return;
  }

  KNOWLEDGE.forEach((k, idx) => {
    const id = k.id ?? String(idx);

    const el = document.createElement("button");
    el.type = "button";
    el.className = "knowledgeItem";
    el.innerHTML = `
  <div class="kSimple">
    <h3 class="kSimpleTitle">
      ${escapeHtml(k.title || "")}
    </h3>
  </div>
`;
    el.addEventListener("click", () => openKnowledgeTopic(id));
    host.appendChild(el);
  });
}

function openKnowledgeTopic(id) {
  // pokaż widok podstrony
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-knowledge-topic")?.classList.remove("hidden");

  // zakładka "BAZA WIEDZY" nadal aktywna
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === "knowledge");
  });

  const topic =
    KNOWLEDGE.find((k) => String(k.id) === String(id)) ??
    KNOWLEDGE[Number(id)] ??
    null;

  if (!topic) {
    $("#ktTitle").textContent = "Nie znaleziono tematu";
    $("#ktBody").innerHTML = `<p class="muted">Brak danych.</p>`;
    return;
  }

  $("#ktTitle").textContent = topic.title || "Temat";

  // Jeżeli temat ma HTML (np. tabelkę), renderujemy bez escape
  if (topic.html) {
    $("#ktBody").innerHTML = `
  <div class="knowledgeContent">
    ${topic.html}
  </div>
`;
  } else {
    $("#ktBody").innerHTML = `
  <div class="knowledgeContent">
    <h3 style="margin-top:0;">${escapeHtml(topic.title || "")}</h3>
    <p class="muted">${escapeHtml(topic.body || "")}</p>
  </div>
`;
  }

  // powrót
  const backBtn = $("#ktBack");
  if (backBtn) {
    const clone = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(clone, backBtn);
    clone.addEventListener("click", () => setView("knowledge"));
  }
}
// ==============================
// DOKUMENTY
// ==============================
function renderDocuments() {
  const host = $("#documentsList");
  if (!host) return;

  host.innerHTML = "";

  if (!DOCUMENTS.length) {
    host.innerHTML = `<div class="card"><p class="muted">Brak wpisów w documents.json</p></div>`;
    return;
  }

  DOCUMENTS.forEach((d) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "knowledgeItem"; // używamy Twojego stylu kafelków
    const thumb =
      Array.isArray(d.images) && d.images.length
        ? d.images[0]
        : d.image
          ? d.image
          : "";

    el.innerHTML = `
  <div class="docTile">
    ${
      thumb
        ? `<img class="docTileThumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(d.title || "Dokument")}" loading="lazy">`
        : `<div class="docTileThumb placeholder" aria-hidden="true"></div>`
    }
    <div class="docTileText">
      <h3 class="docTileTitle">${escapeHtml(d.title || "")}</h3>
      <p class="muted docTileSub">Kliknij, aby otworzyć</p>
    </div>
  </div>
`;
    el.addEventListener("click", () => openDocumentTopic(d.id));
    host.appendChild(el);
  });
}

function openDocumentTopic(id) {
  // przełącz widoki
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $("#view-document-topic")?.classList.remove("hidden");

  // aktywuj tab Dokumenty
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === "documents");
  });

  const doc = DOCUMENTS.find((d) => String(d.id) === String(id)) || null;

  if (!doc) {
    $("#docTitle").textContent = "Nie znaleziono dokumentu";
    $("#docName").textContent = "";
    $("#docExplain").textContent = "";
    $("#docDesc").textContent = "";
    const img = $("#docImage");
    if (img) img.removeAttribute("src");
    return;
  }

  $("#docTitle").textContent = doc.title || "Dokument";
  $("#docName").textContent = doc.title || "";
  $("#docExplain").textContent = doc.explain || "";
  $("#docDesc").textContent = doc.desc || "";

  const imagesWrap = $("#docImages");
  if (imagesWrap) {
    imagesWrap.innerHTML = "";

    const imgs = Array.isArray(doc.images)
      ? doc.images
      : doc.image
        ? [doc.image]
        : [];

    imgs.forEach((src) => {
      const imgEl = document.createElement("img");
      imgEl.src = src;
      imgEl.alt = doc.title || "Dokument";

      imgEl.addEventListener("click", () => {
        openImageModal(src, doc.title);
      });

      imagesWrap.appendChild(imgEl);
    });
  }

  // przycisk powrotu
  const backBtn = $("#docBack");
  if (backBtn) {
    const clone = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(clone, backBtn);
    clone.addEventListener("click", () => setView("documents"));
  }
}

// ==============================
// PYTANIA OPISOWE
// ==============================
function renderOpenQ() {
  const host = $("#openqList");
  if (!host) return;

  host.innerHTML = "";

  if (!OPENQ.length) {
    host.innerHTML = `<div class="card"><p class="muted">Brak pytań w open_questions.json</p></div>`;
    return;
  }

  OPENQ.forEach((item, idx) => {
    const q = item.question ?? "";
    const a = item.answer ?? "";
    const id = item.id ?? idx;

    const el = document.createElement("div");
    el.className = "openqItem";
    el.innerHTML = `
  <button class="openqHead" type="button" aria-expanded="false" data-id="${escapeHtml(id)}">
    <span class="openqNumber">${idx + 1}</span>
    <span class="openqQ">${escapeHtml(q)}</span>
    <span class="openqIcon">▾</span>
  </button>
  <div class="openqBody hidden">
    <div class="openqA">${escapeHtml(a).replaceAll("\n", "<br>")}</div>
  </div>
`;

    const head = el.querySelector(".openqHead");
    const body = el.querySelector(".openqBody");
    const icon = el.querySelector(".openqIcon");

    head.addEventListener("click", () => {
      const isHidden = body.classList.contains("hidden");

      // jeśli chcesz, żeby otwarte mogło być tylko jedno naraz — odkomentuj:
      // document.querySelectorAll(".openqBody").forEach(b => b.classList.add("hidden"));
      // document.querySelectorAll(".openqHead").forEach(h => h.setAttribute("aria-expanded", "false"));

      body.classList.toggle("hidden");
      head.setAttribute("aria-expanded", String(isHidden));
      if (icon) icon.textContent = isHidden ? "▴" : "▾";
    });

    host.appendChild(el);
  });
}
// ==============================
// NAUKA
// ==============================
function ensureLearnBindings() {
  const nextBtn = $("#learnNext");
  if (!nextBtn) return;

  const clone = nextBtn.cloneNode(true);
  nextBtn.parentNode.replaceChild(clone, nextBtn);

  clone.addEventListener("click", () => {
    if (!learnOrder.length) learnOrder = buildLearnOrder();
    if (!learnOrder.length) return;
    learnIndex = (learnIndex + 1) % learnOrder.length;
    renderLearn();
  });
}

function renderLearn() {
  ensureLearnBindings();

  const card = $("#learnCard");
  if (!card) return;

  if (!QUESTIONS.length) {
    card.innerHTML = `<p class="muted">Brak pytań w questions.json</p>`;
    return;
  }

  if (!learnOrder.length) learnOrder = buildLearnOrder();

  if (!learnOrder.length) {
    card.innerHTML = `<p class="muted">Brak pytań w tym module.</p>`;
    return;
  }

  const q =
    QUESTIONS.find((x) => x.id === learnOrder[learnIndex]) || QUESTIONS[0];

  card.innerHTML = buildQuestionHtml(q, { mode: "learn" });
  wireAnswerButtons(card, q, { mode: "learn" });
}

// ==============================
// TEST — PASEK POSTĘPU
// ==============================
function updateTestProgress() {
  const bar = document.querySelector("#testProgressBar");
  if (!bar) return;

  const total = testState.order.length || 0;

  // 0% w idle, od startu pokazujemy 1/total
  const currentQuestion = total ? Math.min(testState.idx + 1, total) : 0;
  const percent = total ? Math.round((currentQuestion / total) * 100) : 0;

  bar.style.width = `${percent}%`;
}

// ==============================
// TEST
// ==============================
function ensureTestBindings() {
  const startBtn = $("#testStart");
  const resetBtn = $("#testReset");
  if (!startBtn || !resetBtn) return;

  const startClone = startBtn.cloneNode(true);
  startBtn.parentNode.replaceChild(startClone, startBtn);

  const resetClone = resetBtn.cloneNode(true);
  resetBtn.parentNode.replaceChild(resetClone, resetBtn);

  startClone.addEventListener("click", startTest);
  resetClone.addEventListener("click", resetTest);
}

function renderTestIdle() {
  ensureTestBindings();

  const meta = $("#testMeta");
  const card = $("#testCard");
  const sum = $("#testSummary");

  const poolSize =
    testModule === "ALL"
      ? QUESTIONS.length
      : QUESTIONS.filter((q) => q.module === testModule).length;

  if (meta) meta.textContent = "Kliknij Start, aby rozpocząć test.";
  if (card) {
    card.innerHTML = `
      <p class="muted">
        Wybrany moduł: <b>${escapeHtml(testModule === "ALL" ? "Wszystkie" : testModule)}</b><br>
        Dostępnych pytań w module: <b>${poolSize}</b><br>
        Test pokaże: <b>${Math.min(TEST_LEN, poolSize)}</b> pytań.
      </p>
    `;
  }
  if (sum) sum.classList.add("hidden");

  // idle = 0%
  testState.order = [];
  testState.idx = 0;
  const bar = document.querySelector("#testProgressBar");
  if (bar) bar.style.width = "0%";
}

function startTest() {
  if (!QUESTIONS.length) {
    const card = $("#testCard");
    if (card)
      card.innerHTML = `<p class="muted">Brak pytań w questions.json</p>`;
    return;
  }

  testState.started = true;
  testState.idx = 0;
  testState.correct = 0;
  testState.answers = [];

  testState.order = buildTestOrder();

  if (!testState.order.length) {
    const card = $("#testCard");
    if (card)
      card.innerHTML = `<p class="muted">Brak pytań w wybranym module.</p>`;
    const bar = document.querySelector("#testProgressBar");
    if (bar) bar.style.width = "0%";
    return;
  }

  updateTestProgress(); // od razu pokaż 1/total
  renderTestQuestion();
}

function resetTest() {
  testState = { started: false, order: [], idx: 0, correct: 0, answers: [] };
  renderTestIdle();
}

function renderTestQuestion() {
  const len = testState.order.length;
  const q = QUESTIONS.find((x) => x.id === testState.order[testState.idx]);

  const meta = $("#testMeta");
  const card = $("#testCard");
  const sum = $("#testSummary");

  if (meta) {
    meta.innerHTML =
      `<span class="pill">Moduł: ${escapeHtml(testModule === "ALL" ? "Wszystkie" : testModule)}</span>` +
      `<span class="pill">Pytanie ${testState.idx + 1} / ${len}</span>` +
      `<span class="pill">Punkty: ${testState.correct}</span>`;
  }

  if (card) {
    card.innerHTML = buildQuestionHtml(q, { mode: "test" });
    wireAnswerButtons(card, q, { mode: "test" });
  }

  if (sum) sum.classList.add("hidden");

  updateTestProgress();
}

function finishTest() {
  const bar = document.querySelector("#testProgressBar");
  if (bar) bar.style.width = "100%";

  const len = testState.order.length || 1;
  const percent = Math.round((testState.correct / len) * 100);

  const card = $("#testCard");
  const sum = $("#testSummary");
  if (card) card.innerHTML = `<p class="muted">Koniec testu.</p>`;
  if (!sum) return;

  sum.classList.remove("hidden");

  let reviewHtml = `
    <h3>Wynik</h3>
    <p>
      Moduł: <b>${escapeHtml(testModule === "ALL" ? "Wszystkie" : testModule)}</b><br>
      <b>${testState.correct}</b> / ${len} poprawnych (${percent}%)
    </p>
    <hr>
    <h4>Przegląd pytań i poprawnych odpowiedzi</h4>
  `;

  testState.answers.forEach((ans, index) => {
    const q = QUESTIONS.find((q) => q.id === ans.id);
    if (!q) return;

    reviewHtml += `
      <div style="margin:14px 0;">
        <p><b>${index + 1}. ${escapeHtml(q.text)}</b> <span class="muted">(moduł: ${escapeHtml(q.module)})</span></p>
        ${["A", "B", "C"]
          .map((letter) => {
            let style = "";
            if (letter === ans.correct)
              style = "color: #1f9d55; font-weight: bold;";
            if (letter === ans.chosen && ans.chosen !== ans.correct)
              style = "color: #d64545; font-weight: bold;";
            return `<div style="${style}">${letter}. ${escapeHtml(q.choices?.[letter] ?? "")}</div>`;
          })
          .join("")}
        ${q.explanation ? `<p class="muted" style="margin-top:8px;">${escapeHtml(q.explanation)}</p>` : ""}
      </div>
      <hr>
    `;
  });

  sum.innerHTML = reviewHtml;
}

// ==============================
// DODAJ PYTANIE (generator JSON)
// ==============================
function nextQuestionId() {
  if (!QUESTIONS.length) return 1;
  const maxId = Math.max(...QUESTIONS.map((q) => Number(q.id) || 0));
  return maxId + 1;
}

function initAddTool() {
  const idEl = $("#addId");
  if (idEl && (!idEl.value || Number(idEl.value) < 1)) {
    idEl.value = String(nextQuestionId());
  }

  const moduleSel = $("#addModule");
  if (moduleSel) {
    const modules = getModules();
    const onlyMods = modules.filter((m) => m !== "ALL");
    moduleSel.innerHTML = onlyMods
      .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
      .join("");
    if (!moduleSel.value && onlyMods.length) moduleSel.value = onlyMods[0];
  }

  bindOnce("#addGenerate", "click", generateQuestionJson);
  bindOnce("#addCopy", "click", copyGeneratedJson);

  const st = $("#addStatus");
  if (st) st.textContent = "";
}

function bindOnce(selector, eventName, handler) {
  const el = $(selector);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  clone.addEventListener(eventName, handler);
}

function generateQuestionJson() {
  const status = $("#addStatus");
  const out = $("#addOutput");

  const id = Number($("#addId")?.value || 0);
  const moduleExisting = $("#addModule")?.value || "";
  const moduleNew = ($("#addModuleNew")?.value || "").trim();
  const moduleName = moduleNew || moduleExisting || "Inne";

  const text = ($("#addText")?.value || "").trim();
  const A = ($("#addA")?.value || "").trim();
  const B = ($("#addB")?.value || "").trim();
  const C = ($("#addC")?.value || "").trim();
  const correct = ($("#addCorrect")?.value || "A").trim().toUpperCase();
  const explanation = ($("#addExplanation")?.value || "").trim();

  const errors = [];
  if (!id || id < 1) errors.push("ID musi być liczbą >= 1");
  if (!text) errors.push("Treść pytania jest wymagana");
  if (!A || !B || !C) errors.push("Odpowiedzi A/B/C są wymagane");
  if (!["A", "B", "C"].includes(correct))
    errors.push("Poprawna odpowiedź musi być A/B/C");

  if (errors.length) {
    if (status) status.textContent = "❌ " + errors.join(" • ");
    if (out) out.value = "";
    return;
  }

  const obj = {
    id,
    module: moduleName,
    text,
    choices: { A, B, C },
    correct,
  };
  if (explanation) obj.explanation = explanation;

  const json = JSON.stringify(obj, null, 2);

  if (out) out.value = json;
  if (status)
    status.textContent = "✅ Wygenerowano. Skopiuj i wklej do questions.json";

  const idEl = $("#addId");
  if (idEl) idEl.value = String(id + 1);
}

async function copyGeneratedJson() {
  const status = $("#addStatus");
  const out = $("#addOutput");
  const text = out?.value || "";

  if (!text.trim()) {
    if (status) status.textContent = "⚠️ Najpierw wygeneruj JSON.";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = "📋 Skopiowano do schowka.";
  } catch (e) {
    out.focus();
    out.select();
    if (status)
      status.textContent =
        "⚠️ Nie mogę użyć schowka — zaznaczyłem tekst, skopiuj ręcznie (Ctrl+C).";
  }
}

// ==============================
// WSPÓLNE: HTML PYTANIA + KLIK
// ==============================
function buildQuestionHtml(q, { mode }) {
  if (!q) return `<p class="muted">Brak pytania.</p>`;

  const expl = q.explanation
    ? `<p class="muted expl" id="expl" style="visibility:hidden">
       ${escapeHtml(q.explanation)}
     </p>`
    : "";

  return `
    <p class="qTitle">${escapeHtml(q.text)}</p>
    <div class="answers">
      ${["A", "B", "C"]
        .map(
          (letter) => `
        <button class="answer" data-letter="${letter}">
          <b>${letter}.</b> ${escapeHtml(q.choices?.[letter] ?? "")}
        </button>
      `,
        )
        .join("")}
    </div>
    ${mode === "learn" ? expl : ""}
  `;
}

function wireAnswerButtons(host, q, { mode }) {
  const btns = host.querySelectorAll(".answer");

  btns.forEach((btn) =>
    btn.addEventListener("click", () => {
      const chosen = btn.dataset.letter;

      if (mode === "learn") {
        btns.forEach((b) => (b.disabled = true));
        btns.forEach((b) => {
          const letter = b.dataset.letter;
          if (letter === q.correct) b.classList.add("good");
          if (letter === chosen && chosen !== q.correct) b.classList.add("bad");
        });
        const expl = host.querySelector("#expl");
        if (expl) expl.style.visibility = "visible";
        return;
      }

      if (mode === "test") {
        const isCorrect = chosen === q.correct;
        if (isCorrect) testState.correct++;

        testState.answers.push({ id: q.id, chosen, correct: q.correct });

        testState.idx++;
        if (testState.idx >= testState.order.length) finishTest();
        else renderTestQuestion();
      }
    }),
  );
}
// zoom
function openImageModal(src, title = "Dokument") {
  const modal = $("#imgModal");
  const img = $("#imgModalImage");
  if (!modal || !img) return;

  img.src = src || "";
  img.alt = title;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}
function initImageModal() {
  const backdrop = $("#imgModalBackdrop");
  if (backdrop) backdrop.addEventListener("click", closeImageModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeImageModal();
  });
}

function closeImageModal() {
  const modal = $("#imgModal");
  const img = $("#imgModalImage");
  if (!modal || !img) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  img.removeAttribute("src");
}

function bindOncePlain(selector, eventName, handler) {
  const el = $(selector);
  if (!el) return;
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  clone.addEventListener(eventName, handler);
}
function initAutoHideHeader() {
  const header = document.querySelector(".topbar");
  if (!header) return;

  let lastY = window.scrollY;
  let ticking = false;

  window.addEventListener("scroll", () => {
    if (ticking) return;

    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const diff = y - lastY;

      // mały próg, żeby nie mrugało
      if (Math.abs(diff) > 8) {
        if (diff > 0 && y > 80) {
          // scroll w dół -> chowaj
          header.classList.add("isHidden");
        } else {
          // scroll w górę -> pokaż
          header.classList.remove("isHidden");
        }
        lastY = y;
      }

      ticking = false;
    });
  });
}
// ==============================
// START
// ==============================
(function start() {
  loadData()
    .then(() => {
      setView("home");
      initAutoHideHeader();
      initImageModal();
    })
    .catch((e) => {
      console.error(e);
      document.body.innerHTML = `
        <div style="padding:20px;font-family:system-ui">
          <h2>Błąd wczytywania danych</h2>
          <p>Sprawdź, czy pliki <b>questions.json</b> i <b>knowledge.json</b> są w tym samym folderze co <b>index.html</b> i uruchamiasz stronę przez serwer (Live Server).</p>
          <pre>${escapeHtml(e.message || String(e))}</pre>
        </div>
      `;
    });
})();
