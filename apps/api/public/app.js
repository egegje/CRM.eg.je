"use strict";

const state = {
  user: null,
  mailboxes: [],
  folders: [],
  currentFolder: null,
  currentMailbox: null,
  messages: [],
  selectedId: null,
};

/* theme */
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleSidebar() {
  const app = document.getElementById("app");
  app.classList.toggle("show-sidebar");
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

/* api */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401 || res.status === 403) {
    showLogin();
    throw new Error("auth");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/* screens */
function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}
function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

/* login */
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const u = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
    });
    state.user = u;
    await bootApp();
  } catch (err) {
    document.getElementById("login-error").textContent = "Неверный email или пароль";
  }
});

async function logout() {
  await api("/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  showLogin();
}

/* boot */
async function bootApp() {
  try {
    if (!state.user) state.user = await api("/me");
  } catch {
    showLogin();
    return;
  }
  showApp();
  document.getElementById("user-email").textContent = state.user.email;
  await Promise.all([loadMailboxes(), loadFolders()]);
  await refreshList();
}

async function loadMailboxes() {
  state.mailboxes = await api("/mailboxes");
  const list = document.getElementById("mailboxes-list");
  list.innerHTML = "";
  const all = document.createElement("div");
  all.className = "folder-item" + (state.currentMailbox === null ? " active" : "");
  all.textContent = "Все ящики";
  all.onclick = () => { state.currentMailbox = null; refreshList(); };
  list.appendChild(all);
  for (const mb of state.mailboxes) {
    const d = document.createElement("div");
    d.className = "folder-item" + (state.currentMailbox === mb.id ? " active" : "");
    d.textContent = mb.displayName;
    d.title = mb.email;
    d.onclick = () => { state.currentMailbox = mb.id; refreshList(); };
    list.appendChild(d);
  }
  const sel = document.getElementById("compose-mailbox");
  sel.innerHTML = "";
  for (const mb of state.mailboxes) {
    const opt = document.createElement("option");
    opt.value = mb.id;
    opt.textContent = `${mb.displayName} <${mb.email}>`;
    sel.appendChild(opt);
  }
}

async function loadFolders() {
  state.folders = await api("/folders");
  const list = document.getElementById("folders-list");
  list.innerHTML = "";
  const systemFolders = [
    { key: "__inbox", label: "📥 Входящие", kind: "inbox" },
    { key: "__sent", label: "📤 Отправленные", kind: "sent" },
    { key: "__drafts", label: "📝 Черновики", kind: "drafts" },
    { key: "__starred", label: "⭐ Важные", kind: null },
    { key: "__trash", label: "🗑 Корзина", kind: "trash" },
  ];
  for (const f of systemFolders) {
    const d = document.createElement("div");
    d.className = "folder-item" + (state.currentFolder === f.key ? " active" : "");
    d.textContent = f.label;
    d.onclick = () => {
      state.currentFolder = f.key;
      document.getElementById("app").classList.remove("show-sidebar");
      refreshList();
    };
    list.appendChild(d);
  }
  const custom = state.folders.filter((f) => f.kind === "custom");
  for (const f of custom) {
    const d = document.createElement("div");
    d.className = "folder-item" + (state.currentFolder === f.id ? " active" : "");
    d.innerHTML = `<span>📁 ${escapeHtml(f.name)}</span>`;
    d.onclick = () => { state.currentFolder = f.id; refreshList(); };
    list.appendChild(d);
  }
}

async function refreshList() {
  await loadMailboxes();
  await loadFolders();
  const params = new URLSearchParams();
  const q = document.getElementById("search-input").value.trim();
  if (q) params.set("q", q);
  const status = document.getElementById("status-filter").value;
  if (status !== "all") params.set("status", status);
  if (state.currentMailbox) params.set("mailboxId", state.currentMailbox);
  const sysMap = { __sent: "sent", __drafts: "drafts", __inbox: "inbox" };
  const sysKind = sysMap[state.currentFolder];
  if (sysKind) {
    const ids = state.folders.filter((f) => f.kind === sysKind).map((f) => f.id);
    if (ids.length === 1) params.set("folderId", ids[0]);
    // If multiple, leave unfiltered and post-filter client-side below
  } else if (state.currentFolder === "__trash") {
    params.set("trash", "true");
  } else if (state.currentFolder === "__starred") {
    // post-filter
  } else if (state.currentFolder) {
    params.set("folderId", state.currentFolder);
  }
  params.set("limit", "100");
  let messages = await api("/messages?" + params.toString());
  if (sysKind) {
    const ids = new Set(state.folders.filter((f) => f.kind === sysKind).map((f) => f.id));
    if (ids.size > 1) messages = messages.filter((m) => ids.has(m.folderId));
  }
  if (state.currentFolder === "__starred") messages = messages.filter((m) => m.isStarred);
  state.messages = messages;
  renderList();
}

function renderList() {
  const el = document.getElementById("messages-list");
  if (!state.messages.length) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">нет писем</div>';
    return;
  }
  el.innerHTML = "";
  for (const m of state.messages) {
    const initial = (m.fromAddr || "?")[0].toUpperCase();
    const date = m.receivedAt ? new Date(m.receivedAt).toLocaleDateString("ru", { day: "2-digit", month: "short" }) : "";
    const snippet = (m.bodyText || "").replace(/\s+/g, " ").slice(0, 120);
    const d = document.createElement("div");
    d.className = "msg-item" + (!m.isRead ? " unread" : "") + (state.selectedId === m.id ? " selected" : "");
    const star = m.isStarred ? "⭐" : "";
    const clip = 0; // attachments count not in list response
    d.innerHTML = `
      <div class="msg-avatar">${escapeHtml(initial)}</div>
      <div class="msg-body">
        <div class="msg-head"><div class="msg-from">${escapeHtml(m.fromAddr || "")}</div><div class="msg-date">${date}</div></div>
        <div class="msg-subject">${star} ${escapeHtml(m.subject || "(без темы)")}</div>
        <div class="msg-snippet">${escapeHtml(snippet)}</div>
      </div>
    `;
    d.onclick = () => selectMessage(m.id);
    el.appendChild(d);
  }
}

