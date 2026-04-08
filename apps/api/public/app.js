"use strict";

const state = {
  user: null,
  mailboxes: [],
  folders: [],
  currentFolder: null,
  currentMailbox: null,
  messages: [],
  selectedId: null,
  selectedIds: new Set(),
};

/* theme */
function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  const accent = localStorage.getItem("accent");
  if (accent) document.documentElement.style.setProperty("--accent", accent);
}
function setAccent(c) {
  document.documentElement.style.setProperty("--accent", c);
  localStorage.setItem("accent", c);
}
async function forgotPassword() {
  const email = prompt("Ваш email:");
  if (!email) return;
  try {
    await fetch("/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    alert("Если такой email есть, ссылка отправлена.");
  } catch { alert("Ошибка"); }
}
function toggleSidebar() {
  const app = document.getElementById("app");
  app.classList.toggle("show-sidebar");
  let ov = document.getElementById("sidebar-overlay");
  if (app.classList.contains("show-sidebar")) {
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "sidebar-overlay";
      ov.onclick = () => toggleSidebar();
      document.body.appendChild(ov);
    }
  } else {
    ov?.remove();
  }
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

/* api */
async function api(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const headers = { ...(opts.headers || {}) };
  if (["POST", "PATCH", "PUT"].includes(method) && opts.body === undefined) {
    opts.body = "{}";
  }
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const { headers: _ignored, ...rest } = opts;
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers,
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
  // version footer
  fetch("/version").then((r) => r.json()).then((v) => {
    const el = document.getElementById("version-footer");
    if (el) el.textContent = `v${v.version} · ${v.commit.slice(0, 7)}`;
  }).catch(() => {});
  if (state.user.role === "owner" || state.user.role === "admin") {
    document.getElementById("admin-btn").classList.remove("hidden");
  }
  await Promise.all([loadMailboxes(), loadFolders()]);
  await refreshList();
}

async function loadMailboxes() {
  const [mailboxes, unread] = await Promise.all([
    api("/mailboxes"),
    api("/mailboxes/unread").catch(() => ({})),
  ]);
  state.mailboxes = mailboxes;
  state.unreadByMailbox = unread;
  const list = document.getElementById("mailboxes-list");
  list.innerHTML = "";
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const all = document.createElement("div");
  all.className = "folder-item" + (state.currentMailbox === null ? " active" : "");
  all.innerHTML = `<span>Все ящики</span>${totalUnread ? `<span class="count">${totalUnread}</span>` : ""}`;
  all.onclick = () => { exitTasksView(); state.currentMailbox = null; state.selectedIds.clear(); renderBulkBar(); refreshList(); };
  list.appendChild(all);
  for (const mb of state.mailboxes) {
    const u = unread[mb.id] || 0;
    const d = document.createElement("div");
    d.className = "folder-item" + (state.currentMailbox === mb.id ? " active" : "");
    d.innerHTML = `<span>${escapeHtml(mb.displayName)}</span>${u ? `<span class="count">${u}</span>` : ""}`;
    d.title = mb.email;
    d.onclick = () => { exitTasksView(); state.currentMailbox = mb.id; state.selectedIds.clear(); renderBulkBar(); refreshList(); };
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
      exitTasksView();
      state.currentFolder = f.key;
      state.selectedIds.clear();
      renderBulkBar();
      document.getElementById("app").classList.remove("show-sidebar");
      document.getElementById("sidebar-overlay")?.remove();
      refreshList();
    };
    list.appendChild(d);
  }
  const custom = state.folders.filter((f) => f.kind === "custom");
  for (const f of custom) {
    const d = document.createElement("div");
    d.className = "folder-item" + (state.currentFolder === f.id ? " active" : "");
    d.innerHTML = `<span>📁 ${escapeHtml(f.name)}</span>`;
    d.onclick = () => { exitTasksView(); state.currentFolder = f.id; state.selectedIds.clear(); renderBulkBar(); refreshList(); };
    list.appendChild(d);
  }
  // Smart folders
  try {
    const smart = await api("/smart-folders");
    if (smart.length) {
      const title = document.createElement("div");
      title.className = "folder-title";
      title.textContent = "Умные папки";
      title.style.marginTop = "12px";
      list.appendChild(title);
    }
    for (const sf of smart) {
      const d = document.createElement("div");
      d.className = "folder-item" + (state.currentFolder === "smart:" + sf.id ? " active" : "");
      d.innerHTML = `<span>🔮 ${escapeHtml(sf.name)}</span>`;
      d.onclick = () => { exitTasksView(); state.currentFolder = "smart:" + sf.id; refreshList(); };
      list.appendChild(d);
    }
    const add = document.createElement("button");
    add.className = "link-btn";
    add.textContent = "+ умная папка";
    add.onclick = createSmartFolder;
    list.appendChild(add);
  } catch {}
}

async function createSmartFolder() {
  const name = prompt("Название умной папки:");
  if (!name) return;
  const q = prompt("Поисковая фраза (FTS):") || "";
  const from = prompt("От кого (необязательно):") || "";
  await api("/smart-folders", {
    method: "POST",
    body: JSON.stringify({ name, query: { q, from: from || undefined } }),
  });
  loadFolders();
}

async function refreshList() {
  await loadMailboxes();
  await loadFolders();
  const params = new URLSearchParams();
  const q = document.getElementById("search-input").value.trim();
  if (q) params.set("q", q);
  const status = document.getElementById("status-filter").value;
  if (status !== "all") params.set("status", status);
  const df = document.getElementById("date-from").value;
  const dt = document.getElementById("date-to").value;
  if (df) params.set("dateFrom", df);
  if (dt) params.set("dateTo", dt);
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
  let messages;
  if (state.currentFolder && state.currentFolder.startsWith("smart:")) {
    messages = await api("/smart-folders/" + state.currentFolder.slice(6) + "/messages");
  } else {
    messages = await api("/messages?" + params.toString());
  }
  if (sysKind) {
    const ids = new Set(state.folders.filter((f) => f.kind === sysKind).map((f) => f.id));
    if (ids.size > 1) messages = messages.filter((m) => ids.has(m.folderId));
  }
  if (state.currentFolder === "__starred") messages = messages.filter((m) => m.isStarred);
  // outbox indicator
  try {
    const ob = await api("/outbox");
    const badge = document.getElementById("outbox-badge");
    if (badge) badge.textContent = ob.pending > 0 ? `📤 ${ob.pending}` : "";
  } catch {}
  state.messages = messages;
  renderList();
}

async function loadMore() {
  if (!state.messages.length) return;
  const last = state.messages[state.messages.length - 1];
  const params = new URLSearchParams();
  params.set("cursor", last.id);
  params.set("limit", "100");
  if (state.currentMailbox) params.set("mailboxId", state.currentMailbox);
  const more = await api("/messages?" + params.toString());
  state.messages = state.messages.concat(more);
  renderList();
}

function toggleSelect(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderBulkBar();
}

function renderBulkBar() {
  let bar = document.getElementById("bulk-bar");
  if (state.selectedIds.size === 0) {
    bar?.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bulk-bar";
    bar.className = "bulk-bar";
    document.querySelector(".list-pane").prepend(bar);
  }
  const customs = state.folders.filter((f) => f.kind === "custom");
  const moveOpts = customs.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  bar.innerHTML = `
    <span>${state.selectedIds.size} выбрано</span>
    <button onclick="bulkAction('read')">прочитано</button>
    <button onclick="bulkAction('star')">⭐</button>
    <button onclick="bulkAction('delete')">🗑</button>
    ${customs.length ? `<select onchange="bulkMove(this.value);this.value=''"><option value="">→ в папку</option>${moveOpts}</select>` : ""}
    <button onclick="state.selectedIds.clear();renderList();renderBulkBar()">×</button>
  `;
}

async function bulkMove(folderId) {
  if (!folderId) return;
  const ids = [...state.selectedIds];
  await api("/messages/bulk", { method: "POST", body: JSON.stringify({ ids, action: "move", folderId }) });
  state.selectedIds.clear();
  renderBulkBar();
  refreshList();
}

async function bulkAction(action) {
  const ids = [...state.selectedIds];
  await api("/messages/bulk", { method: "POST", body: JSON.stringify({ ids, action }) });
  if (action === "delete") {
    showToast(`${ids.length} удалено`, async () => {
      await api("/messages/bulk", { method: "POST", body: JSON.stringify({ ids, action: "restore" }) });
      refreshList();
    });
  }
  state.selectedIds.clear();
  renderBulkBar();
  refreshList();
}

