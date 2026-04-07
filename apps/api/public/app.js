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
  if (state.user.role === "owner" || state.user.role === "admin") {
    document.getElementById("admin-btn").classList.remove("hidden");
  }
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
      d.onclick = () => { state.currentFolder = "smart:" + sf.id; refreshList(); };
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
  state.messages = messages;
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
  bar.innerHTML = `
    <span>${state.selectedIds.size} выбрано</span>
    <button onclick="bulkAction('read')">прочитано</button>
    <button onclick="bulkAction('star')">⭐</button>
    <button onclick="bulkAction('delete')">🗑</button>
    <button onclick="state.selectedIds.clear();renderList();renderBulkBar()">×</button>
  `;
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
    const date = m.receivedAt ? new Date(m.receivedAt).toLocaleDateString("ru", { day: "2-digit", month: "short" }) : "";
    const snippet = (m.bodyText || "").replace(/\s+/g, " ").slice(0, 120);
    const d = document.createElement("div");
    d.className = "msg-item" + (!m.isRead ? " unread" : "") + (state.selectedId === m.id ? " selected" : "");
    const star = m.isStarred ? "⭐" : "";
    const checked = state.selectedIds.has(m.id) ? "checked" : "";
    const prio = m.aiPriority || "";
    const prioBadge = prio === "high" ? '<span class="prio prio-high">!</span>' : prio === "spam" ? '<span class="prio prio-spam">×</span>' : "";
    d.innerHTML = `
      <input type="checkbox" class="msg-check" ${checked} onclick="event.stopPropagation();toggleSelect('${m.id}')">
      <div class="msg-avatar">${escapeHtml(initial)}</div>
      <div class="msg-body">
        <div class="msg-head"><div class="msg-from">${prioBadge}${escapeHtml(m.fromAddr || "")}</div><div class="msg-date">${date}</div></div>
        <div class="msg-subject">${star} ${escapeHtml(m.subject || "(без темы)")}</div>
        <div class="msg-snippet">${escapeHtml(snippet)}</div>
      </div>
    `;
    d.onclick = () => selectMessage(m.id);
    addSwipe(d, m);
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
        <button onclick="snoozeMsg('${m.id}')">⏰ Напомнить</button>
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
    <td><button class="danger" onclick="adminDeleteUser('${u.id}')">удалить</button></td>
  </tr>`).join("");
  return `
    <form class="admin-form" onsubmit="adminCreateUser(event)">
      <input name="email" type="email" placeholder="email" required>
      <input name="password" type="password" placeholder="пароль" required>
      <input name="name" placeholder="имя" required>
      <select name="role"><option value="manager">manager</option><option value="admin">admin</option><option value="owner">owner</option></select>
      <button type="submit">+ Добавить</button>
    </form>
    <table class="admin-table"><thead><tr><th>Email</th><th>Имя</th><th>Роль</th><th>Последний вход</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  `;
}

async function adminCreateUser(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/admin/users", { method: "POST", body: JSON.stringify(Object.fromEntries(f)) });
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
    <td><button class="danger" onclick="adminDeleteMailbox('${m.id}')">удалить</button></td>
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
  return `<table class="admin-table"><thead><tr><th>Email</th><th>Имя</th><th>Использований</th><th>Последнее</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function adminDeleteContact(id) {
  if (!confirm("Удалить контакт?")) return;
  await api("/admin/contacts/" + id, { method: "DELETE" });
  renderAdminTab();
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

/* live polling */
setInterval(() => {
  if (!state.user || document.hidden) return;
  refreshList().catch(() => {});
}, 30000);

/* PWA */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/* init */
initTheme();
bootApp().catch(() => showLogin());