async function selectMessage(id) {
  state.selectedId = id;
  renderList();
  document.getElementById("app").classList.add("show-preview");
  const m = await api("/messages/" + id);
  renderPreview(m);
  // flag as read locally
  const li = state.messages.find((x) => x.id === id);
  if (li) li.isRead = true;
}

function renderPreview(m) {
  const el = document.getElementById("message-preview");
  const date = m.receivedAt ? new Date(m.receivedAt).toLocaleString("ru") : "";
  const attachHtml = (m.attachments || [])
    .map((a) => `<a class="attachment" href="/attachments/${a.id}" download>📎 ${escapeHtml(a.filename)} (${fmtSize(a.size)})</a>`)
    .join("");
  const body = m.bodyText || stripHtml(m.bodyHtml || "");
  const aiActions = (m.aiActions || []).filter((a) => !a.startsWith("_"));
  const aiHtml = m.aiSummary
    ? `<div class="ai-block"><div class="ai-label">AI · суть</div>${escapeHtml(m.aiSummary)}${
        aiActions.length
          ? `<div class="ai-label" style="margin-top:8px">Что сделать</div><ul style="margin:4px 0 0 18px;padding:0">${aiActions
              .map((a) => `<li>${escapeHtml(a)}</li>`)
              .join("")}</ul>`
          : ""
      }</div>`
    : `<div class="ai-block" id="ai-block-${m.id}"><div class="ai-label">AI · суть</div><span style="color:var(--text-muted)">не сгенерировано</span> <button class="link-btn" onclick="generateSummary('${m.id}')">сгенерировать</button></div>`;
  el.className = "";
  el.innerHTML = `
    <div class="preview-header">
      <h2>${escapeHtml(m.subject || "(без темы)")}</h2>
      <div class="preview-meta">
        <b>От:</b> ${escapeHtml(m.fromAddr || "")}<br>
        <b>Кому:</b> ${escapeHtml((m.toAddrs || []).join(", "))}<br>
        ${(m.ccAddrs || []).length ? `<b>Копия:</b> ${escapeHtml(m.ccAddrs.join(", "))}<br>` : ""}
        <b>Дата:</b> ${date}
      </div>
      <div class="preview-actions">
        <button class="mobile-back" onclick="closePreview()">← Назад</button>
        <button onclick="replyTo('${m.id}')">↩️ Ответить</button>
        <button onclick="forwardMsg('${m.id}')">↪️ Переслать</button>
        <button onclick="toggleStar('${m.id}', ${m.isStarred})">${m.isStarred ? "☆ Снять" : "⭐ Важное"}</button>
        <button onclick="deleteMsg('${m.id}')">🗑 Удалить</button>
      </div>
    </div>
    ${aiHtml}
    <div class="preview-body">${escapeHtml(body)}</div>
    ${attachHtml ? `<div class="attachments">${attachHtml}</div>` : ""}
  `;
}

function closePreview() {
  document.getElementById("app").classList.remove("show-preview");
  state.selectedId = null;
  renderList();
}