function showToast(text, onUndo) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${escapeHtml(text)}</span> ${onUndo ? '<button>отменить</button>' : ""}`;
  if (onUndo) t.querySelector("button").onclick = () => { onUndo(); t.remove(); };
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

function dateGroup(d) {
  if (!d) return "Раньше";
  const now = new Date();
  const t = new Date(d);
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) return "Сегодня";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (t.toDateString() === yesterday.toDateString()) return "Вчера";
  const week = new Date(now); week.setDate(now.getDate() - 7);
  if (t > week) return "На этой неделе";
  return "Раньше";
}

function formatListDate(d) {
  if (!d) return "";
  const t = new Date(d);
  const now = new Date();
  const sameDay = t.toDateString() === now.toDateString();
  if (sameDay) return t.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  const sameYear = t.getFullYear() === now.getFullYear();
  return t.toLocaleDateString("ru", sameYear ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function highlight(text, q) {
  if (!q) return escapeHtml(text || "");
  const safeText = escapeHtml(text || "");
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safeText.replace(new RegExp("(" + safeQ + ")", "gi"), "<mark>$1</mark>");
}

function renderList() {
  const el = document.getElementById("messages-list");
  if (!state.messages.length) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">нет писем</div>';
    return;
  }
  el.innerHTML = "";
  let lastGroup = null;
  for (const m of state.messages) {
    const g = dateGroup(m.receivedAt);
    if (g !== lastGroup) {
      const h = document.createElement("div");
      h.className = "list-group";
      h.textContent = g;
      el.appendChild(h);
      lastGroup = g;
    }
    const initial = (m.fromAddr || "?")[0].toUpperCase();
    const date = formatListDate(m.receivedAt);
    const hasAttach = (m._count?.attachments || 0) > 0;
    const clip = hasAttach ? '<span class="msg-clip" title="есть вложения">📎</span>' : "";
    const snippet = (m.bodyText || "").replace(/\s+/g, " ").slice(0, 120);
    const d = document.createElement("div");
    d.className = "msg-item" + (!m.isRead ? " unread" : "") + (state.selectedId === m.id ? " selected" : "");
    const star = m.isStarred ? "⭐" : "";
    const checked = state.selectedIds.has(m.id) ? "checked" : "";
    const prio = m.aiPriority || "";
    const prioBadge = prio === "high" ? '<span class="prio prio-high">!</span>' : prio === "spam" ? '<span class="prio prio-spam">×</span>' : "";
    const q = document.getElementById("search-input").value.trim();
    d.innerHTML = `
      <input type="checkbox" class="msg-check" ${checked} onclick="event.stopPropagation();toggleSelect('${m.id}')">
      <div class="msg-avatar">${escapeHtml(initial)}</div>
      <div class="msg-body">
        <div class="msg-head"><div class="msg-from">${prioBadge}${highlight(m.fromAddr || "", q)}</div><div class="msg-date">${date}</div></div>
        <div class="msg-subject">${star}${clip} ${highlight(m.subject || "(без темы)", q)}</div>
        <div class="msg-snippet">${highlight(snippet, q)}</div>
      </div>
    `;
    d.onclick = () => selectMessage(m.id);
    addSwipe(d, m);
    el.appendChild(d);
  }
  if (state.messages.length >= 100) {
    const more = document.createElement("button");
    more.style.cssText = "display:block;margin:14px auto;padding:8px 16px;background:var(--bg-alt);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text)";
    more.textContent = "Загрузить ещё";
    more.onclick = loadMore;
    el.appendChild(more);
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
    .map((a) => {
      const isImg = /^image\//.test(a.mime || "");
      if (isImg) {
        return `<div style="display:inline-block;margin:6px 8px 6px 0;vertical-align:top"><img src="/attachments/${a.id}" alt="${escapeHtml(a.filename)}" style="max-width:240px;max-height:240px;border-radius:6px;border:1px solid var(--border);display:block"><a class="attachment" href="/attachments/${a.id}" download style="display:block;margin-top:4px;font-size:11px">⬇ ${escapeHtml(a.filename)} (${fmtSize(a.size)})</a></div>`;
      }
      return `<a class="attachment" href="/attachments/${a.id}" download>📎 ${escapeHtml(a.filename)} (${fmtSize(a.size)})</a>`;
    })
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
        <button onclick="aiReply('${m.id}')">🤖 AI ответ</button>
        <button onclick="forwardMsg('${m.id}')">↪️ Переслать</button>
        <button onclick="emailToTask('${m.id}')">📋 → задача</button>
        <button onclick="snoozeMsg('${m.id}')">⏰ Напомнить</button>
        <button onclick="exportPdf('${m.id}')">📄 PDF</button>
        <button onclick="blockSender('${escapeHtml(m.fromAddr)}')">🚫 Блок отправителя</button>
        <button onclick="toggleStar('${m.id}', ${m.isStarred})">${m.isStarred ? "☆ Снять" : "⭐ Важное"}</button>
        <button onclick="markUnread('${m.id}')">📩 Непрочитано</button>
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

async function markUnread(id) {
  await api("/messages/" + id, { method: "PATCH", body: JSON.stringify({ isRead: false }) });
  closePreview();
  refreshList();
}

async function deleteMsg(id) {
  await api("/messages/" + id, { method: "DELETE" });
  state.selectedId = null;
  document.getElementById("message-preview").className = "empty";
  document.getElementById("message-preview").textContent = "Выберите письмо";
  showToast("Письмо в корзине", async () => {
    await api("/messages/" + id + "/restore", { method: "POST" });
    refreshList();
  });
  refreshList();
}

async function exportPdf(id) {
  const m = state.messages.find((x) => x.id === id) || (await api("/messages/" + id));
  // Render preview-pane via html2canvas (browser fonts → perfect Cyrillic)
  showToast("Генерация PDF...", null);
  const node = document.getElementById("message-preview");
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
  const img = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  let imgW = pageW - 40;
  let imgH = imgW / ratio;
  if (imgH > pageH - 40) {
    imgH = pageH - 40;
    imgW = imgH * ratio;
  }
  pdf.addImage(img, "PNG", 20, 20, imgW, imgH);
  pdf.save(`${(m.subject || "email").replace(/[^a-z0-9а-яё]+/gi, "_").slice(0, 60)}.pdf`);
}

async function blockSender(email) {
  if (!confirm(`Заблокировать отправителя ${email}? (создастся правило → переместить в Корзину)`)) return;
  // Find or create a Trash folder for any mailbox; rules are global so use first trash
  const folders = await api("/folders");
  const trash = folders.find((f) => f.kind === "trash");
  if (!trash) return alert("нет папки trash");
  await api("/admin/rules", {
    method: "POST",
    body: JSON.stringify({ triggerType: "from", contains: email, folderId: trash.id, enabled: true }),
  });
  showToast("Отправитель заблокирован", null);
}

async function snoozeMsg(id) {
  const opts = [
    { label: "Через час", offset: 60 * 60 * 1000 },
    { label: "Завтра 9:00", offset: null },
    { label: "Через неделю", offset: 7 * 24 * 60 * 60 * 1000 },
    { label: "Своё время", offset: null },
  ];
  const choice = prompt("Когда напомнить?\n1. Через час\n2. Завтра 9:00\n3. Через неделю\n4. Своё время (введите дату YYYY-MM-DD HH:MM)");
  if (!choice) return;
  let until;
  if (choice === "1") until = new Date(Date.now() + opts[0].offset);
  else if (choice === "2") {
    const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0); until = t;
  } else if (choice === "3") until = new Date(Date.now() + opts[2].offset);
  else {
    const d = new Date(choice.replace(" ", "T"));
    if (isNaN(d.getTime())) return alert("неверная дата");
    until = d;
  }
  await api("/messages/" + id + "/snooze", { method: "POST", body: JSON.stringify({ until: until.toISOString() }) });
  showToast(`Напомнить ${until.toLocaleString("ru")}`, null);
}

async function aiReply(id) {
  showToast("Генерирую ответ...", null);
  try {
    const r = await api("/messages/" + id + "/ai-reply", { method: "POST" });
    showToast("Черновик в Drafts", null);
    // Open compose with the draft
    const m = state.messages.find((x) => x.id === id) || (await api("/messages/" + id));
    openCompose({
      to: m.fromAddr,
      subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
      bodyText: r.bodyText,
      mailboxId: m.mailboxId,
    });
  } catch (e) {
    showToast("Ошибка: " + e.message, null);
  }
}

async function replyTo(id) {
  const m = state.messages.find((x) => x.id === id) || (await api("/messages/" + id));
  const quoted = (m.bodyText || "")
    .split("\n")
    .map((line) => (line.length ? "> " + line : ">"))
    .join("\n");
  openCompose({
    to: m.fromAddr,
    subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
    bodyText: "\n\n--- " + new Date(m.receivedAt || Date.now()).toLocaleString("ru") + ", " + (m.fromAddr || "") + " писал:\n" + quoted,
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

async function loadTemplates() {
  try {
    const list = await api("/templates");
    const sel = document.getElementById("template-select");
    sel.innerHTML = '<option value="">📋 шаблон...</option>' +
      list.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("") +
      '<option value="__delete">— управление —</option>';
    window._templates = list;
  } catch {}
}

function applyTemplate(id) {
  if (!id) return;
  if (id === "__delete") {
    const list = window._templates || [];
    if (!list.length) return alert("нет шаблонов");
    const lines = list.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
    const idx = parseInt(prompt("Номер шаблона для удаления:\n" + lines), 10);
    if (!idx || idx < 1 || idx > list.length) return;
    api("/templates/" + list[idx - 1].id, { method: "DELETE" }).then(loadTemplates);
    return;
  }
  const t = (window._templates || []).find((x) => x.id === id);
  if (t) document.getElementById("compose-form").bodyText.value = t.body;
}

async function saveAsTemplate() {
  const body = document.getElementById("compose-form").bodyText.value;
  if (!body.trim()) return alert("пусто");
  const name = prompt("Название шаблона:");
  if (!name) return;
  await api("/templates", { method: "POST", body: JSON.stringify({ name, body }) });
  loadTemplates();
}

async function loadSenderPersonas() {
  const sel = document.getElementById("compose-persona");
  if (!sel) return;
  try {
    const personas = await api("/personas").catch(() => []);
    const opts = ['<option value="">— без визитки —</option>'];
    for (const p of personas) {
      opts.push(`<option value="${p.id}">${escapeHtml(p.name)}</option>`);
    }
    sel.innerHTML = opts.join("");
    sel.parentElement.style.display = personas.length ? "" : "none";
  } catch {
    sel.parentElement.style.display = "none";
  }
}

async function loadContactsDatalist() {
  try {
    const list = await api("/admin/contacts?limit=200").catch(() => []);
    const dl = document.getElementById("contacts-list");
    dl.innerHTML = list.map((c) => `<option value="${escapeHtml(c.email)}">${escapeHtml(c.name || c.email)}</option>`).join("");
  } catch {}
}

function openCompose(defaults = {}) {
  loadContactsDatalist();
  loadTemplates();
  loadSenderPersonas();
  const modal = document.getElementById("compose-modal");
  const form = document.getElementById("compose-form");
  form.reset();
  if (defaults.mailboxId) form.mailboxId.value = defaults.mailboxId;
  if (defaults.personaId) form.personaId.value = defaults.personaId;
  if (defaults.to) form.to.value = defaults.to;
  if (defaults.subject) form.subject.value = defaults.subject;
  if (defaults.bodyText) form.bodyText.value = defaults.bodyText;
  modal.classList.remove("hidden");
}
function closeCompose() {
  document.getElementById("compose-modal").classList.add("hidden");
  document.getElementById("compose-error").textContent = "";
}

function validateEmails(s) {
  if (!s.trim()) return true;
  return s.split(",").map((x) => x.trim()).filter(Boolean).every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

document.getElementById("compose-form").addEventListener("input", (e) => {
  if (e.target.name === "to" || e.target.name === "cc") {
    e.target.style.borderColor = validateEmails(e.target.value) ? "" : "var(--danger)";
  }
});

document.getElementById("compose-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const to = String(f.get("to") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const cc = String(f.get("cc") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
    document.getElementById("compose-error").textContent = "Невалидный email в поле «Кому»";
    return;
  }
  try {
    const draft = await api("/messages", {
      method: "POST",
      body: JSON.stringify({
        mailboxId: f.get("mailboxId"),
        to, cc,
        subject: f.get("subject") || "",
        bodyText: f.get("bodyText") || "",
      }),
    });
    const personaId = f.get("personaId");
    if (personaId) {
      await api("/messages/" + draft.id, {
        method: "PATCH",
        body: JSON.stringify({ personaId }),
      });
    }
    // upload attachments with progress
    const files = document.getElementById("compose-files").files;
    const progress = document.getElementById("upload-progress");
    if (files && files.length) {
      progress.classList.remove("hidden");
      for (let i = 0; i < files.length; i++) {
        await uploadFile("/messages/" + draft.id + "/attachments", files[i], (pct) => {
          progress.value = ((i + pct / 100) / files.length) * 100;
        });
      }
      progress.classList.add("hidden");
    }
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

function uploadFile(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText || "{}"));
      else reject(new Error(`upload ${xhr.status}: ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error("upload network error"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

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
  // Cmd/Ctrl+Enter in compose form → submit
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    if (!composeBox().classList.contains("hidden")) {
      e.preventDefault();
      document.getElementById("compose-form").requestSubmit();
      return;
    }
  }
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "Escape") { closeCompose(); closeSettings(); closeAdmin(); }
  if (e.key === "r" && state.selectedId) replyTo(state.selectedId);
  if (e.key === "Delete" && state.selectedId) deleteMsg(state.selectedId);
  if (e.key === "?") alert("Горячие клавиши:\nR — ответить\nDelete — удалить\nEsc — закрыть\n⌘/Ctrl+Enter — отправить письмо\n? — эта справка");
});