async function generateSummary(id) {
  const block = document.getElementById("ai-block-" + id);
  if (block) block.innerHTML = '<div class="ai-label">AI · суть</div><span style="color:var(--text-muted)">генерирую...</span>';
  try {
    const r = await api("/messages/" + id + "/summarize", { method: "POST" });
    const acts = (r.actions || []).filter((a) => !a.startsWith("_"));
    if (block) {
      block.innerHTML = `<div class="ai-label">AI · суть</div>${escapeHtml(r.summary)}${
        acts.length
          ? `<div class="ai-label" style="margin-top:8px">Что сделать</div><ul style="margin:4px 0 0 18px;padding:0">${acts.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>`
          : ""
      }`;
    }
  } catch (e) {
    if (block) block.innerHTML = '<div class="ai-label">AI · суть</div><span style="color:var(--danger)">ошибка: ' + escapeHtml(e.message) + "</span>";
  }
}

async function toggleStar(id, cur) {
  await api("/messages/" + id, { method: "PATCH", body: JSON.stringify({ isStarred: !cur }) });
  refreshList();
}

async function deleteMsg(id) {
  if (!confirm("Удалить письмо?")) return;
  await api("/messages/" + id, { method: "DELETE" });
  state.selectedId = null;
  document.getElementById("message-preview").className = "empty";
  document.getElementById("message-preview").textContent = "Выберите письмо";
  refreshList();
}

async function replyTo(id) {
  const m = state.messages.find((x) => x.id === id) || (await api("/messages/" + id));
  openCompose({
    to: m.fromAddr,
    subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
    bodyText: "\n\n---\n> " + (m.bodyText || "").split("\n").join("\n> "),
    mailboxId: m.mailboxId,
  });
}

async function forwardMsg(id) {
  const m = state.messages.find((x) => x.id === id) || (await api("/messages/" + id));
  openCompose({
    subject: m.subject.startsWith("Fwd:") ? m.subject : "Fwd: " + m.subject,
    bodyText: `\n\n---------- Пересылаемое сообщение ----------\nОт: ${m.fromAddr}\nТема: ${m.subject}\n\n${m.bodyText || ""}`,
    mailboxId: m.mailboxId,
  });
}

function openCompose(defaults = {}) {
  const modal = document.getElementById("compose-modal");
  const form = document.getElementById("compose-form");
  form.reset();
  if (defaults.mailboxId) form.mailboxId.value = defaults.mailboxId;
  if (defaults.to) form.to.value = defaults.to;
  if (defaults.subject) form.subject.value = defaults.subject;
  if (defaults.bodyText) form.bodyText.value = defaults.bodyText;
  modal.classList.remove("hidden");
}
function closeCompose() {
  document.getElementById("compose-modal").classList.add("hidden");
  document.getElementById("compose-error").textContent = "";
}

document.getElementById("compose-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const to = String(f.get("to") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const cc = String(f.get("cc") || "").split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const draft = await api("/messages", {
      method: "POST",
      body: JSON.stringify({
        mailboxId: f.get("mailboxId"),
        to,
        cc,
        subject: f.get("subject") || "",
        bodyText: f.get("bodyText") || "",
      }),
    });
    const sendAt = f.get("sendAt");
    await api("/messages/" + draft.id + "/send", {
      method: "POST",
      body: JSON.stringify(sendAt ? { sendAt: new Date(sendAt).toISOString() } : {}),
    });
    closeCompose();
    refreshList();
  } catch (err) {
    document.getElementById("compose-error").textContent = "Ошибка: " + err.message;
  }
});

async function createFolder() {
  const name = prompt("Название папки:");
  if (!name) return;
  await api("/folders", { method: "POST", body: JSON.stringify({ name }) });
  loadFolders();
}

/* utils */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function stripHtml(h) {
  const d = document.createElement("div");
  d.innerHTML = h;
  return d.textContent || "";
}
function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}

let searchTimer;
function debouncedSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refreshList, 300);
}

/* hotkeys */
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "Escape") closeCompose();
  if (e.key === "r" && state.selectedId) replyTo(state.selectedId);
  if (e.key === "Delete" && state.selectedId) deleteMsg(state.selectedId);
  if (e.key === "?") alert("Горячие клавиши:\nR — ответить\nDelete — удалить\nEsc — закрыть\n? — эта справка");
});

/* live polling */
setInterval(() => {
  if (!state.user || document.hidden) return;
  refreshList().catch(() => {});
}, 30000);

/* init */
initTheme();
bootApp().catch(() => showLogin());