/* stats */
async function openStats() {
  const s = await api("/stats");
  const days = s.last7days.map((d) => `<div style="display:inline-block;width:36px;text-align:center;font-size:11px"><div style="height:${Math.min(80, d.c)}px;background:var(--accent);margin-bottom:4px"></div>${new Date(d.d).getDate()}.${new Date(d.d).getMonth()+1}<br><b>${d.c}</b></div>`).join("");
  const mb = s.byMailbox.map((m) => `<tr><td>${escapeHtml(m.email)}</td><td style="text-align:right">${m.c}</td></tr>`).join("");
  const pr = s.byPriority.map((p) => `<tr><td>${escapeHtml(p.p || "—")}</td><td style="text-align:right">${p.c}</td></tr>`).join("");
  const html = `
    <div class="modal-box admin-box">
      <div class="modal-header"><h3>📊 Статистика</h3><button onclick="this.closest('.modal').remove()">✕</button></div>
      <div style="padding:20px">
        <div style="display:flex;gap:24px;margin-bottom:24px">
          <div><div style="font-size:24px;font-weight:700">${s.total}</div><div style="color:var(--text-muted);font-size:12px">всего писем</div></div>
          <div><div style="font-size:24px;font-weight:700">${s.unread}</div><div style="color:var(--text-muted);font-size:12px">непрочитано</div></div>
        </div>
        <h4>Поступление за 7 дней</h4>
        <div style="display:flex;gap:4px;align-items:flex-end;height:120px;margin:10px 0 24px">${days || "<i>нет данных</i>"}</div>
        <div style="display:flex;gap:24px">
          <div style="flex:1"><h4>По ящикам</h4><table class="admin-table">${mb}</table></div>
          <div style="flex:1"><h4>По приоритету</h4><table class="admin-table">${pr || "<tr><td>нет данных</td></tr>"}</table></div>
        </div>
      </div>
    </div>
  `;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = html;
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

/* tasks */
let tasksFilter = null;
let _projects = [];
let _users = [];

async function showFinanceView() {
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("tasks-view").classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("finance-view").classList.remove("hidden");
  document.getElementById("app").style.gridTemplateColumns = "240px 1fr";
  await loadFinance();
}

function exitFinanceView() {
  const v = document.getElementById("finance-view");
  if (v) v.classList.add("hidden");
}

async function loadFinance() {
  const companies = await api("/companies");
  const list = document.getElementById("finance-list");
  const totals = document.getElementById("finance-totals");
  if (!companies.length) {
    list.innerHTML = '<div style="color:var(--text-muted);padding:30px;text-align:center">пока нет компаний — нажмите «+ Компания»</div>';
    totals.innerHTML = "";
    return;
  }
  // Aggregate by currency
  const byCcy = {};
  for (const c of companies) {
    for (const a of c.accounts) {
      byCcy[a.currency] = (byCcy[a.currency] || 0) + Number(a.balance);
    }
  }
  totals.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Итого по валютам:</div>' +
    Object.entries(byCcy).map(([c, v]) => `<span style="display:inline-block;margin-right:18px;font-size:18px;font-weight:600">${fmtMoney(v)} <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(c)}</span></span>`).join("");

  list.innerHTML = companies.map((c) => {
    const compTotals = {};
    for (const a of c.accounts) compTotals[a.currency] = (compTotals[a.currency] || 0) + Number(a.balance);
    const totalStr = Object.entries(compTotals).map(([cc, v]) => `${fmtMoney(v)} ${cc}`).join(" · ") || "—";
    const accs = c.accounts.map((a) => `
      <tr>
        <td style="padding:6px 8px">${escapeHtml(a.bank)}</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:12px">${escapeHtml(a.accountNumber)}</td>
        <td style="padding:6px 8px;text-align:right;font-weight:600">${fmtMoney(a.balance)} ${escapeHtml(a.currency)}</td>
        <td style="padding:6px 8px;font-size:11px;color:var(--text-muted)">${new Date(a.updatedAt).toLocaleString("ru")}</td>
        <td style="padding:6px 8px"><button onclick="editAccount('${a.id}','${c.id}')" style="font-size:11px">✏️</button> <button class="danger" onclick="deleteAccount('${a.id}')" style="font-size:11px">✕</button></td>
      </tr>
    `).join("");
    return `
      <div style="background:var(--bg-alt);border:1px solid var(--border);border-radius:6px;padding:14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:600;font-size:15px">${escapeHtml(c.name)}${c.inn ? ` <span style="font-size:11px;color:var(--text-muted)">ИНН ${escapeHtml(c.inn)}</span>` : ""}</div>
            ${c.sberCustId ? `<div style="font-size:10px;color:var(--text-muted)">Сбер custId: ${escapeHtml(c.sberCustId)}</div>` : ""}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:13px;color:var(--text-muted)">Σ ${totalStr}</span>
            <button onclick="openAccountForm('${c.id}')" style="padding:6px 10px;background:var(--accent);color:white;border:none;border-radius:5px;cursor:pointer;font-size:11px">+ Счёт</button>
            <button onclick="editCompany('${c.id}')" style="font-size:11px">✏️</button>
            <button class="danger" onclick="deleteCompany('${c.id}')" style="font-size:11px">✕</button>
          </div>
        </div>
        ${c.accounts.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse">
          <thead style="font-size:11px;color:var(--text-muted);text-align:left">
            <tr><th style="padding:4px 8px">Банк</th><th style="padding:4px 8px">Счёт</th><th style="padding:4px 8px;text-align:right">Остаток</th><th style="padding:4px 8px">Обновлено</th><th></th></tr>
          </thead>
          <tbody>${accs}</tbody>
        </table>` : `<div style="font-size:12px;color:var(--text-muted);padding:8px">нет счетов</div>`}
      </div>
    `;
  }).join("");
}

function fmtMoney(v) {
  const n = Number(v);
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function openCompanyForm() {
  const name = prompt("Название компании:");
  if (!name) return;
  const inn = prompt("ИНН (опционально):") || undefined;
  const sberCustId = prompt("Sber custId (опционально):") || undefined;
  await api("/companies", { method: "POST", body: JSON.stringify({ name, inn, sberCustId }) });
  loadFinance();
}

async function editCompany(id) {
  const c = (await api("/companies")).find((x) => x.id === id);
  if (!c) return;
  const name = prompt("Название:", c.name);
  if (name === null) return;
  const inn = prompt("ИНН:", c.inn || "");
  const sberCustId = prompt("Sber custId:", c.sberCustId || "");
  await api("/companies/" + id, {
    method: "PATCH",
    body: JSON.stringify({ name, inn: inn || null, sberCustId: sberCustId || null }),
  });
  loadFinance();
}

async function deleteCompany(id) {
  if (!confirm("Удалить компанию и все её счета?")) return;
  await api("/companies/" + id, { method: "DELETE" });
  loadFinance();
}

async function openAccountForm(companyId) {
  const bank = prompt("Банк (например «Сбер»):");
  if (!bank) return;
  const accountNumber = prompt("Номер счёта:");
  if (!accountNumber) return;
  const currency = prompt("Валюта:", "RUB") || "RUB";
  const balance = parseFloat(prompt("Остаток:", "0") || "0");
  await api("/bank-accounts", {
    method: "POST",
    body: JSON.stringify({ companyId, bank, accountNumber, currency, balance }),
  });
  loadFinance();
}

async function editAccount(id) {
  const companies = await api("/companies");
  const acc = companies.flatMap((c) => c.accounts).find((a) => a.id === id);
  if (!acc) return;
  const bank = prompt("Банк:", acc.bank);
  if (bank === null) return;
  const accountNumber = prompt("Счёт:", acc.accountNumber);
  if (accountNumber === null) return;
  const currency = prompt("Валюта:", acc.currency);
  if (currency === null) return;
  const balance = parseFloat(prompt("Остаток:", String(acc.balance)) || "0");
  await api("/bank-accounts/" + id, {
    method: "PATCH",
    body: JSON.stringify({ bank, accountNumber, currency, balance }),
  });
  loadFinance();
}

async function deleteAccount(id) {
  if (!confirm("Удалить счёт?")) return;
  await api("/bank-accounts/" + id, { method: "DELETE" });
  loadFinance();
}

async function showTasksView(filter) {
  tasksFilter = filter || null;
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("tasks-view").classList.remove("hidden");
  // collapse the 5-col mail grid down to a sidebar + tasks layout so the
  // tasks pane stretches to the full viewport instead of sitting in the
  // narrow 4px resizer slot.
  document.getElementById("app").style.gridTemplateColumns = "240px 1fr";
  const titles = { me: "Мои задачи", overdue: "Просроченные", done: "Выполненные" };
  document.getElementById("tasks-view-title").textContent = titles[filter] || "Все задачи";
  setTasksMode(tasksMode);
}

function exitTasksView() {
  document.getElementById("tasks-view").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.querySelector(".list-pane").classList.remove("hidden");
  document.querySelector(".preview-pane").classList.remove("hidden");
  document.getElementById("resizer-1").style.display = "";
  document.getElementById("resizer-2").style.display = "";
  document.getElementById("app").style.gridTemplateColumns = "";
  // re-apply persisted resizer widths
  const saved = JSON.parse(localStorage.getItem("crm-cols") || "null");
  if (saved && window.innerWidth > 900) {
    document.getElementById("app").style.gridTemplateColumns = `${saved.sidebar}px 4px ${saved.list}px 4px 1fr`;
  }
}

let tasksMode = localStorage.getItem("tasks-mode") || "list";
let _tags = [];

function setTasksMode(mode) {
  tasksMode = mode;
  localStorage.setItem("tasks-mode", mode);
  document.getElementById("tasks-mode-list").style.background = mode === "list" ? "var(--accent)" : "var(--bg-alt)";
  document.getElementById("tasks-mode-list").style.color = mode === "list" ? "white" : "var(--text)";
  document.getElementById("tasks-mode-kanban").style.background = mode === "kanban" ? "var(--accent)" : "var(--bg-alt)";
  document.getElementById("tasks-mode-kanban").style.color = mode === "kanban" ? "white" : "var(--text)";
  loadTasks();
}

async function loadTasks() {
  // Refresh tag dropdown lazily on first call
  if (!_tags.length) {
    _tags = await api("/tags").catch(() => []);
    const sel = document.getElementById("tasks-tag-filter");
    if (sel && _tags.length) {
      sel.innerHTML = '<option value="">все теги</option>' +
        _tags.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
    }
  }
  const params = new URLSearchParams();
  if (tasksFilter === "me" && state.user) params.set("assigneeId", state.user.id);
  if (tasksMode !== "kanban" && tasksFilter !== "overdue" && tasksFilter !== "done") params.set("status", "open");
  if (tasksFilter === "done") params.set("status", "done");
  const search = document.getElementById("tasks-search")?.value;
  if (search) params.set("search", search);
  params.set("limit", "500");
  let tasks = await api("/tasks?" + params.toString());
  if (tasksFilter === "overdue") {
    const now = new Date();
    tasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "done");
  }
  const tagFilter = document.getElementById("tasks-tag-filter")?.value;
  if (tagFilter) {
    tasks = tasks.filter((t) => (t.tagAssignments || []).some((a) => a.tagId === tagFilter));
  }
  if (tasksMode === "kanban") renderKanban(tasks);
  else renderTasks(tasks);
}

function tagPillsHtml(t) {
  return (t.tagAssignments || [])
    .map((a) => `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:10px;background:${a.tag?.color || "#6b7280"};color:white;margin-right:4px">${escapeHtml(a.tag?.name || "?")}</span>`)
    .join("");
}

function renderTasks(tasks) {
  const el = document.getElementById("tasks-list");
  if (!tasks.length) {
    el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">нет задач</div>';
    return;
  }
  const prioColor = { urgent: "#ef4444", high: "#f59e0b", normal: "var(--text)", low: "var(--text-muted)" };
  el.innerHTML = tasks.map((t) => {
    const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done";
    const done = t.status === "done";
    return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:start;gap:10px" onclick="openTaskForm('${t.id}')">
      <input type="checkbox" ${done ? "checked" : ""} onclick="event.stopPropagation();toggleTaskDone('${t.id}', this.checked)" style="margin-top:3px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:${done ? 400 : 600};text-decoration:${done ? "line-through" : "none"};color:${prioColor[t.priority] || "var(--text)"};word-wrap:break-word">
          ${t.priority === "urgent" ? "🔥 " : ""}${escapeHtml(t.title)}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
          ${t.project ? `📁 ${escapeHtml(t.project.name)} · ` : ""}
          ${t.dueDate ? `${overdue ? "⏰" : "📅"} ${new Date(t.dueDate).toLocaleDateString("ru")} · ` : ""}
          ${t.priority}${t.category ? ` · ${escapeHtml(t.category)}` : ""}
        </div>
        ${tagPillsHtml(t) ? `<div style="margin-top:5px">${tagPillsHtml(t)}</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

const KANBAN_COLS = [
  { key: "open", title: "📥 Открыта", color: "#3b82f6" },
  { key: "in_progress", title: "⚙ В работе", color: "#f59e0b" },
  { key: "done", title: "✅ Выполнена", color: "#10b981" },
  { key: "cancelled", title: "✕ Отменена", color: "#6b7280" },
];

function renderKanban(tasks) {
  const el = document.getElementById("tasks-list");
  const prioIcon = { urgent: "🔥", high: "⚠", normal: "", low: "·" };
  const grouped = Object.fromEntries(KANBAN_COLS.map((c) => [c.key, []]));
  for (const t of tasks) (grouped[t.status] || (grouped.open ||= [])).push(t);
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(${KANBAN_COLS.length},1fr);gap:10px;align-items:start">
      ${KANBAN_COLS.map((c) => `
        <div class="kanban-col" data-status="${c.key}" ondragover="event.preventDefault()" ondrop="kanbanDrop(event, '${c.key}')" style="background:var(--bg-alt);border:1px solid var(--border);border-radius:6px;padding:8px;min-height:300px">
          <div style="font-weight:600;font-size:12px;margin-bottom:8px;color:${c.color}">${c.title} · ${grouped[c.key].length}</div>
          ${grouped[c.key].map((t) => {
            const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done";
            return `<div draggable="true" ondragstart="kanbanDrag(event, '${t.id}')" onclick="openTaskForm('${t.id}')" style="background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:8px 10px;margin-bottom:6px;cursor:grab;font-size:12px">
              <div style="font-weight:600;word-wrap:break-word">${prioIcon[t.priority] || ""} ${escapeHtml(t.title)}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                ${t.project ? `📁 ${escapeHtml(t.project.name)}` : ""}
                ${t.dueDate ? ` · ${overdue ? "⏰" : "📅"}${new Date(t.dueDate).toLocaleDateString("ru")}` : ""}
              </div>
              ${tagPillsHtml(t) ? `<div style="margin-top:4px">${tagPillsHtml(t)}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function kanbanDrag(e, id) {
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "move";
}
async function kanbanDrop(e, status) {
  e.preventDefault();
  const id = e.dataTransfer.getData("text/plain");
  if (!id) return;
  await api("/tasks/" + id, { method: "PATCH", body: JSON.stringify({ status }) });
  loadTasks();
}

async function addTaskComment() {
  const input = document.getElementById("task-comment-input");
  const text = input.value.trim();
  if (!text) return;
  const id = document.getElementById("task-form").id.value;
  if (!id) return;
  await api("/tasks/" + id + "/comments", { method: "POST", body: JSON.stringify({ text }) });
  input.value = "";
  // re-render comments
  const t = await api("/tasks/" + id);
  renderTaskComments(t.comments || []);
}

async function renderTaskTagsEditor(taskId, assignments) {
  if (!_tags.length) _tags = await api("/tags").catch(() => []);
  const list = document.getElementById("task-tags-list");
  const assigned = new Set(assignments.map((a) => a.tagId));
  const pills = _tags.map((tag) => {
    const isOn = assigned.has(tag.id);
    return `<span onclick="toggleTaskTag('${taskId}', '${tag.id}', ${isOn})" style="cursor:pointer;display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;background:${isOn ? tag.color : "transparent"};color:${isOn ? "white" : "var(--text-muted)"};border:1px solid ${tag.color}">${escapeHtml(tag.name)}</span>`;
  }).join("");
  list.innerHTML = pills + ` <button type="button" onclick="createTagInline('${taskId}')" style="padding:2px 8px;font-size:11px;background:none;border:1px dashed var(--border);border-radius:10px;cursor:pointer;color:var(--text-muted)">+ новый</button>`;
}

async function toggleTaskTag(taskId, tagId, isOn) {
  if (isOn) {
    await api(`/tasks/${taskId}/tags/${tagId}`, { method: "DELETE" });
  } else {
    await api(`/tasks/${taskId}/tags`, { method: "POST", body: JSON.stringify({ tagId }) });
  }
  const t = await api("/tasks/" + taskId);
  renderTaskTagsEditor(taskId, t.tagAssignments || []);
}
async function createTagInline(taskId) {
  const name = prompt("Название тега:");
  if (!name) return;
  const color = prompt("Цвет (hex, например #ef4444):", "#3b82f6");
  const tag = await api("/tags", { method: "POST", body: JSON.stringify({ name, color }) });
  _tags.push(tag);
  await api(`/tasks/${taskId}/tags`, { method: "POST", body: JSON.stringify({ tagId: tag.id }) });
  const t = await api("/tasks/" + taskId);
  renderTaskTagsEditor(taskId, t.tagAssignments || []);
}

function renderTaskAttachments(taskId, attachments) {
  const list = document.getElementById("task-attach-list");
  list.innerHTML = attachments.map((a) =>
    `<a href="/tasks/attachments/${a.id}" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;font-size:11px;text-decoration:none;color:var(--text);background:var(--bg-alt)">📎 ${escapeHtml(a.filename)} <span style="color:var(--text-muted)">${fmtSize(a.size)}</span> <button type="button" onclick="event.preventDefault();event.stopPropagation();deleteTaskAttach('${taskId}','${a.id}')" style="background:none;border:none;cursor:pointer;color:var(--danger);padding:0">✕</button></a>`
  ).join("");
  // wire upload
  const input = document.getElementById("task-attach-file");
  input.onchange = async () => {
    const files = input.files;
    if (!files || !files.length) return;
    for (const f of files) {
      await uploadFile(`/tasks/${taskId}/attachments`, f, () => {});
    }
    input.value = "";
    const t = await api("/tasks/" + taskId);
    renderTaskAttachments(taskId, t.attachments || []);
  };
}
async function deleteTaskAttach(taskId, aid) {
  if (!confirm("Удалить файл?")) return;
  await api(`/tasks/${taskId}/attachments/${aid}`, { method: "DELETE" });
  const t = await api("/tasks/" + taskId);
  renderTaskAttachments(taskId, t.attachments || []);
}

function renderTaskComments(comments) {
  const list = document.getElementById("task-comments-list");
  if (!comments.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:11px">нет комментариев</div>';
    return;
  }
  list.innerHTML = comments.map((c) => `
    <div style="background:var(--bg-alt);padding:6px 10px;border-radius:6px">
      <div style="font-size:10px;color:var(--text-muted)">${new Date(c.createdAt).toLocaleString("ru")}</div>
      <div style="font-size:12px;white-space:pre-wrap;word-wrap:break-word">${escapeHtml(c.text)}</div>
    </div>
  `).join("");
}

async function toggleTaskDone(id, done) {
  await api("/tasks/" + id, { method: "PATCH", body: JSON.stringify({ status: done ? "done" : "open" }) });
  loadTasks();
}

async function openTaskForm(id) {
  const f = document.getElementById("task-form");
  f.reset();
  if (!_projects.length) {
    [_users, _projects] = await Promise.all([
      api("/admin/users").catch(() => []),
      api("/projects").catch(() => []),
    ]);
  }
  f.assigneeId.innerHTML = '<option value="">—</option>' + _users.map((u) => `<option value="${u.id}">${escapeHtml(u.email)}</option>`).join("");
  f.projectId.innerHTML = '<option value="">—</option>' + _projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (id) {
    const t = await api("/tasks/" + id);
    document.getElementById("task-form-title").textContent = "Задача";
    f.id.value = t.id;
    f.title.value = t.title;
    f.description.value = t.description || "";
    f.assigneeId.value = t.assigneeId || "";
    f.projectId.value = t.projectId || "";
    f.dueDate.value = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 16) : "";
    f.priority.value = t.priority;
    f.category.value = t.category || "";
    f.status.value = t.status;
    document.getElementById("task-delete-btn").style.display = "inline-block";
    document.getElementById("task-delete-btn").onclick = () => deleteTask(t.id);
    document.getElementById("task-comments-row").style.display = "flex";
    renderTaskComments(t.comments || []);
    document.getElementById("task-tags-row").style.display = "flex";
    renderTaskTagsEditor(t.id, t.tagAssignments || []);
    document.getElementById("task-attach-row").style.display = "flex";
    renderTaskAttachments(t.id, t.attachments || []);
  } else {
    document.getElementById("task-form-title").textContent = "Новая задача";
    f.id.value = "";
    f.status.value = "open";
    document.getElementById("task-delete-btn").style.display = "none";
    document.getElementById("task-comments-row").style.display = "none";
    document.getElementById("task-tags-row").style.display = "none";
    document.getElementById("task-attach-row").style.display = "none";
  }
  document.getElementById("task-form-modal").classList.remove("hidden");
}

async function saveTask(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {};
  for (const [k, v] of fd) if (v !== "") body[k] = v;
  const id = body.id;
  delete body.id;
  if (body.dueDate) body.dueDate = new Date(body.dueDate).toISOString();
  if (id) await api("/tasks/" + id, { method: "PATCH", body: JSON.stringify(body) });
  else await api("/tasks", { method: "POST", body: JSON.stringify(body) });
  closeModal("task-form-modal");
  if (!document.getElementById("tasks-view").classList.contains("hidden")) loadTasks();
}

async function deleteTask(id) {
  if (!confirm("Удалить задачу?")) return;
  await api("/tasks/" + id, { method: "DELETE" });
  closeModal("task-form-modal");
  loadTasks();
}

async function emailToTask(messageId) {
  const m = state.messages.find((x) => x.id === messageId) || (await api("/messages/" + messageId));
  await openTaskForm();
  const f = document.getElementById("task-form");
  f.title.value = m.subject || "(без темы)";
  f.description.value = `Из письма от ${m.fromAddr}:\n\n${(m.bodyText || "").slice(0, 1000)}`;
}

/* settings */
function openSettings() {
  document.getElementById("settings-modal").classList.remove("hidden");
}
function closeSettings() {
  document.getElementById("settings-modal").classList.add("hidden");
  document.getElementById("settings-msg").textContent = "";
}
document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = document.getElementById("settings-msg");
  try {
    await api("/me/password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: f.get("oldPassword"), newPassword: f.get("newPassword") }),
    });
    msg.style.color = "var(--accent)";
    msg.textContent = "пароль обновлён";
    setTimeout(closeSettings, 1500);
  } catch (err) {
    msg.style.color = "var(--danger)";
    msg.textContent = "ошибка: " + err.message;
  }
});

/* drag-drop on compose */
const composeBox = () => document.getElementById("compose-modal");
document.addEventListener("dragover", (e) => {
  if (composeBox().classList.contains("hidden")) return;
  e.preventDefault();
});
document.addEventListener("drop", (e) => {
  if (composeBox().classList.contains("hidden")) return;
  e.preventDefault();
  const dt = new DataTransfer();
  const cur = document.getElementById("compose-files").files;
  for (const f of cur) dt.items.add(f);
  for (const f of e.dataTransfer.files) dt.items.add(f);
  document.getElementById("compose-files").files = dt.files;
});

/* mobile swipes */
function addSwipe(el, m) {
  let startX = 0, currentX = 0, swiping = false;
  el.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    swiping = true;
  }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    if (!swiping) return;
    currentX = e.touches[0].clientX - startX;
    el.style.transform = `translateX(${currentX}px)`;
    el.style.background = currentX > 40 ? "#fde68a" : currentX < -40 ? "#fecaca" : "";
  }, { passive: true });
  el.addEventListener("touchend", async () => {
    if (!swiping) return;
    swiping = false;
    el.style.transition = "transform 0.2s";
    el.style.transform = "";
    el.style.background = "";
    setTimeout(() => (el.style.transition = ""), 200);
    if (currentX > 80) {
      await toggleStar(m.id, m.isStarred);
    } else if (currentX < -80) {
      await deleteMsg(m.id);
    }
    currentX = 0;
  });
}

/* admin */
let adminTab = "users";
function openAdmin() {
  document.getElementById("admin-modal").classList.remove("hidden");
  switchTab("users");
}
function closeAdmin() {
  document.getElementById("admin-modal").classList.add("hidden");
}
function switchTab(tab) {
  adminTab = tab;
  document.querySelectorAll(".admin-tabs .tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  renderAdminTab();
}

async function renderAdminTab() {
  const c = document.getElementById("admin-content");
  c.innerHTML = "<div style='color:var(--text-muted)'>загрузка...</div>";
  try {
    if (adminTab === "users") c.innerHTML = await renderUsersTab();
    else if (adminTab === "mailboxes") c.innerHTML = await renderMailboxesTab();
    else if (adminTab === "rules") c.innerHTML = await renderRulesTab();
    else if (adminTab === "contacts") c.innerHTML = await renderContactsTab();
    else if (adminTab === "audit") c.innerHTML = await renderAuditTab();
    else if (adminTab === "analytics") c.innerHTML = await renderAnalyticsTab();
    else if (adminTab === "tgchats") c.innerHTML = await renderTgChatsTab();
    else if (adminTab === "tgbindings") c.innerHTML = await renderTgBindingsTab();
    else if (adminTab === "tasksettings") c.innerHTML = await renderTaskSettingsTab();
    else if (adminTab === "personas") c.innerHTML = await renderPersonasTab();
  } catch (e) {
    c.innerHTML = '<div class="error">ошибка: ' + escapeHtml(e.message) + "</div>";
  }
}

async function renderUsersTab() {
  const users = await api("/admin/users");
  const rows = users.map((u) => `<tr>
    <td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.name)}</td>
    <td>${escapeHtml(u.role)}</td>
    <td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ru") : "—"}</td>
    <td style="font-size:11px;color:var(--text-muted);max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.signature ? escapeHtml(u.signature.split("\n")[0]) : "<i>нет</i>"}</td>
    <td>
      <button onclick="editUser('${u.id}','${escapeHtml(u.name)}','${u.role}')">✏️</button>
      <button onclick="editUserSignature('${u.id}')">подпись</button>
      <button onclick="manageUserAccess('${u.id}','${escapeHtml(u.email)}','${u.role}')">доступ</button>
      <button class="danger" onclick="adminDeleteUser('${u.id}')">удалить</button>
    </td>
  </tr>`).join("");
  return `
    <form class="admin-form" onsubmit="adminCreateUser(event)">
      <input name="email" type="email" placeholder="email" required>
      <input name="password" type="password" placeholder="пароль" required>
      <input name="name" placeholder="имя" required>
      <select name="role"><option value="manager">manager</option><option value="admin">admin</option><option value="owner">owner</option></select>
      <button type="submit">+ Добавить</button>
    </form>
    <table class="admin-table"><thead><tr><th>Email</th><th>Имя</th><th>Роль</th><th>Последний вход</th><th>Подпись</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  `;
}

async function editUserSignature(userId) {
  const users = await api("/admin/users");
  const u = users.find((x) => x.id === userId);
  const sig = prompt(`Подпись для ${u.name} (используется при выборе «От имени» в письме). Многострочное — ставьте \\n не нужно, перенос обычный.`, u.signature || "");
  if (sig === null) return;
  await api("/admin/users/" + userId, { method: "PATCH", body: JSON.stringify({ signature: sig || null }) });
  renderAdminTab();
}

async function adminCreateUser(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/admin/users", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
  renderAdminTab();
}
async function editUser(id, currentName, currentRole) {
  const name = prompt("Имя:", currentName);
  if (name === null) return;
  const role = prompt("Роль (owner/admin/manager):", currentRole);
  if (!["owner", "admin", "manager"].includes(role)) return alert("неверная роль");
  await api("/admin/users/" + id, { method: "PATCH", body: JSON.stringify({ name, role }) });
  renderAdminTab();
}

async function manageUserAccess(userId, email, role) {
  if (role === "owner" || role === "admin") {
    return alert(`${role} имеет доступ ко всем ящикам автоматически.`);
  }
  const [allMailboxes, assigned] = await Promise.all([
    api("/admin/mailboxes"),
    api("/admin/users/" + userId + "/mailboxes"),
  ]);
  const assignedSet = new Set(assigned);
  const list = allMailboxes
    .map((mb) => `<label style="display:block;padding:4px 0"><input type="checkbox" data-mb="${mb.id}" ${assignedSet.has(mb.id) ? "checked" : ""}> ${escapeHtml(mb.displayName)} (${escapeHtml(mb.email)})</label>`)
    .join("");
  const c = document.getElementById("admin-content");
  const html = `
    <h4 style="margin-top:0">Доступ к ящикам: ${escapeHtml(email)}</h4>
    <div id="access-list">${list}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="saveAccess('${userId}')" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:5px;cursor:pointer">Сохранить</button>
      <button onclick="renderAdminTab()">← Назад</button>
    </div>
  `;
  c.innerHTML = html;
}

async function saveAccess(userId) {
  const ids = [...document.querySelectorAll('#access-list input[type=checkbox]:checked')].map((c) => c.dataset.mb);
  await api("/admin/users/" + userId + "/mailboxes", { method: "PUT", body: JSON.stringify({ mailboxIds: ids }) });
  renderAdminTab();
}

async function adminDeleteUser(id) {
  if (!confirm("Удалить пользователя?")) return;
  await api("/admin/users/" + id, { method: "DELETE" });
  renderAdminTab();
}

async function renderMailboxesTab() {
  const list = await api("/admin/mailboxes");
  const rows = list.map((m) => `<tr>
    <td>${escapeHtml(m.email)}</td><td>${escapeHtml(m.displayName)}</td>
    <td>
      <label><input type="checkbox" ${m.enabled ? "checked" : ""} onchange="adminToggleMailbox('${m.id}', this.checked)"> вкл</label>
    </td>
    <td>
      <button onclick="renameMailbox('${m.id}', ${JSON.stringify(m.displayName).replace(/"/g,'&quot;')})">✏️ имя</button>
      <button onclick="editSignature('${m.id}', ${JSON.stringify(m.signature || "").replace(/"/g,'&quot;')})">✏️ подпись</button>
      <button class="danger" onclick="adminDeleteMailbox('${m.id}')">удалить</button>
    </td>
  </tr>`).join("");
  return `
    <form class="admin-form" onsubmit="adminCreateMailbox(event)">
      <input name="email" type="email" placeholder="user@mail.ru" required>
      <input name="displayName" placeholder="название" required>
      <input name="appPassword" type="password" placeholder="пароль приложения" required>
      <button type="submit">+ Добавить</button>
    </form>
    <table class="admin-table"><thead><tr><th>Email</th><th>Название</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  `;
}
async function renameMailbox(id, current) {
  const name = prompt("Название ящика (отображается в списке слева):", current || "");
  if (name === null || !name.trim()) return;
  await api("/admin/mailboxes/" + id, { method: "PATCH", body: JSON.stringify({ displayName: name.trim() }) });
  renderAdminTab();
  loadFolders();
}

async function editSignature(id, current) {
  const sig = prompt("Подпись (добавляется ко всем исходящим письмам с этого ящика):", current || "");
  if (sig === null) return;
  await api("/admin/mailboxes/" + id, { method: "PATCH", body: JSON.stringify({ signature: sig }) });
  renderAdminTab();
}

async function adminCreateMailbox(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/admin/mailboxes", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
  renderAdminTab();
}
async function adminToggleMailbox(id, enabled) {
  await api("/admin/mailboxes/" + id, { method: "PATCH", body: JSON.stringify({ enabled }) });
}
async function adminDeleteMailbox(id) {
  if (!confirm("Удалить ящик? (только если пустой)")) return;
  try { await api("/admin/mailboxes/" + id, { method: "DELETE" }); renderAdminTab(); }
  catch (e) { alert(e.message); }
}

async function renderRulesTab() {
  const [rules, folders] = await Promise.all([api("/admin/rules"), api("/folders")]);
  const folderMap = Object.fromEntries(folders.map((f) => [f.id, f.name]));
  const folderOpts = folders.filter((f) => f.kind === "custom" || f.kind === "trash").map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  const rows = rules.map((r) => `<tr>
    <td>${escapeHtml(r.triggerType)}</td>
    <td>${escapeHtml(r.contains)}</td>
    <td>${escapeHtml(folderMap[r.folderId] || r.folderId)}</td>
    <td><label><input type="checkbox" ${r.enabled ? "checked" : ""} onchange="adminToggleRule('${r.id}', this.checked)"> вкл</label></td>
    <td><button class="danger" onclick="adminDeleteRule('${r.id}')">удалить</button></td>
  </tr>`).join("");
  return `
    <p style="color:var(--text-muted);font-size:12px;margin-top:0">Если в письме поле <b>type</b> содержит <b>значение</b>, то переместить в указанную папку.</p>
    <form class="admin-form" onsubmit="adminCreateRule(event)">
      <select name="triggerType"><option value="from">from</option><option value="to">to</option><option value="subject">subject</option></select>
      <input name="contains" placeholder="значение" required>
      <select name="folderId" required>${folderOpts}</select>
      <button type="submit">+ Добавить</button>
    </form>
    <table class="admin-table"><thead><tr><th>Тип</th><th>Содержит</th><th>→ Папка</th><th>Статус</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  `;
}
async function adminCreateRule(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/admin/rules", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
  renderAdminTab();
}
async function adminToggleRule(id, enabled) {
  await api("/admin/rules/" + id, { method: "PATCH", body: JSON.stringify({ enabled }) });
}
async function adminDeleteRule(id) {
  if (!confirm("Удалить правило?")) return;
  await api("/admin/rules/" + id, { method: "DELETE" });
  renderAdminTab();
}

async function renderContactsTab() {
  const list = await api("/admin/contacts?limit=200");
  const rows = list.map((c) => `<tr>
    <td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.name || "")}</td>
    <td>${c.useCount}</td>
    <td>${c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString("ru") : "—"}</td>
    <td><button class="danger" onclick="adminDeleteContact('${c.id}')">удалить</button></td>
  </tr>`).join("");
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap">
      <span style="color:var(--text-muted);font-size:12px">Топ-200 контактов по частоте использования</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button onclick="scanContactsHistory()" style="padding:6px 12px;background:var(--bg-alt);color:var(--text);border:1px solid var(--border);border-radius:5px;cursor:pointer">🔄 Перебрать всю историю</button>
        <a href="/admin/contacts/export.csv" download class="link-btn" style="padding:6px 12px;background:var(--accent);color:white;border-radius:5px;text-decoration:none">⬇ Выгрузить (CSV)</a>
      </div>
    </div>
    <table class="admin-table"><thead><tr><th>Email</th><th>Имя</th><th>Использований</th><th>Последнее</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  `;
}
async function scanContactsHistory() {
  if (!confirm("Перебрать всю историю всех ящиков? Может занять несколько минут.")) return;
  const btn = event.target;
  const original = btn.textContent;
  btn.textContent = "⏳ сканирую...";
  btn.disabled = true;
  try {
    const r = await api("/admin/contacts/scan-history", { method: "POST" });
    alert(`Готово. Обработано ${r.scanned} писем, ${r.contacts} уникальных контактов.`);
    renderAdminTab();
  } catch (e) {
    alert("Ошибка: " + e.message);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function adminDeleteContact(id) {
  if (!confirm("Удалить контакт?")) return;
  await api("/admin/contacts/" + id, { method: "DELETE" });
  renderAdminTab();
}

async function renderAnalyticsTab() {
  const [list, leaderboard, heatmap] = await Promise.all([
    api("/admin/analytics"),
    api("/admin/analytics/leaderboard"),
    api("/admin/analytics/heatmap"),
  ]);
  window._analytics = list;

  // build heatmap grid 7×24
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxV = 0;
  for (const cell of heatmap) {
    grid[cell.dow][cell.hr] = Number(cell.c);
    if (Number(cell.c) > maxV) maxV = Number(cell.c);
  }
  const dows = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const hmHtml = `
    <h4>Heatmap отправки за 30 дней</h4>
    <table style="border-collapse:collapse;font-size:10px"><tr><th></th>${Array.from({length:24},(_,h)=>`<th style="padding:2px 4px;text-align:center;color:var(--text-muted)">${h}</th>`).join("")}</tr>
    ${dows.map((d,i)=>`<tr><td style="padding:2px 6px;color:var(--text-muted)">${d}</td>${grid[i].map(v=>{
      const a = maxV ? v/maxV : 0;
      return `<td style="width:18px;height:18px;background:rgba(37,99,235,${a});border:1px solid var(--border)" title="${v}"></td>`;
    }).join("")}</tr>`).join("")}
    </table>
  `;

  const lbHtml = `
    <h4>🏆 Лидерборд за 7 дней</h4>
    <ol style="font-size:13px">${leaderboard.filter((l) => Number(l.sent) > 0).map((l) => `<li>${escapeHtml(l.email)} — <b>${Number(l.sent)}</b> писем</li>`).join("") || "<li>нет данных</li>"}</ol>
  `;

  const rows = list.map((u) => {
    const inactive = u.inactiveDays !== null && u.inactiveDays > 7 ? `<span title="неактивен ${u.inactiveDays} дн" style="color:var(--danger)">⚠</span> ` : "";
    return `<tr>
      <td>${inactive}${escapeHtml(u.email)}<br><span style="color:var(--text-muted);font-size:11px">${escapeHtml(u.name)} · ${escapeHtml(u.role)}</span></td>
      <td style="text-align:center">${u.sessionCount}</td>
      <td style="text-align:center">${u.totalSessionHours}ч</td>
      <td style="text-align:center"><b>${u.sent}</b></td>
      <td style="text-align:center">${u.deleted}</td>
      <td style="text-align:center">${u.avgResponseHours !== null ? u.avgResponseHours + "ч" : "—"}</td>
      <td style="text-align:center">${u.aiSummarize}/${u.aiReply}</td>
      <td style="text-align:center">${u.aiUsageRatio}%</td>
      <td style="font-size:11px">${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("ru") : "—"}</td>
    </tr>`;
  }).join("");

  return `
    <div style="display:flex;gap:24px;margin-bottom:18px">
      <div style="flex:1">${lbHtml}</div>
      <div style="flex:2;overflow-x:auto">${hmHtml}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <p style="color:var(--text-muted);font-size:12px;margin:0">⚠ — неактивен >7 дней</p>
      <button onclick="exportAnalyticsCSV()" style="padding:6px 12px;border:1px solid var(--border);border-radius:5px;background:var(--bg-alt);color:var(--text);cursor:pointer">📊 экспорт CSV</button>
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>Пользователь</th>
        <th title="Сессии">Сесс.</th>
        <th title="Суммарное время">Время</th>
        <th title="Отправлено">Отпр.</th>
        <th title="Удалено">Удал.</th>
        <th title="Среднее время ответа на входящее">Ответ</th>
        <th title="AI саммари / AI ответы">AI</th>
        <th title="% использования AI ответов">AI%</th>
        <th>Посл. вход</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function exportAnalyticsCSV() {
  const list = window._analytics || [];
  const headers = ["email", "name", "role", "sessions", "hours", "sent", "deleted", "avgResponseHours", "aiSummarize", "aiReply", "aiUsageRatio", "lastLogin", "inactiveDays"];
  const rows = list.map((u) => [
    u.email, u.name, u.role, u.sessionCount, u.totalSessionHours,
    u.sent, u.deleted, u.avgResponseHours ?? "", u.aiSummarize, u.aiReply,
    u.aiUsageRatio, u.lastLoginAt || "", u.inactiveDays ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `analytics-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderAuditTab() {
  const list = await api("/admin/audit?limit=200");
  const rows = list.map((a) => `<tr>
    <td>${new Date(a.createdAt).toLocaleString("ru")}</td>
    <td>${escapeHtml(a.userId || "—")}</td>
    <td>${escapeHtml(a.action)}</td>
    <td><code style="font-size:11px">${escapeHtml(JSON.stringify(a.details || {}))}</code></td>
    <td>${escapeHtml(a.ip || "")}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Время</th><th>User</th><th>Действие</th><th>Детали</th><th>IP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function renderTgChatsTab() {
  const list = await api("/admin/tg-chats");
  const rows = list.map((c) => `<tr>
    <td><code>${escapeHtml(c.chatId)}</code></td>
    <td>${escapeHtml(c.name)}</td>
    <td>${new Date(c.addedAt).toLocaleString("ru")}</td>
    <td><button class="danger" onclick="adminDeleteTgChat('${escapeHtml(c.chatId)}')">удалить</button></td>
  </tr>`).join("");
  return `
    <p style="color:var(--text-muted);font-size:12px">Чаты Telegram, в которых task-бот (@task_crm_bot) принимает сообщения с #task / #задача. Для группы chat_id отрицательный (вида -100…). Узнать chat_id можно через @userinfobot или forward сообщения из группы в @userinfobot.</p>
    <form class="admin-form" onsubmit="adminCreateTgChat(event)">
      <input name="chatId" placeholder="chat_id (например -1003861923660)" required>
      <input name="name" placeholder="название" required>
      <button type="submit">+ Добавить</button>
    </form>
    <table class="admin-table"><thead><tr><th>chat_id</th><th>Название</th><th>Добавлено</th><th></th></tr></thead><tbody>${rows || "<tr><td colspan=4 style='color:var(--text-muted)'>пусто</td></tr>"}</tbody></table>
  `;
}
async function adminCreateTgChat(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/admin/tg-chats", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
  renderAdminTab();
}
async function adminDeleteTgChat(chatId) {
  if (!confirm("Удалить чат " + chatId + "?")) return;
  await api("/admin/tg-chats/" + encodeURIComponent(chatId), { method: "DELETE" });
  renderAdminTab();
}

async function renderTgBindingsTab() {
  const [list, users] = await Promise.all([api("/admin/tg-bindings"), api("/admin/users")]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const rows = list.map((b) => {
    const u = userMap[b.userId];
    return `<tr>
      <td>${u ? escapeHtml(u.email) + " <span style='color:var(--text-muted);font-size:11px'>(" + escapeHtml(u.name) + ")</span>" : "<i>удалён</i>"}</td>
      <td><code>${escapeHtml(b.tgUserId)}</code></td>
      <td>${b.tgUsername ? "@" + escapeHtml(b.tgUsername) : "—"}</td>
      <td><button class="danger" onclick="adminDeleteTgBinding('${b.userId}')">удалить</button></td>
    </tr>`;
  }).join("");
  const userOptions = users.map((u) => `<option value="${u.id}">${escapeHtml(u.email)}</option>`).join("");
  return `
    <p style="color:var(--text-muted);font-size:12px">Привязка пользователя CRM к Telegram-аккаунту. Нужна и для исполнителей (task-бот ищет по @username), и для авторов (бот определяет, кто создал задачу). Telegram user_id и username сотрудник может узнать через @userinfobot.</p>
    <form class="admin-form" onsubmit="adminCreateTgBinding(event)">
      <select name="userId" required><option value="">— пользователь CRM —</option>${userOptions}</select>
      <input name="tgUserId" placeholder="tg user_id (число)" required>
      <input name="tgUsername" placeholder="@username (без @, опционально)">
      <button type="submit">+ Привязать</button>
    </form>
    <table class="admin-table"><thead><tr><th>Пользователь CRM</th><th>tg user_id</th><th>@username</th><th></th></tr></thead><tbody>${rows || "<tr><td colspan=4 style='color:var(--text-muted)'>пусто</td></tr>"}</tbody></table>
  `;
}
async function adminCreateTgBinding(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const data = Object.fromEntries(f);
  if (!data.tgUsername) delete data.tgUsername;
  await api("/admin/tg-bindings", { method: "POST", body: JSON.stringify(data) });
  renderAdminTab();
}
async function adminDeleteTgBinding(userId) {
  if (!confirm("Удалить привязку?")) return;
  await api("/admin/tg-bindings/" + encodeURIComponent(userId), { method: "DELETE" });
  renderAdminTab();
}

async function renderTaskSettingsTab() {
  const [s, users] = await Promise.all([api("/admin/task-settings"), api("/admin/users")]);
  const userOptions = (selected) => users.map((u) =>
    `<option value="${u.id}"${selected === u.id ? " selected" : ""}>${escapeHtml(u.email)} (${escapeHtml(u.name)})</option>`
  ).join("");
  return `
    <p style="color:var(--text-muted);font-size:12px">Хранится в TaskSetting (key/value). Изменения применяются сразу — воркеры читают свежие значения каждый раз.</p>
    <form class="admin-form" style="display:flex;flex-direction:column;gap:14px;max-width:600px" onsubmit="saveTaskSettings(event)">

      <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px">
        <legend>⏰ Утренний дайджест</legend>
        <label style="display:block;margin-bottom:6px">
          Час МСК (0-23):
          <input name="digest_hour_msk" type="number" min="0" max="23" value="${escapeHtml(s.digest_hour_msk || "9")}" style="width:80px;margin-left:8px">
        </label>
        <p style="font-size:11px;color:var(--text-muted);margin:0">Каждое утро в указанный час task-бот шлёт каждому юзеру с TG-привязкой список открытых задач.</p>
      </fieldset>

      <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px">
        <legend>📧 AI: задачи из писем</legend>
        <label style="display:block;margin-bottom:6px">
          <input name="ai_email_detect_enabled" type="checkbox" ${s.ai_email_detect_enabled === "true" ? "checked" : ""}>
          Включить — AI смотрит каждое incoming, и если похоже на задачу — присылает в TG предложение «Создать?»
        </label>
        <label style="display:block;margin-bottom:6px">
          Кому слать предложения:
          <select name="email_ai_notify_user_id" style="margin-left:8px">
            <option value="">— никто —</option>
            ${userOptions(s.email_ai_notify_user_id)}
          </select>
        </label>
        <p style="font-size:11px;color:var(--text-muted);margin:0">Используется Claude Haiku. Только с уверенностью ≥60%. Кнопки в TG: создать / игнор.</p>
        <label style="display:block;margin-top:10px">
          <input name="ai_autoclose_enabled" type="checkbox" ${s.ai_autoclose_enabled === "true" ? "checked" : ""}>
          Также проверять автозакрытие — если новое письмо от того же контрагента похоже на «работа сделана», AI спросит «Закрыть задачу N?»
        </label>
      </fieldset>

      <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px">
        <legend>🏗 Авто-задачи из metr (выкуп объектов)</legend>
        <label style="display:block;margin-bottom:6px">
          <input name="metr_deadline_enabled" type="checkbox" ${s.metr_deadline_enabled === "true" ? "checked" : ""}>
          Включить — каждый день в 8:00 МСК создавать задачи на ближайшие выкупы
        </label>
        <label style="display:block;margin-bottom:6px">
          За сколько дней до даты выкупа создавать:
          <input name="metr_deadline_lead_days" type="number" min="1" max="30" value="${escapeHtml(s.metr_deadline_lead_days || "3")}" style="width:80px;margin-left:8px">
        </label>
        <label style="display:block;margin-bottom:6px">
          Назначать на:
          <select name="metr_default_assignee_user_id" style="margin-left:8px">
            <option value="">— не назначать —</option>
            ${userOptions(s.metr_default_assignee_user_id)}
          </select>
        </label>
        <p style="font-size:11px;color:var(--text-muted);margin:0">Источник: <code>metr.Object.buyback_date</code>. Дубли не создаёт (помечает sourceEmailMessageId маркером).</p>
      </fieldset>

      <button type="submit" style="padding:10px 18px;background:var(--accent);color:white;border:none;border-radius:5px;cursor:pointer;align-self:flex-start">Сохранить</button>
    </form>
  `;
}

async function renderPersonasTab() {
  const list = await api("/personas");
  const rows = list.map((p) => `<tr>
    <td style="vertical-align:top;padding:8px"><b>${escapeHtml(p.name)}</b></td>
    <td style="vertical-align:top;padding:8px;font-size:12px;white-space:pre-wrap;color:var(--text-muted);max-width:480px">${escapeHtml(p.signature)}</td>
    <td style="vertical-align:top;padding:8px;white-space:nowrap">
      <button onclick="editPersona('${p.id}')">✏️</button>
      <button class="danger" onclick="deletePersona('${p.id}')">удалить</button>
    </td>
  </tr>`).join("");
  return `
    <p style="color:var(--text-muted);font-size:12px;margin:0 0 12px">Сотрудники-визитки. Когда автор пишет письмо, в селекте «От имени сотрудника» он выбирает кого-то из этого списка — и в конце письма автоматом подставляется его подпись (вместо подписи ящика). Это не пользователь CRM с логином, а просто справочник «персоны для подписи».</p>
    <form onsubmit="adminCreatePersona(event)" style="display:block;margin-bottom:18px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="font-size:11px;color:var(--text-muted)">Имя сотрудника
          <input name="name" placeholder="например «Ольга Иванова»" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-size:14px;box-sizing:border-box">
        </label>
        <label style="font-size:11px;color:var(--text-muted)">Текст визитки (многострочный)
          <textarea name="signature" rows="6" placeholder="С уважением,&#10;Ольга Иванова&#10;менеджер по аренде&#10;+7 (xxx) xxx-xx-xx&#10;olya@example.com" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-family:inherit;font-size:13px;box-sizing:border-box;resize:vertical"></textarea>
        </label>
        <button type="submit" style="align-self:flex-start;padding:9px 18px;background:var(--accent);color:white;border:none;border-radius:5px;cursor:pointer;font-weight:600">+ Добавить сотрудника</button>
      </div>
    </form>
    <table class="admin-table" style="width:100%"><thead><tr><th style="text-align:left;padding:8px">Имя</th><th style="text-align:left;padding:8px">Визитка</th><th></th></tr></thead><tbody>${rows || "<tr><td colspan=3 style='color:var(--text-muted);padding:14px'>пусто</td></tr>"}</tbody></table>
  `;
}
async function adminCreatePersona(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/admin/personas", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
  renderAdminTab();
}
async function editPersona(id) {
  const list = await api("/personas");
  const p = list.find((x) => x.id === id);
  if (!p) return;
  const name = prompt("Имя сотрудника:", p.name);
  if (name === null) return;
  const signature = prompt("Визитка (текст подписи):", p.signature);
  if (signature === null) return;
  await api("/admin/personas/" + id, { method: "PATCH", body: JSON.stringify({ name, signature }) });
  renderAdminTab();
}
async function deletePersona(id) {
  if (!confirm("Удалить сотрудника?")) return;
  await api("/admin/personas/" + id, { method: "DELETE" });
  renderAdminTab();
}

async function saveTaskSettings(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const payload = {
    digest_hour_msk: String(f.get("digest_hour_msk") || "9"),
    ai_email_detect_enabled: e.target.ai_email_detect_enabled.checked ? "true" : "false",
    ai_autoclose_enabled: e.target.ai_autoclose_enabled.checked ? "true" : "false",
    email_ai_notify_user_id: String(f.get("email_ai_notify_user_id") || ""),
    metr_deadline_enabled: e.target.metr_deadline_enabled.checked ? "true" : "false",
    metr_deadline_lead_days: String(f.get("metr_deadline_lead_days") || "3"),
    metr_default_assignee_user_id: String(f.get("metr_default_assignee_user_id") || ""),
  };
  await api("/admin/task-settings", { method: "PUT", body: JSON.stringify(payload) });
  alert("Сохранено");
}

/* offline indicator */
window.addEventListener("offline", () => {
  let n = document.getElementById("offline-banner");
  if (!n) {
    n = document.createElement("div");
    n.id = "offline-banner";
    n.textContent = "⚠ Нет соединения";
    n.style.cssText = "position:fixed;top:0;left:0;right:0;background:var(--danger);color:white;text-align:center;padding:6px;z-index:1000;font-size:13px";
    document.body.appendChild(n);
  }
});
window.addEventListener("online", () => {
  document.getElementById("offline-banner")?.remove();
  refreshList().catch(() => {});
});

/* column resizers — drag the dividers between sidebar/list/preview */
(function setupResizers() {
  const app = document.getElementById("app");
  if (!app) return;
  const saved = JSON.parse(localStorage.getItem("crm-cols") || "null");
  let sidebarW = saved?.sidebar ?? 240;
  let listW = saved?.list ?? 380;
  function apply() {
    if (window.innerWidth <= 900) return;
    app.style.gridTemplateColumns = `${sidebarW}px 4px ${listW}px 4px 1fr`;
  }
  apply();
  window.addEventListener("resize", apply);
  function startDrag(which) {
    return (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startSidebar = sidebarW;
      const startList = listW;
      const handle = e.target;
      handle.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      function onMove(ev) {
        const dx = ev.clientX - startX;
        if (which === 1) sidebarW = Math.max(160, Math.min(500, startSidebar + dx));
        else listW = Math.max(240, Math.min(900, startList + dx));
        apply();
      }
      function onUp() {
        handle.classList.remove("dragging");
        document.body.style.cursor = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        localStorage.setItem("crm-cols", JSON.stringify({ sidebar: sidebarW, list: listW }));
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }
  document.getElementById("resizer-1")?.addEventListener("mousedown", startDrag(1));
  document.getElementById("resizer-2")?.addEventListener("mousedown", startDrag(2));
})();

/* sound */
let lastUnreadCount = -1;
function playDing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.05;
    o.start(); o.stop(ctx.currentTime + 0.15);
  } catch {}
}

/* live polling */
let lastInboxView = null;
setInterval(async () => {
  if (!state.user || document.hidden) return;
  const inboxView = state.currentFolder === "__inbox" || state.currentFolder === null;
  await refreshList().catch(() => {});
  if (!inboxView) { lastUnreadCount = -1; lastInboxView = false; return; }
  const afterUnread = state.messages.filter((m) => !m.isRead).length;
  // Only ding when staying on inbox view across two consecutive ticks
  if (lastInboxView && lastUnreadCount >= 0 && afterUnread > lastUnreadCount) {
    playDing();
    if (Notification.permission === "granted") {
      new Notification("Новое письмо в crm.eg.je", { body: `Непрочитано: ${afterUnread}` });
    }
  }
  lastUnreadCount = afterUnread;
  lastInboxView = true;
}, 30000);

if ("Notification" in window && Notification.permission === "default") {
  setTimeout(() => Notification.requestPermission().catch(() => {}), 5000);
}

/* PWA */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* password reset flow */
function checkResetParam() {
  const params = new URLSearchParams(location.search);
  const token = params.get("reset");
  if (!token) return;
  const np = prompt("Введите новый пароль (минимум 4 символа):");
  if (!np || np.length < 4) return;
  fetch("/auth/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, newPassword: np }),
  }).then((r) => r.json()).then((j) => {
    if (j.ok) {
      alert("Пароль сброшен. Можно войти.");
      history.replaceState({}, "", "/");
    } else {
      alert("Ошибка: " + (j.error || "?"));
    }
  });
}

/* init */
initTheme();
checkResetParam();
bootApp().catch(() => showLogin());
