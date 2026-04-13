"use strict";

const state = {
  aiSummaryEnabled: true,
  user: null,
  mailboxes: [],
  folders: [],
  currentFolder: '__inbox',
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
function toggleSidebarCollapse() {
  const sb = document.getElementById("main-sidebar");
  const app = document.getElementById("app");
  sb.classList.toggle("collapsed");
  const collapsed = sb.classList.contains("collapsed");
  app.style.setProperty("--sidebar-w", collapsed ? "56px" : "220px");
  localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "");
}
// Restore sidebar state
(function() {
  if (localStorage.getItem("sidebar-collapsed") === "1") {
    document.addEventListener("DOMContentLoaded", function() {
      var sb = document.getElementById("main-sidebar");
      if (sb) { sb.classList.add("collapsed"); document.getElementById("app").style.setProperty("--sidebar-w", "56px"); }
    });
  }
})();

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
    if (el) {
      el.textContent = `v${v.version}`;
      el.title = v.commit;
    }
  }).catch(() => {});
  if (state.user.role === "owner" || state.user.role === "admin") {
    document.getElementById("admin-btn").classList.remove("hidden");
    const ibAdmin = document.getElementById("ib-admin");
    if (ibAdmin) ibAdmin.style.display = "";
    const ibFinance = document.getElementById("ib-finance");
    if (ibFinance) ibFinance.style.display = "";
    const mtabFinance = document.getElementById("mtab-finance");
    if (mtabFinance) mtabFinance.style.display = "";
    const teamSubnav = document.getElementById("team-subnav-btn");
    if (teamSubnav) teamSubnav.style.display = "";
  }
  // Load AI summary setting
  try { const _s = await api('/admin/task-settings').catch(()=>({})); state.aiSummaryEnabled = _s.ai_summary_enabled !== 'false'; } catch {}
  await Promise.all([loadMailboxes(), loadFolders(), loadQuickLinks()]);
  initSubnavDrag();
  await refreshList();
}

async function loadQuickLinks() {
  const links = await api("/quick-links").catch(() => []);
  const list = document.getElementById("sheets-list");
  if (!list) return;
  list.innerHTML = "";
  const tableIcon = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>';
  for (const link of links) {
    const d = document.createElement("div");
    d.className = "folder-item";
    d.innerHTML = '<span style="display:flex;align-items:center;gap:10px">' + tableIcon + '<span class="folder-label">' + escapeHtml(link.name) + '</span></span>';
    d.onclick = () => window.open(link.url, "_blank");
    d.style.cursor = "pointer";
    list.appendChild(d);
  }
  const group = document.getElementById("sheets-group");
  if (group) group.style.display = links.length ? "" : "none";
  // Also populate tasks-view dropdown
  const dd = document.getElementById("tasks-sheets-dropdown");
  if (dd && links.length) {
    dd.innerHTML = links.map((l) =>
      '<a href="' + escapeHtml(l.url) + '" target="_blank" style="display:block;padding:8px 14px;color:var(--text);text-decoration:none;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(l.name) + '</a>'
    ).join("");
  }
}

function toggleTasksSheets() {
  const dd = document.getElementById("tasks-sheets-dropdown");
  if (!dd) return;
  const show = dd.style.display === "none";
  dd.style.display = show ? "block" : "none";
  if (show) {
    const close = (e) => { if (!dd.parentElement.contains(e.target)) { dd.style.display = "none"; document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 0);
  }
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
  const folderIcons = {
    inbox: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
    sent: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>',
    drafts: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    starred: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>',
    trash: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
    custom: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  };
  const systemFolders = [
    { key: "__inbox", label: "Входящие", icon: "inbox", kind: "inbox" },
    { key: "__sent", label: "Отправленные", icon: "sent", kind: "sent" },
    { key: "__drafts", label: "Черновики", icon: "drafts", kind: "drafts" },
    { key: "__starred", label: "Важные", icon: "starred", kind: null },
    { key: "__trash", label: "Корзина", icon: "trash", kind: "trash" },
  ];
  for (const f of systemFolders) {
    const d = document.createElement("div");
    d.className = "folder-item" + (state.currentFolder === f.key ? " active" : "");
    d.innerHTML = `<span style="display:flex;align-items:center;gap:10px">${folderIcons[f.icon]}<span class="folder-label">${escapeHtml(f.label)}</span></span>`;
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
    d.innerHTML = `<span style="display:flex;align-items:center;gap:10px">${folderIcons.custom}<span class="folder-label">${escapeHtml(f.name)}</span></span>`;
    d.onclick = () => { exitTasksView(); state.currentFolder = f.id; state.selectedIds.clear(); renderBulkBar(); refreshList(); };
    list.appendChild(d);
  }
}

async function refreshList() {
  await loadMailboxes();
  await loadFolders();
  const params = new URLSearchParams();
  const q = document.getElementById("search-input").value.trim();
  if (q) params.set("q", q);
  const searchScope = document.getElementById("search-scope")?.value || "all";
  if (q && searchScope !== "all") params.set("searchIn", searchScope);
  const searchFolder = document.getElementById("search-folder")?.value || "";
  const status = document.getElementById("status-filter").value;
  if (status !== "all") params.set("status", status);
  const df = document.getElementById("date-from").value;
  const dt = document.getElementById("date-to").value;
  if (df) params.set("dateFrom", df);
  if (dt) params.set("dateTo", dt);
  // Global search folder override
  state._globalSearch = false;
  if (searchFolder === "all") {
    params.set("folderKind", "all");
    state._globalSearch = true;
  } else if (searchFolder === "inbox" || searchFolder === "sent") {
    params.set("folderKind", searchFolder);
    state._globalSearch = true;
  } else {
    // Normal folder-based browsing
    if (state.currentMailbox) params.set("mailboxId", state.currentMailbox);
    const sysMap = { __sent: "sent", __drafts: "drafts", __inbox: "inbox" };
    const sysKind = sysMap[state.currentFolder];
    if (sysKind) {
      const ids = state.folders.filter((f) => f.kind === sysKind).map((f) => f.id);
      if (ids.length === 1) params.set("folderId", ids[0]);
    } else if (state.currentFolder === "__trash") {
      params.set("trash", "true");
    } else if (state.currentFolder === "__starred") {
      // post-filter
    } else if (state.currentFolder) {
      params.set("folderId", state.currentFolder);
    }
  }
  params.set("limit", "100");
  let messages = await api("/messages?" + params.toString());
  if (!searchFolder) {
    const sysMap = { __sent: "sent", __drafts: "drafts", __inbox: "inbox" };
    const sysKind = sysMap[state.currentFolder];
    if (sysKind) {
      const ids = new Set(state.folders.filter((f) => f.kind === sysKind).map((f) => f.id));
      if (ids.size > 1) messages = messages.filter((m) => ids.has(m.folderId));
    }
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
    const isSentFolder = state.currentFolder === "__sent" || (state._globalSearch && m.folder?.kind === "sent");
    const displayName = isSentFolder
      ? "Кому: " + ((m.toAddrs && m.toAddrs.length) ? m.toAddrs[0] : "")
      : (m.fromName || m.fromAddr || "");
    const initial = isSentFolder
      ? ((m.toAddrs && m.toAddrs.length) ? m.toAddrs[0] : "?")[0].toUpperCase()
      : (m.fromAddr || "?")[0].toUpperCase();
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
        <div class="msg-head"><div class="msg-from">${prioBadge}${highlight(displayName, q)}</div><div class="msg-date">${state._globalSearch ? (m.folder?.kind === 'sent' ? '📤 ' : m.folder?.kind === 'inbox' ? '📥 ' : '') : ''}${date}</div></div>
        <div class="msg-subject">${star}${clip} ${highlight(m.subject || "(без темы)", q)}</div>
        <div class="msg-snippet">${highlight(snippet, q)}</div>
      </div>
      <span class="msg-star" onclick="event.stopPropagation();toggleStar('${m.id}',${m.isStarred})" style="font-size:14px;cursor:pointer;color:${m.isStarred ? 'oklch(0.75 0.16 85)' : 'oklch(0.5 0.02 260)'};flex-shrink:0" title="${m.isStarred ? 'Убрать из важных' : 'Важное'}">${m.isStarred ? '★' : '☆'}</span>
      <span class="msg-unread-dot" onclick="event.stopPropagation();toggleRead('${m.id}',${m.isRead})" style="width:10px;height:10px;border-radius:50%;background:${m.isRead ? 'transparent' : 'oklch(0.6 0.18 260)'};border:1.5px solid oklch(0.6 0.15 260);flex-shrink:0;cursor:pointer" title="${m.isRead ? 'Пометить непрочитанным' : 'Пометить прочитанным'}"></span>
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
  const _previewableAttachments = (m.attachments || []).map((a, i) => ({...a, _idx: i}));
  const attachHtml = _previewableAttachments
    .map((a, i) => {
      const isImg = /^image\//.test(a.mime || "");
      const isPdf = /\.pdf$/i.test(a.filename || "") || (a.mime || "").includes("pdf");
      const canPreview = isImg || isPdf;
      const icon = isImg ? '🖼' : isPdf ? '📄' : '📎';
      const thumb = isImg ? `<img src="/attachments/${a.id}" style="width:48px;height:48px;object-fit:cover;border-radius:6px">` : `<span style="font-size:28px">${icon}</span>`;
      return `<div class="attachment" style="display:inline-flex;align-items:center;gap:10px;cursor:${canPreview ? 'pointer' : 'default'}" ${canPreview ? `onclick="openFileViewer(${JSON.stringify(_previewableAttachments.map(x=>({id:x.id,filename:x.filename,mime:x.mime,size:x.size}))).replace(/"/g,'&quot;')}, ${i})"` : ''}>
        ${thumb}
        <div>
          <div style="font-size:12px;font-weight:500">${escapeHtml(a.filename)}</div>
          <div style="font-size:10px;color:var(--text-muted)">${fmtSize(a.size)}</div>
        </div>
        <a href="/attachments/${a.id}" download onclick="event.stopPropagation()" style="font-size:16px;text-decoration:none;margin-left:auto" title="Скачать">⬇</a>
      </div>`;
    })
    .join("");
  const rawBody = m.bodyText || stripHtml(m.bodyHtml || "");
  const body = rawBody.replace(/\n{3,}/g, "\n\n").replace(/(\r?\n\s*){3,}/g, "\n\n");
  const aiActions = (m.aiActions || []).filter((a) => !a.startsWith("_"));
  const aiHtml = !state.aiSummaryEnabled ? "" : m.aiSummary
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
        <b>От:</b> ${m.fromName ? escapeHtml(m.fromName) + ' &lt;' + escapeHtml(m.fromAddr) + '&gt;' : escapeHtml(m.fromAddr || "")}<br>
        <b>Кому:</b> ${escapeHtml((m.toAddrs || []).join(", "))}<br>
        ${(m.ccAddrs || []).length ? `<b>Копия:</b> ${escapeHtml(m.ccAddrs.join(", "))}<br>` : ""}
        <b>Дата:</b> ${date}
      </div>
      <div class="preview-actions" style="align-items:center">
        <button class="mobile-back" onclick="closePreview()" title="Назад"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button>
        <button onclick="replyTo('${m.id}')" title="Ответить"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M9 17l-5-5 5-5"/><path d="M4 12h12a4 4 0 014 4v1"/></svg></button>
        <button onclick="aiReply('${m.id}')" title="AI ответ"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 11.8L11 13M12.2 6.2L11 5"/><path d="M15 9l-6 11"/></svg></button>
        <button onclick="forwardMsg('${m.id}')" title="Переслать"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M15 17l5-5-5-5"/><path d="M20 12H8a4 4 0 00-4 4v1"/></svg></button>
        <button onclick="deleteMsg('${m.id}')" title="Удалить"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        <button onclick="toggleStar('${m.id}', ${m.isStarred})" title="${m.isStarred ? 'Снять' : 'Важное'}"><svg width="18" height="18" fill="${m.isStarred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg></button>
        <button onclick="markUnread('${m.id}')" title="Непрочитано"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 7l10 7 10-7"/></svg></button>
        <button onclick="printEmail('${m.id}')" title="Печать"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
        <div style="position:relative;display:inline-block">
          <button onclick="toggleMailMenu(this)" title="Ещё" style="font-size:18px;line-height:1;padding:6px 8px">⋮</button>
          <div class="mail-menu" style="display:none;position:absolute;right:0;top:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.12);z-index:50;min-width:200px;padding:6px 0">
            <div onclick="emailToTask('${m.id}');closeMailMenu()" style="padding:10px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/></svg> Задача из письма</div>
            <div onclick="snoozeMsg('${m.id}');closeMailMenu()" style="padding:10px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Напомнить</div>
            <div onclick="exportPdf('${m.id}');closeMailMenu()" style="padding:10px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg> PDF</div>
            <div onclick="blockSender('${escapeHtml(m.fromAddr)}');closeMailMenu()" style="padding:10px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px;color:var(--danger)" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg> Блок отправителя</div>
          </div>
        </div>
      </div>
    </div>
    ${aiHtml}
    <div class="preview-body">${formatEmailChain(body)}</div>
    ${attachHtml ? `<div class="attachments">${attachHtml}</div>` : ""}
  `;
}


function formatEmailChain(body) {
  if (!body) return "";
  // Split email body at quoted reply markers
  const patterns = [
    /^(.*?писал[аи]?:\s*>?\s*)$/m,
    /^(-{3,}\s*Пересылаемое сообщение\s*-{3,})$/m,
    /^(On .+ wrote:)$/m,
    /^(>{1,}\s)$/m,
    /^(-{2,}\s*\d{1,2}\.\d{1,2}\.\d{4}.+писал[аи]?:)$/m,
  ];
  
  let mainBody = body;
  let quotedParts = [];
  
  // Find first quote marker
  let splitIdx = -1;
  let splitLine = "";
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/писал[аи]?\s*:?\s*$/.test(line) || /wrote:\s*$/.test(line) || /^-{3,}\s*(Пересылаемое|Forwarded)/.test(line)) {
      splitIdx = i;
      splitLine = line;
      break;
    }
    if (i > 0 && /^>\s/.test(line) && /^>\s/.test(lines[i-1] || "")) {
      splitIdx = i - 1;
      break;
    }
  }
  
  if (splitIdx >= 0) {
    mainBody = lines.slice(0, splitIdx).join("\n");
    const quotedText = lines.slice(splitIdx).join("\n");
    const qid = "q_" + Math.random().toString(36).slice(2, 8);
    return escapeHtml(mainBody.trim()) + 
      '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">' +
      '<button onclick="var e=document.getElementById(\'' + qid + '\');e.style.display=e.style.display===\'none\'?\'block\':\'none\';this.textContent=e.style.display===\'none\'?\'··· Показать историю\':\'··· Скрыть историю\'" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px;color:var(--text-muted)">··· Показать историю</button>' +
      '<div id="' + qid + '" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg-alt);border-radius:8px;font-size:13px;color:var(--text-muted);border-left:3px solid var(--border)">' + escapeHtml(quotedText.trim()) + '</div></div>';
  }
  
  return escapeHtml(body);
}
function toggleMailMenu(btn) {
  const menu = btn.nextElementSibling;
  menu.style.display = menu.style.display === "none" ? "block" : "none";
  if (menu.style.display === "block") {
    const close = (e) => { if (!menu.contains(e.target) && e.target !== btn) { menu.style.display = "none"; document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 0);
  }
}
function closeMailMenu() { document.querySelectorAll(".mail-menu").forEach(m => m.style.display = "none"); }

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

async function toggleRead(id, currentState) {
  await api("/messages/" + id, { method: "PATCH", body: JSON.stringify({ isRead: !currentState }) });
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
  openCompose({ _composeTitle: "Ответить отправителю",
    to: m.fromAddr,
    subject: m.subject.startsWith("Re:") ? m.subject : "Re: " + m.subject,
    bodyText: "\n\n--- " + new Date(m.receivedAt || Date.now()).toLocaleString("ru") + ", " + (m.fromAddr || "") + " писал:\n" + quoted,
    mailboxId: m.mailboxId,
  });
}

async function forwardMsg(id) {
  const m = state.messages.find((x) => x.id === id) || (await api("/messages/" + id));
  openCompose({ _composeTitle: "Переслать письмо",
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

let _personas = [];
async function loadSenderPersonas() {
  const sel = document.getElementById("compose-persona");
  if (!sel) return;
  try {
    _personas = await api("/personas").catch(() => []);
    const opts = ['<option value="">— без визитки —</option>'];
    for (const p of _personas) {
      opts.push(`<option value="${p.id}">${escapeHtml(p.name)}</option>`);
    }
    sel.innerHTML = opts.join("");
    sel.parentElement.style.display = _personas.length ? "" : "none";
    sel.onchange = updateComposeSignature;
  } catch {
    sel.parentElement.style.display = "none";
  }
}

function updateComposeSignature() {
  const sel = document.getElementById("compose-persona");
  const ta = document.querySelector("#compose-form textarea[name='bodyText']");
  if (!sel || !ta) return;
  // Remove old signature (everything after \n--\n or \n---\n)
  let text = ta.value;
  const sigIdx = text.search(/\n--+\n/);
  if (sigIdx >= 0) text = text.substring(0, sigIdx);
  text = text.trimEnd();
  // Add new signature
  const persona = _personas.find((p) => p.id === sel.value);
  if (persona && persona.signature) {
    ta.value = text + "\n\n--\n" + persona.signature;
  } else {
    ta.value = text;
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
  const modal = document.getElementById("compose-modal");
  const form = document.getElementById("compose-form");
  form.reset();
  if (defaults.mailboxId) form.mailboxId.value = defaults.mailboxId;
  if (defaults.to) form.to.value = defaults.to;
  if (defaults.subject) form.subject.value = defaults.subject;
  if (defaults.bodyText) form.bodyText.value = defaults.bodyText;
  modal.classList.remove("hidden");
  var ct = document.getElementById("compose-modal-title"); if (ct) ct.textContent = defaults._composeTitle || "Новое письмо";
  document.getElementById("compose-minimized").classList.add("hidden");
  // Load personas and auto-insert signature
  loadSenderPersonas().then(() => {
    if (defaults.personaId) {
      form.personaId.value = defaults.personaId;
    } else if (_personas.length) {
      // Auto-select first persona if none specified
      form.personaId.value = _personas[0].id;
    }
    // Always insert signature (for new compose and replies)
    setTimeout(updateComposeSignature, 100);
  });
}
function closeCompose() {
  document.getElementById("compose-modal").classList.add("hidden");
  document.getElementById("compose-minimized").classList.add("hidden");
  document.getElementById("compose-error").textContent = "";
}
function toggleComposeMinimize() {
  const modal = document.getElementById("compose-modal");
  const mini = document.getElementById("compose-minimized");
  if (!modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
    mini.classList.remove("hidden");
  } else {
    mini.classList.add("hidden");
    modal.classList.remove("hidden");
  var ct = document.getElementById("compose-modal-title"); if (ct) ct.textContent = defaults._composeTitle || "Новое письмо";
  }
}

/* --- Response tracking --- */
let _trackDays = 7;
function toggleTrackingOptions() {
  const cb = document.getElementById("track-response-cb");
  const opts = document.getElementById("tracking-options");
  opts.style.display = cb.checked ? "flex" : "none";
  if (cb.checked) selectTrackDays(7);
}
async function trackingResend(taskId) {
  const t = await api("/tasks/" + taskId);
  const desc = t.description || "";
  const metaIdx = desc.indexOf("---TRACKING_META---");
  const metaBlock = metaIdx >= 0 ? desc.slice(metaIdx) : "";
  const toMatch = metaBlock.match(/toAddrs:(.+)/);
  const toAddrs = toMatch ? JSON.parse(toMatch[1]) : [];
  if (!toAddrs.length) { alert("Нет адресата"); return; }
  // Open compose with resend
  openCompose();
  setTimeout(() => {
    const f = document.getElementById("compose-form");
    if (f) {
      f.to.value = toAddrs.join(", ");
      f.subject.value = "Re: " + (t.title.replace("🔔 Отслеживание: ", ""));
      const ta = f.querySelector("textarea");
      if (ta) ta.value = "По данному обращению нарушен срок ответа, просим незамедлительно предоставить ответ.\n\n";
      // Enable tracking
      const cb = document.getElementById("track-response-cb");
      if (cb) { cb.checked = true; toggleTrackingOptions(); }
    }
  }, 200);
  // Mark old task done
  await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
  await api("/tasks/" + taskId + "/comments", { method: "POST", body: JSON.stringify({ text: "📩 Отправлено повторно" }) });
}

async function trackingManual(taskId) {
  const due = new Date(Date.now() + 3 * 86400000).toISOString();
  await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ dueDate: due }) });
  await api("/tasks/" + taskId + "/comments", { method: "POST", body: JSON.stringify({ text: "✏️ Ответ будет подготовлен вручную. Срок: 3 дня." }) });
  showToast("Срок продлён на 3 дня", null);
  loadTasks();
}

async function trackingDone(taskId) {
  await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
  await api("/tasks/" + taskId + "/comments", { method: "POST", body: JSON.stringify({ text: "✅ Ответ получен. Отслеживание завершено." }) });
  showToast("Отслеживание завершено", null);
  loadTasks();
  document.getElementById("task-form-modal").classList.add("hidden");
}

function selectTrackDays(days) {
  _trackDays = days;
  document.querySelectorAll(".track-day-btn").forEach((b) => {
    b.classList.toggle("active", parseInt(b.dataset.days) === days);
  });
  const custom = document.getElementById("track-custom-days");
  if (![3, 7, 14, 30].includes(days)) {
    custom.value = days;
    document.querySelectorAll(".track-day-btn").forEach((b) => b.classList.remove("active"));
  }
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
    // If tracking is enabled, create a tracking task
    const trackCb = document.getElementById("track-response-cb");
    if (trackCb && trackCb.checked && to.length) {
      try {
        await api("/track-response", {
          method: "POST",
          body: JSON.stringify({
            messageId: draft.id,
            subject: f.get("subject") || "(без темы)",
            toAddrs: to,
            trackDays: _trackDays || 7,
          }),
        });
      } catch (trackErr) {
        console.error("tracking create failed:", trackErr);
      }
    }
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
/* --- Fullscreen file viewer --- */
let _viewerAttachments = [];
let _viewerIdx = 0;

function openFileViewer(attachments, idx) {
  _viewerAttachments = attachments;
  _viewerIdx = idx;
  renderFileViewer();
}

function renderFileViewer() {
  let overlay = document.getElementById('file-viewer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'file-viewer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:300;display:flex;flex-direction:column';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  const a = _viewerAttachments[_viewerIdx];
  const isImg = /^image\//.test(a.mime || '');
  const isPdf = /\.pdf$/i.test(a.filename || '') || (a.mime || '').includes('pdf');
  const hasPrev = _viewerIdx > 0;
  const hasNext = _viewerIdx < _viewerAttachments.length - 1;

  let content = '';
  if (isImg) {
    content = `<img src="/attachments/${a.id}" style="max-width:90vw;max-height:80vh;object-fit:contain;border-radius:8px;box-shadow:0 4px 32px rgba(0,0,0,0.5)">`;
  } else if (isPdf) {
    content = `<iframe src="/attachments/${a.id}#toolbar=1&navpanes=0" style="width:90vw;height:82vh;border:none;border-radius:8px;background:white"></iframe>`;
  }

  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;color:white">
      <div style="font-size:14px;font-weight:600">${escapeHtml(a.filename)} <span style="opacity:0.5;font-size:12px">(${fmtSize(a.size)})</span></div>
      <div style="display:flex;gap:12px;align-items:center">
        <a href="/attachments/${a.id}" download style="color:white;text-decoration:none;font-size:14px;padding:6px 12px;border:1px solid rgba(255,255,255,0.3);border-radius:8px">⬇ Скачать</a>
        <button onclick="closeFileViewer()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;padding:4px 8px">&times;</button>
      </div>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;padding:0 60px">
      ${hasPrev ? '<button onclick="navigateViewer(-1)" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:white;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer">‹</button>' : ''}
      ${content}
      ${hasNext ? '<button onclick="navigateViewer(1)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:white;font-size:28px;width:44px;height:44px;border-radius:50%;cursor:pointer">›</button>' : ''}
    </div>
    <div style="text-align:center;padding:8px;color:rgba(255,255,255,0.5);font-size:12px">${_viewerIdx + 1} / ${_viewerAttachments.length}</div>
  `;
  // Close on Escape
  if (overlay._keyHandler) document.removeEventListener("keydown", overlay._keyHandler);
  overlay._keyHandler = function(e) { if (e.key === 'Escape') closeFileViewer(); };
  document.addEventListener('keydown', overlay._keyHandler);
}

function navigateViewer(dir) {
  _viewerIdx = Math.max(0, Math.min(_viewerAttachments.length - 1, _viewerIdx + dir));
  renderFileViewer();
}


async function printEmail(id) {
  const m = await api("/messages/" + id);
  const w = window.open('', '_blank');
  const date = m.receivedAt ? new Date(m.receivedAt).toLocaleString("ru") : "";
  const fromDisplay = m.fromName ? m.fromName + ' <' + m.fromAddr + '>' : m.fromAddr;
  const body = m.bodyHtml || ('<pre style="white-space:pre-wrap;font-family:inherit">' + escapeHtml(m.bodyText || '') + '</pre>');
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapeHtml(m.subject || '') + '</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#333;line-height:1.6}.header{border-bottom:2px solid #333;padding-bottom:16px;margin-bottom:20px}.field{font-size:14px;margin:4px 0}.field b{min-width:60px;display:inline-block}h1{font-size:20px;margin:0 0 12px}.body{font-size:14px}@media print{body{margin:20px}}</style></head><body><div class="header"><div style="font-size:12px;color:#888">' + escapeHtml(date) + '</div><h1>' + escapeHtml(m.subject || '(без темы)') + '</h1><div class="field"><b>От:</b> ' + escapeHtml(fromDisplay) + '</div><div class="field"><b>Кому:</b> ' + escapeHtml((m.toAddrs||[]).join(', ')) + '</div>' + ((m.ccAddrs||[]).length ? '<div class="field"><b>Копия:</b> ' + escapeHtml(m.ccAddrs.join(', ')) + '</div>' : '') + '</div><div class="body">' + body + '</div></body></html>');
  w.document.close();
  setTimeout(function() { w.print(); }, 500);
}
function closeFileViewer() {
  const overlay = document.getElementById('file-viewer-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    if (overlay._keyHandler) document.removeEventListener('keydown', overlay._keyHandler);
  }
}

function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / 1024 / 1024).toFixed(1) + " MB";
}

let searchTimer;

/* Scroll to top */
function scrollToTop() {
  var targets = [
    document.querySelector('.messages-list'),
    document.querySelector('.preview-pane'),
    document.getElementById('tasks-view'),
    document.getElementById('finance-view'),
    document.getElementById('admin-view'),
  ];
  targets.forEach(function(el) {
    if (el && el.offsetParent !== null) el.scrollTo({top:0, behavior:'smooth'});
  });
  window.scrollTo({top:0, behavior:'smooth'});
}

(function() {
  var btn = null;
  function checkScroll() {
    if (!btn) btn = document.getElementById('scroll-top-btn');
    if (!btn) return;
    var scrolled = false;
    var targets = [document.querySelector('.messages-list'), document.querySelector('.preview-pane'), document.getElementById('tasks-view')];
    targets.forEach(function(el) { if (el && el.scrollTop > 300) scrolled = true; });
    if (window.scrollY > 300) scrolled = true;
    
  }
  setInterval(checkScroll, 500);
})();
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
  if (e.key === "Escape") { closeCompose(); }
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

function switchSection(section) {
  // Update icon bar active state
  document.querySelectorAll(".icon-bar .ib-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.section === section);
  });
  if (section === "mail") {
    exitTasksView();
  } else if (section === "tasks") {
    const saved = tasksFilter || localStorage.getItem("crm-tasks-filter") || "me";
    if (saved === "kanban") showKanbanView();
    else showTasksView(saved);
  } else if (section === "finance") {
    showFinanceView();
  } else if (section === "team") {
    showTasksView("team");
  } else if (section === "admin") {
    showAdminView();
  }
  // Update mobile tabbar active state
  document.querySelectorAll(".tabbar button[id^='mtab-']").forEach((el) => {
    el.classList.toggle("mtab-active", el.id === "mtab-" + section);
  });
}

async function showAdminView() {
  document.querySelector(".sidebar").classList.add("hidden");
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("tasks-view").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.getElementById("team-view")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("admin-view").classList.remove("hidden");
  document.getElementById("app").style.gridTemplateColumns = window.innerWidth <= 900 ? "1fr" : "56px 1fr";
  renderAdminTab();
}

async function showFinanceView() {
  document.querySelector(".sidebar").classList.add("hidden");
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("tasks-view").classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("finance-view").classList.remove("hidden");
  document.getElementById("app").style.gridTemplateColumns = window.innerWidth <= 900 ? "1fr" : "56px 1fr";
  await checkSberStatus();
  await loadSberData();
  // Hide manual company list — Sber data is primary
  document.getElementById("finance-totals").style.display = "none";
  document.getElementById("finance-list").style.display = "none";
}

function exitFinanceView() {
  const v = document.getElementById("finance-view");
  if (v) v.classList.add("hidden");
}

async function checkSberStatus() {
  try {
    const s = await api("/api/sber/status");
    const connectBtn = document.getElementById("sber-connect-btn");
    const loadBtn = document.getElementById("sber-load-btn");
    const statusEl = document.getElementById("sber-status");
    if (!s.connected) {
      connectBtn.style.display = "";
      loadBtn.style.display = "none";
      statusEl.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Сбер не подключён</span>';
    } else if (s.expired && !s.hasRefresh) {
      connectBtn.style.display = "";
      loadBtn.style.display = "none";
      statusEl.innerHTML = '<span style="color:var(--danger);font-size:12px">Токен Сбера истёк</span>';
    } else {
      connectBtn.style.display = "none";
      loadBtn.style.display = "";
      statusEl.innerHTML = "";
    }
  } catch {
    document.getElementById("sber-connect-btn").style.display = "none";
    document.getElementById("sber-load-btn").style.display = "none";
  }
}

function connectSber() {
  window.location.href = "/api/sber/connect";
}

const sberAmt = (v) => typeof v === "object" && v ? parseFloat(v.amount) : parseFloat(v) || 0;

async function loadSberData() {
  const el = document.getElementById("sber-data");
  document.getElementById("sber-statement").style.display = "none";
  document.getElementById("finance-title").textContent = "💰 Финансы";
  el.innerHTML = '<div style="color:var(--text-muted)">⏳ загружаю остатки...</div>';
  try {
    const info = await api("/api/sber/accounts");
    const today = new Date().toISOString().slice(0, 10);
    let totalBalance = 0;
    const shortName = (info.fullName || info.shortName || "").replace(/ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ /i, "ИП ").replace(/ГНАТЮК /i, "");
    let html = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${escapeHtml(shortName)}</div>`;
    for (const acc of (info.accounts || [])) {
      if (acc.state !== "OPEN") continue;
      let summary = null;
      try {
        summary = await api(`/api/sber/statement/summary?accountNumber=${acc.number}&statementDate=${today}`);
      } catch {}
      const bal = summary ? sberAmt(summary.closingBalance) : 0;
      totalBalance += bal;
      html += `
        <div onclick="openStatement('${acc.number}')" style="cursor:pointer;background:var(--bg-alt);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;transition:border-color 0.15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="min-width:0">
            <div style="font-family:monospace;font-size:13px;word-break:break-all">${escapeHtml(acc.number)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">БИК ${escapeHtml(acc.bic)} · ${escapeHtml(acc.name || acc.type || "")}</div>
            ${summary ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Дебет: ${fmtMoney(sberAmt(summary.debitTurnover))} (${summary.debitTransactionsNumber}) · Кредит: ${fmtMoney(sberAmt(summary.creditTurnover))} (${summary.creditTransactionsNumber})</div>` : ""}
          </div>
          <div style="text-align:right">
            <div style="font-size:22px;font-weight:700">${fmtMoney(bal)} ₽</div>
            ${summary ? `<div style="font-size:10px;color:var(--text-muted)">входящий: ${fmtMoney(sberAmt(summary.openingBalance))}</div>` : ""}
          </div>
        </div>
      `;
    }
    // No duplicate total — balance is shown on each account card
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--danger)">Ошибка: ${escapeHtml(e.message)}</div>`;
  }
}

async function openStatement(accountNumber) {
  const el = document.getElementById("sber-statement");
  document.getElementById("sber-data").style.display = "none";
  el.style.display = "block";
  document.getElementById("finance-title").textContent = "📄 Выписка: " + accountNumber;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <button onclick="loadSberData();document.getElementById('sber-data').style.display=''" style="padding:6px 12px;background:var(--bg-alt);border:1px solid var(--border);border-radius:5px;cursor:pointer">← Назад к сводке</button>
      <span style="font-size:12px;color:var(--text-muted)">с</span>
      <input type="date" id="stmt-from" value="${monthAgo}" onchange="loadLocalStatement('${accountNumber}')" style="padding:6px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text)">
      <span style="font-size:12px;color:var(--text-muted)">по</span>
      <input type="date" id="stmt-to" value="${today}" onchange="loadLocalStatement('${accountNumber}')" style="padding:6px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text)">
      <button onclick="syncAndReload('${accountNumber}')" style="padding:6px 12px;background:#21a038;color:white;border:none;border-radius:5px;cursor:pointer">🔄 Синхронизировать</button>
      <span id="stmt-loading" style="color:var(--text-muted);font-size:12px"></span>
    </div>
    <div id="stmt-summary" style="margin-bottom:12px"></div>
    <div id="stmt-transactions"></div>
  `;
  await loadLocalStatement(accountNumber);
}

async function syncAndReload(accountNumber) {
  const loadingEl = document.getElementById("stmt-loading");
  if (loadingEl) loadingEl.textContent = "⏳ синхронизация с банком...";
  try {
    const r = await api("/api/sber/sync", { method: "POST" });
    if (loadingEl) loadingEl.textContent = `синхронизировано ${r.synced} операций`;
  } catch (e) {
    if (loadingEl) loadingEl.textContent = "ошибка: " + e.message;
  }
  await loadLocalStatement(accountNumber);
}

async function loadLocalStatement(accountNumber) {
  const dateFrom = document.getElementById("stmt-from")?.value;
  const dateTo = document.getElementById("stmt-to")?.value;
  const loadingEl = document.getElementById("stmt-loading");
  const el = document.getElementById("stmt-transactions");
  const sumEl = document.getElementById("stmt-summary");
  if (!el) return;
  try {
    const params = new URLSearchParams({ accountNumber, limit: "1000" });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const transactions = await api("/api/sber/local/transactions?" + params);
    // Compute summary from local data
    let debitSum = 0, creditSum = 0, debitCount = 0, creditCount = 0;
    for (const t of transactions) {
      const amt = parseFloat(t.amount) || 0;
      if (t.direction === "DEBIT") { debitSum += amt; debitCount++; }
      else { creditSum += amt; creditCount++; }
    }
    sumEl.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="background:var(--bg-alt);padding:10px 16px;border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-muted)">Расход за период</div>
        <div style="font-size:16px;font-weight:600;color:var(--danger)">-${fmtMoney(debitSum)} (${debitCount})</div>
      </div>
      <div style="background:var(--bg-alt);padding:10px 16px;border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-muted)">Приход за период</div>
        <div style="font-size:16px;font-weight:600;color:#21a038">+${fmtMoney(creditSum)} (${creditCount})</div>
      </div>
      <div style="background:var(--bg-alt);padding:10px 16px;border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-muted)">Итого</div>
        <div style="font-size:16px;font-weight:600">${fmtMoney(creditSum - debitSum)} (${transactions.length} оп.)</div>
      </div>
    </div>`;
    if (transactions.length) {
      el.innerHTML = `<table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead style="color:var(--text-muted);font-size:11px"><tr>
          <th style="text-align:left;padding:6px">Дата</th>
          <th style="text-align:left;padding:6px">Контрагент</th>
          <th style="text-align:left;padding:6px">Назначение</th>
          <th style="text-align:right;padding:6px">Сумма</th>
        </tr></thead>
        <tbody>${transactions.map((t) => {
          const isDebit = t.direction === "DEBIT";
          const amt = parseFloat(t.amount) || 0;
          const dt = (t.operationDate || "").slice(0, 10);
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px;white-space:nowrap">${dt}</td>
            <td style="padding:6px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(t.counterpartyName || "")}">${escapeHtml(t.counterpartyName || "—")}</td>
            <td style="padding:6px;color:var(--text-muted);max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(t.paymentPurpose || "")}">${escapeHtml((t.paymentPurpose || "").slice(0, 120))}</td>
            <td style="padding:6px;text-align:right;font-weight:600;color:${isDebit ? "var(--danger)" : "#21a038"};white-space:nowrap">${isDebit ? "−" : "+"}${fmtMoney(amt)}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;
    } else {
      el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Нет операций за этот период. Нажмите «Синхронизировать» чтобы подтянуть данные из банка.</div>';
    }
    if (loadingEl && !loadingEl.textContent.includes("синхрон")) loadingEl.textContent = `${transactions.length} операций`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--danger)">Ошибка: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadFinance() {
  const companies = await api("/companies");
  const list = document.getElementById("finance-list");
  const totals = document.getElementById("finance-totals");
  if (!companies.length) {
    list.innerHTML = '';
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
  tasksMode = "list";
  localStorage.setItem("crm-tasks-filter", filter || "me");
  document.querySelector(".sidebar").classList.add("hidden");
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.getElementById("team-view")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("tasks-view").classList.remove("hidden");
  document.getElementById("app").style.gridTemplateColumns = window.innerWidth <= 900 ? "1fr" : "56px 1fr";
  const titles = {
    me: "Мои задачи",
    createdByMe: "Поставлено мной",
    unassigned: "Без исполнителя",
    overdue: "Просроченные",
    done: "Выполненные",
    team: "👥 Команда",
  };
  document.getElementById("tasks-view-title").textContent = titles[filter] || "Все задачи";
  // Highlight active subnav button
  document.querySelectorAll("#tasks-subnav .subnav-btn").forEach(function(b) {
    const isActive = b.getAttribute("onclick") && b.getAttribute("onclick").includes("'" + filter + "'");
    b.style.background = isActive ? "var(--accent)" : "";
    b.style.color = isActive ? "white" : "";
    b.style.borderColor = isActive ? "var(--accent)" : "";
  });
  const kanbanBackBtn = document.getElementById("kanban-back-btn");
  if (kanbanBackBtn) kanbanBackBtn.style.display = "none";
  const filtersEl = document.getElementById("tasks-filters");
  if (filter === "team") {
    tasksMode = "team";
    if (filtersEl) filtersEl.style.display = "none";
    await loadTeamColumns();
  } else {
    if (filtersEl) filtersEl.style.display = "";
    await loadTasks();
  }
}

async function showTeamView() {
  document.querySelector(".sidebar").classList.add("hidden");
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("tasks-view").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.getElementById("team-view")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("team-view").classList.remove("hidden");
  document.getElementById("app").style.gridTemplateColumns = window.innerWidth <= 900 ? "1fr" : "56px 1fr";
  await loadTeamView();
}

async function loadTeamView() {
  const team = await api("/tasks/team-stats");
  const list = document.getElementById("team-list");
  if (!team.length) {
    list.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">нет данных</div>';
    return;
  }
  list.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${team.map((u) => {
        const overloaded = u.overdue >= 5 || u.open >= 30;
        const warning = !overloaded && (u.overdue >= 1 || u.open >= 15);
        const accent = overloaded ? "#ef4444" : warning ? "#f59e0b" : "#10b981";
        return `
          <div onclick="openUserKanban('${u.id}')" style="cursor:pointer;background:var(--bg-alt);border:1px solid var(--border);border-left:4px solid ${accent};border-radius:6px;padding:14px">
            <div style="font-weight:600;font-size:15px;margin-bottom:2px">${escapeHtml(u.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${escapeHtml(u.email)} · ${escapeHtml(u.role)}</div>
            <div style="display:flex;gap:14px;font-size:13px">
              <div><b style="font-size:18px">${u.open}</b><div style="font-size:10px;color:var(--text-muted)">открытых</div></div>
              <div><b style="font-size:18px;color:${u.overdue > 0 ? "#ef4444" : "var(--text)"}">${u.overdue}</b><div style="font-size:10px;color:var(--text-muted)">⏰ просроч.</div></div>
              <div><b style="font-size:18px;color:#10b981">${u.doneWeek}</b><div style="font-size:10px;color:var(--text-muted)">✓ за нед.</div></div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function loadTeamColumns() {
  const [team, openTasks, progressTasks] = await Promise.all([
    api("/tasks/team-stats"),
    api("/tasks?status=open&limit=500"),
    api("/tasks?status=in_progress&limit=500"),
  ]);
  const allTasks = [...openTasks, ...progressTasks];
  const list = document.getElementById("tasks-list");
  if (!team.length) {
    list.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">нет данных</div>';
    return;
  }
  // Group tasks by assignee
  const byUser = {};
  for (const u of team) byUser[u.id] = { ...u, tasks: [] };
  for (const t of allTasks) {
    if (t.assigneeId && byUser[t.assigneeId]) byUser[t.assigneeId].tasks.push(t);
  }
  const users = Object.values(byUser);

  // Apply saved column order
  const savedOrder = JSON.parse(localStorage.getItem("team-col-order") || "null");
  if (savedOrder) {
    users.sort((a, b) => {
      const ai = savedOrder.indexOf(a.id), bi = savedOrder.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  list.innerHTML = `
    <div id="team-columns" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:start">
      ${users.map((u) => {
        const overdue = u.overdue > 0;
        return `
          <div class="team-column" draggable="true" data-col-user="${u.id}" ondragstart="dragColumn(event)" ondragover="dragOverColumn(event)" ondrop="dropColumn(event)" ondragend="dragEndColumn(event)" style="min-width:260px;max-width:300px;flex-shrink:0;background:var(--bg-alt);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:opacity .15s">
            <div style="padding:12px 14px;border-bottom:1px solid var(--border);background:var(--bg);cursor:grab">
              <div style="font-weight:700;font-size:14px">${escapeHtml(u.name)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${u.tasks.length} активных · ${overdue ? '<span style="color:var(--danger)">' + u.overdue + ' просроч.</span>' : '0 просроч.'}</div>
            </div>
            <div class="team-drop-zone" data-user-id="${u.id}" ondragover="event.preventDefault();this.style.background='var(--bg-hover)'" ondragleave="this.style.background=''" ondrop="dropTask(event,this)" style="padding:8px;max-height:60vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;min-height:60px">
              ${u.tasks.length ? u.tasks.map((t) => {
                const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();
                const prio = t.priority === "high" ? "🔥 " : t.priority === "urgent" ? "🚨 " : "";
                return `
                  <div draggable="true" ondragstart="event.stopPropagation();event.dataTransfer.setData('text/plain','${t.id}')" onclick="openTaskForm('${t.id}')" style="cursor:grab;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;transition:border-color .15s,opacity .15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                    <div style="font-size:13px;font-weight:500">${prio}${escapeHtml(t.title)}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:4px;display:flex;gap:8px;flex-wrap:wrap">
                      ${t.dueDate ? `<span style="${isOverdue ? 'color:var(--danger)' : ''}">${isOverdue ? '⏰' : '📅'} ${new Date(t.dueDate).toLocaleDateString("ru")}</span>` : ''}
                      <span>${t.status === "in_progress" ? "⚙ в работе" : "открыта"}</span>
                      ${t.project ? `<span>📁 ${escapeHtml(t.project.name)}</span>` : ''}
                    </div>
                    ${t.labels?.length ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${t.labels.map(l => `<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:var(--bg-hover);color:var(--text-muted)">${escapeHtml(l)}</span>`).join("")}</div>` : ''}
                  </div>`;
              }).join("") : '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px">нет задач</div>'}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// Subnav drag & drop
let _dragNavId = null;
function initSubnavDrag() {
  const container = document.getElementById("tasks-subnav");
  if (!container) return;
  // Restore saved order
  const saved = JSON.parse(localStorage.getItem("crm-subnav-order") || "null");
  if (saved) {
    const btns = [...container.querySelectorAll("[data-nav]")];
    const map = Object.fromEntries(btns.map(b => [b.dataset.nav, b]));
    saved.forEach(id => { if (map[id]) container.appendChild(map[id]); });
  }
  container.addEventListener("dragstart", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    _dragNavId = btn.dataset.nav;
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => btn.style.opacity = "0.4", 0);
  });
  container.addEventListener("dragover", (e) => { if (_dragNavId) e.preventDefault(); });
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!_dragNavId) return;
    const target = e.target.closest("[data-nav]");
    if (!target || target.dataset.nav === _dragNavId) { _dragNavId = null; return; }
    const btns = [...container.querySelectorAll("[data-nav]")];
    const from = btns.find(b => b.dataset.nav === _dragNavId);
    if (!from) { _dragNavId = null; return; }
    const rect = target.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width / 2) {
      container.insertBefore(from, target);
    } else {
      container.insertBefore(from, target.nextSibling);
    }
    const order = [...container.querySelectorAll("[data-nav]")].map(b => b.dataset.nav);
    localStorage.setItem("crm-subnav-order", JSON.stringify(order));
    _dragNavId = null;
  });
  container.addEventListener("dragend", (e) => {
    e.target.style.opacity = "";
    _dragNavId = null;
  });
}

let _dragColId = null;
function dragColumn(e) {
  _dragColId = e.currentTarget.dataset.colUser;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/column", _dragColId);
  setTimeout(() => { e.currentTarget.style.opacity = "0.4"; }, 0);
}
function dragOverColumn(e) {
  if (!_dragColId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
function dropColumn(e) {
  if (!_dragColId) return;
  e.preventDefault();
  const targetId = e.currentTarget.dataset.colUser;
  if (!targetId || targetId === _dragColId) return;
  const container = document.getElementById("team-columns");
  const cols = [...container.querySelectorAll(".team-column")];
  const order = cols.map(c => c.dataset.colUser);
  const fromIdx = order.indexOf(_dragColId);
  const toIdx = order.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  order.splice(fromIdx, 1);
  order.splice(toIdx, 0, _dragColId);
  localStorage.setItem("team-col-order", JSON.stringify(order));
  // Reorder DOM
  const fromEl = cols[fromIdx];
  const toEl = cols[toIdx];
  if (fromIdx < toIdx) {
    container.insertBefore(fromEl, toEl.nextSibling);
  } else {
    container.insertBefore(fromEl, toEl);
  }
  _dragColId = null;
}
function dragEndColumn(e) {
  e.currentTarget.style.opacity = "";
  _dragColId = null;
}

async function dropTask(event, dropZone) {
  event.preventDefault();
  event.stopPropagation();
  dropZone.style.background = "";
  const taskId = event.dataTransfer.getData("text/plain");
  if (!taskId) return; // not a task drag
  const newAssigneeId = dropZone.dataset.userId;
  if (!taskId || !newAssigneeId) return;
  try {
    await api("/tasks/" + taskId, { method: "PATCH", body: JSON.stringify({ assigneeId: newAssigneeId }) });
    await loadTeamColumns();
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
}

async function openUserKanban(userId) {
  await showKanbanView();
  const sel = document.getElementById("tasks-assignee-filter");
  if (sel) {
    sel.value = userId;
    await loadTasks();
  }
}

async function showKanbanView() {
  tasksFilter = null;
  tasksMode = "kanban";
  localStorage.setItem("crm-tasks-filter", "kanban");
  document.querySelector(".sidebar").classList.add("hidden");
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.getElementById("team-view")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.getElementById("resizer-1").style.display = "none";
  document.getElementById("resizer-2").style.display = "none";
  document.getElementById("tasks-view").classList.remove("hidden");
  document.getElementById("app").style.gridTemplateColumns = window.innerWidth <= 900 ? "1fr" : "56px 1fr";
  document.getElementById("tasks-view-title").textContent = '🗂 Канбан';
  const backBtn = document.getElementById("kanban-back-btn");
  if (backBtn) backBtn.style.display = "";
  await loadTasks();
}

function exitTasksView() {
  document.getElementById("tasks-view").classList.add("hidden");
  document.getElementById("finance-view").classList.add("hidden");
  document.getElementById("team-view")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.getElementById("admin-view")?.classList.add("hidden");
  document.querySelector(".sidebar").classList.remove("hidden");
  document.querySelector(".list-pane").classList.remove("hidden");
  document.querySelector(".preview-pane").classList.remove("hidden");
  document.getElementById("resizer-1").style.display = "";
  document.getElementById("resizer-2").style.display = "";
  document.getElementById("app").style.gridTemplateColumns = "";
  // re-apply persisted resizer widths
  const saved = JSON.parse(localStorage.getItem("crm-cols") || "null");
  if (saved && window.innerWidth > 900) {
    document.getElementById("app").style.gridTemplateColumns = `56px var(--sidebar-w, 220px) 4px ${saved.list}px 4px 1fr`;
  }
  // Update icon bar
  document.querySelectorAll(".icon-bar .ib-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.section === "mail");
  });
}

let tasksMode = "list";
let _tags = [];

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
  // Populate assignee filter for owner/admin in kanban mode
  const aSel = document.getElementById("tasks-assignee-filter");
  if (aSel && tasksMode === "kanban" && (state.user?.role === "owner" || state.user?.role === "admin")) {
    if (aSel.options.length <= 1) {
      const team = await api("/tasks/team-stats").catch(() => []);
      aSel.innerHTML = '<option value="">все исполнители</option>' +
        team.map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join("");
    }
    aSel.style.display = "";
  } else if (aSel) {
    aSel.style.display = "none";
  }
  const params = new URLSearchParams();
  if (tasksFilter === "me" && state.user) params.set("assigneeId", state.user.id);
  if (tasksFilter === "createdByMe" && state.user) {
    params.set("creatorId", state.user.id);
    params.set("status", "all");
  }
  if (tasksFilter === "unassigned") params.set("unassigned", "true");
  const assigneeOverride = document.getElementById("tasks-assignee-filter")?.value;
  if (assigneeOverride && tasksMode === "kanban") params.set("assigneeId", assigneeOverride);
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
  // Label filter (uses category field)
  const labelSel = document.getElementById("tasks-label-filter");
  if (labelSel && tasksFilter === "createdByMe") {
    labelSel.style.display = "";
    if (labelSel.options.length <= 1) {
      try {
        const s = await api("/admin/task-settings");
        const labels = (s.task_labels || "").split(",").map((l) => l.trim()).filter(Boolean);
        labelSel.innerHTML = '<option value="">все метки</option>' + labels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
      } catch {}
    }
    const labelVal = labelSel.value;
    if (labelVal) tasks = tasks.filter((t) => t.category === labelVal);
  } else if (labelSel) {
    labelSel.style.display = "none";
  }
  if (tasksMode === "kanban") renderKanban(tasks);
  else if (tasksFilter === "createdByMe") await renderTasksGrouped(tasks);
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
    return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:10px" onclick="openTaskForm('${t.id}')">
      <div style="flex:1;min-width:0">
        <div style="font-weight:${done ? 400 : 600};text-decoration:${done ? "line-through" : "none"};color:${prioColor[t.priority] || "var(--text)"};word-wrap:break-word">
          ${t.priority === "urgent" ? "🔥 " : ""}${done ? "✅ " : ""}${escapeHtml(t.title)}
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:3px">
          ${t.project ? `📁 ${escapeHtml(t.project.name)} · ` : ""}
          ${t.dueDate ? `${overdue ? "⏰" : "📅"} ${new Date(t.dueDate).toLocaleDateString("ru")} · ` : ""}
          ${t.priority}${t.category ? ` · ${escapeHtml(t.category)}` : ""}
        </div>
        ${tagPillsHtml(t) ? `<div style="margin-top:5px">${tagPillsHtml(t)}</div>` : ""}
      </div>
      ${done ? "" : `<button onclick="event.stopPropagation();if(confirm('Завершить задачу?'))toggleTaskDone('${t.id}',true)" style="padding:4px 10px;background:#10b981;color:white;border:none;border-radius:5px;cursor:pointer;font-size:11px;white-space:nowrap;flex-shrink:0">Завершить</button>`}
    </div>`;
  }).join("");
}

async function renderTasksGrouped(tasks) {
  const el = document.getElementById("tasks-list");
  if (!tasks.length) {
    el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">нет задач</div>';
    return;
  }
  // Ensure users are loaded
  if (!_users.length) {
    _users = await api("/admin/users").catch(() => []);
  }
  // Group by assigneeId
  const groups = {};
  const userNames = {};
  for (const t of tasks) {
    const key = t.assigneeId || "__none";
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  for (const u of _users) userNames[u.id] = u.name || u.email;
  const prioColor = { urgent: "#ef4444", high: "#f59e0b", normal: "var(--text)", low: "var(--text-muted)" };
  const statusIcon = { open: "⬚", in_progress: "⚙", done: "✅", cancelled: "✕" };
  let html = "";
  // Sort: assigned users first, then unassigned
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === "__none") return 1;
    if (b === "__none") return -1;
    return (userNames[a] || a).localeCompare(userNames[b] || b);
  });
  for (const key of keys) {
    const name = key === "__none" ? "Без исполнителя" : (userNames[key] || key);
    const list = groups[key];
    const openCount = list.filter((t) => t.status === "open" || t.status === "in_progress").length;
    html += `
      <div style="margin-bottom:18px">
        <div style="font-weight:600;font-size:14px;padding:8px 0;border-bottom:2px solid var(--accent);margin-bottom:6px">
          ${escapeHtml(name)} <span style="color:var(--text-muted);font-weight:400;font-size:12px">(${openCount} активных из ${list.length})</span>
        </div>
        ${list.map((t) => {
          const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done";
          const done = t.status === "done" || t.status === "cancelled";
          return `<div style="padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:start;gap:8px;opacity:${done ? 0.5 : 1}" onclick="openTaskForm('${t.id}')">
            <span style="font-size:12px">${statusIcon[t.status] || "⬚"}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:${done ? 400 : 600};text-decoration:${done ? "line-through" : "none"};color:${prioColor[t.priority] || "var(--text)"};font-size:13px">
                ${t.priority === "urgent" ? "🔥 " : ""}${escapeHtml(t.title)}
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                ${t.category ? `<span style="background:var(--accent);color:white;padding:1px 6px;border-radius:8px;font-size:10px;margin-right:4px">${escapeHtml(t.category)}</span>` : ""}
                ${t.project ? `📁 ${escapeHtml(t.project.name)} · ` : ""}
                ${t.dueDate ? `${overdue ? "⏰" : "📅"} ${new Date(t.dueDate).toLocaleDateString("ru")} · ` : ""}
                ${t.status}
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
    `;
  }
  el.innerHTML = html;
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
  f.assigneeId.innerHTML = '<option value="">—</option>' + _users.map((u) => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join("");
  f.projectId.innerHTML = '<option value="">—</option>' + _projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  // Populate labels
  try {
    const s = await api("/admin/task-settings").catch(() => ({}));
    const labels = (s.task_labels || "").split(",").map((l) => l.trim()).filter(Boolean);
    const catSel = document.getElementById("task-category-select");
    if (catSel) catSel.innerHTML = '<option value="">—</option>' + labels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
  } catch {}
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
    // Tracking actions
    const isTracking = (t.tagAssignments || []).some((ta) => ta.tag && ta.tag.name === "отслеживание");
    let trackEl = document.getElementById("task-tracking-actions");
    if (!trackEl) {
      trackEl = document.createElement("div");
      trackEl.id = "task-tracking-actions";
      trackEl.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--border);margin-top:10px";
      document.getElementById("task-attach-row").parentElement.appendChild(trackEl);
    }
    if (isTracking && t.status !== "done") {
      trackEl.style.display = "flex";
      trackEl.innerHTML = `
        <button class="tracking-action-btn" onclick="trackingResend('${t.id}')">📩 Отправить повторно</button>
        <button class="tracking-action-btn" onclick="trackingManual('${t.id}')">✏️ Отвечу сам (3 дня)</button>
        <button class="tracking-action-btn" onclick="trackingDone('${t.id}')" style="color:var(--accent)">✅ Ответ получен</button>
      `;
    } else {
      trackEl.style.display = "none";
    }
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

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

async function saveTask(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {};
  for (const [k, v] of fd) if (v !== "") body[k] = v;
  const id = body.id;
  delete body.id;
  if (body.dueDate) body.dueDate = new Date(body.dueDate).toISOString();
  try {
    if (id) await api("/tasks/" + id, { method: "PATCH", body: JSON.stringify(body) });
    else await api("/tasks", { method: "POST", body: JSON.stringify(body) });
  } catch (err) {
    alert("Не удалось сохранить: " + err.message);
    return;
  }
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
function switchTab(tab) {
  adminTab = tab;
  document.querySelectorAll(".admin-tabs .tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  renderAdminTab();
}

async function renderAdminTab() {
  const c = document.getElementById("admin-view-content");
  c.innerHTML = "<div style='color:var(--text-muted)'>загрузка...</div>";
  try {
    if (adminTab === "users") c.innerHTML = await renderUsersTab();
    else if (adminTab === "mailboxes") c.innerHTML = await renderMailboxesTab();
    else if (adminTab === "rules") c.innerHTML = await renderRulesTab();
    else if (adminTab === "contacts") c.innerHTML = await renderContactsTab();
    else if (adminTab === "audit") c.innerHTML = await renderAuditTab();
    else if (adminTab === "analytics") c.innerHTML = await renderAnalyticsTab();
    else if (adminTab === "telegram") c.innerHTML = await renderTelegramTab();
    else if (adminTab === "tasksettings") c.innerHTML = await renderTaskSettingsTab();
    else if (adminTab === "personas") c.innerHTML = await renderPersonasTab();
    else if (adminTab === "sheets") c.innerHTML = await renderSheetsAdminTab();
  } catch (e) {
    c.innerHTML = '<div class="error">ошибка: ' + escapeHtml(e.message) + "</div>";
  }
}

async function renderUsersTab() {
  const users = await api("/admin/users");
  const roleColors = { owner: "#6366f1", admin: "#2563eb", manager: "#6b7280" };
  const cards = users.map((u) => `
    <div class="settings-card" style="display:flex;gap:14px;align-items:start">
      <div style="width:40px;height:40px;border-radius:50%;background:${roleColors[u.role] || "#6b7280"};display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:14px;flex-shrink:0">${escapeHtml((u.name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:600;font-size:14px">${escapeHtml(u.name)}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${roleColors[u.role]}22;color:${roleColors[u.role]};font-weight:500">${u.role}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escapeHtml(u.email)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${u.lastLoginAt ? "Последний вход: " + new Date(u.lastLoginAt).toLocaleString("ru") : "Ещё не входил"}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap">
        <button onclick="editUser('${u.id}','${escapeHtml(u.name)}','${u.role}')" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px" title="Редактировать">✏️</button>
        <button onclick="manageUserAccess('${u.id}','${escapeHtml(u.email)}','${u.role}')" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px" title="Доступ">🔑</button>
        <button onclick="adminDeleteUser('${u.id}')" style="padding:5px 8px;border:1px solid var(--danger);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px;color:var(--danger)" title="Удалить">✕</button>
      </div>
    </div>
  `).join("");
  return `
    ${cards}
    <div class="settings-card">
      <div class="settings-card-title">+ Новый пользователь</div>
      <form onsubmit="adminCreateUser(event)" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px;color:var(--text-muted)">Email<input type="email" name="email" placeholder="user@example.com" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px;color:var(--text-muted)">Пароль<input type="password" name="password" placeholder="мин. 4 символа" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px;color:var(--text-muted)">Имя<input name="name" placeholder="Иванов Иван" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px;color:var(--text-muted)">Роль<select name="role" style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"><option value="manager">manager</option><option value="admin">admin</option><option value="owner">owner</option></select></label>
        <button type="submit" style="grid-column:span 2;padding:10px;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px">Добавить</button>
      </form>
    </div>
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
  const [allMailboxes, assignedMb, allCompanies, assignedCo] = await Promise.all([
    api("/admin/mailboxes"),
    api("/admin/users/" + userId + "/mailboxes"),
    api("/companies").catch(() => []),
    api("/admin/users/" + userId + "/companies").catch(() => []),
  ]);
  const mbSet = new Set(assignedMb);
  const coSet = new Set(assignedCo);
  const mbList = allMailboxes
    .map((mb) => `<label style="display:block;padding:4px 0"><input type="checkbox" data-mb="${mb.id}" ${mbSet.has(mb.id) ? "checked" : ""}> ${escapeHtml(mb.displayName)} (${escapeHtml(mb.email)})</label>`)
    .join("");
  const coList = allCompanies
    .map((co) => `<label style="display:block;padding:4px 0"><input type="checkbox" data-co="${co.id}" ${coSet.has(co.id) ? "checked" : ""}> ${escapeHtml(co.name)}${co.inn ? " (ИНН " + escapeHtml(co.inn) + ")" : ""}</label>`)
    .join("");
  const c = document.getElementById("admin-view-content");
  c.innerHTML = `
    <h4 style="margin-top:0">Доступ: ${escapeHtml(email)} (${escapeHtml(role)})</h4>
    ${role !== "owner" ? `
      <div class="settings-card">
        <div class="settings-card-title">📧 Ящики</div>
        <p style="margin:0 0 8px">Отметьте ящики к которым у пользователя есть доступ. Без галочек — почта не видна.</p>
        <div id="access-mb-list">${mbList || "<span style='color:var(--text-muted)'>нет ящиков</span>"}</div>
      </div>
    ` : ""}
    ${role !== "owner" ? `
      <div class="settings-card">
        <div class="settings-card-title">💰 Компании (финансы)</div>
        <p style="margin:0 0 8px">Отметьте компании которые пользователь может видеть. Без галочек — финансы не видны.</p>
        <div id="access-co-list">${coList || "<span style='color:var(--text-muted)'>нет компаний</span>"}</div>
      </div>
    ` : '<p style="color:var(--text-muted)">Owner имеет полный доступ ко всему.</p>'}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button onclick="saveAccess('${userId}')" style="padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600">Сохранить</button>
      <button onclick="renderAdminTab()" style="padding:10px 20px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:var(--bg)">← Назад</button>
    </div>
  `;
}

async function saveAccess(userId) {
  const mbIds = [...document.querySelectorAll('#access-mb-list input[type=checkbox]:checked')].map((c) => c.dataset.mb);
  const coIds = [...document.querySelectorAll('#access-co-list input[type=checkbox]:checked')].map((c) => c.dataset.co);
  await Promise.all([
    api("/admin/users/" + userId + "/mailboxes", { method: "PUT", body: JSON.stringify({ mailboxIds: mbIds }) }),
    api("/admin/users/" + userId + "/companies", { method: "PUT", body: JSON.stringify({ companyIds: coIds }) }).catch(() => {}),
  ]);
  renderAdminTab();
}

async function adminDeleteUser(id) {
  if (!confirm("Удалить пользователя?")) return;
  await api("/admin/users/" + id, { method: "DELETE" });
  renderAdminTab();
}

async function renderMailboxesTab() {
  const list = await api("/admin/mailboxes");
  const cards = list.map((m) => `
    <div class="settings-card" style="display:flex;gap:14px;align-items:center">
      <div style="width:40px;height:40px;border-radius:50%;background:${m.enabled ? "#10b981" : "#9ca3af"};display:flex;align-items:center;justify-content:center;color:white;font-size:18px;flex-shrink:0">📧</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px">${escapeHtml(m.displayName)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(m.email)}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
        <label class="toggle-switch"><input type="checkbox" ${m.enabled ? "checked" : ""} onchange="adminToggleMailbox('${m.id}', this.checked)"><span class="slider"></span></label>
        <button onclick="renameMailbox('${m.id}', ${JSON.stringify(m.displayName).replace(/"/g,'&quot;')})" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px">✏️</button>
        <button onclick="adminDeleteMailbox('${m.id}')" style="padding:5px 8px;border:1px solid var(--danger);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px;color:var(--danger)">✕</button>
      </div>
    </div>
  `).join("");
  return `
    ${cards}
    <div class="settings-card">
      <div class="settings-card-title">+ Новый ящик</div>
      <form onsubmit="adminCreateMailbox(event)" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px;color:var(--text-muted)">Email<input type="email" name="email" placeholder="user@mail.ru" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px;color:var(--text-muted)">Название<input name="displayName" placeholder="Основной" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px;color:var(--text-muted);grid-column:span 2">Пароль приложения<input type="password" name="appPassword" placeholder="из настроек почты" required style="display:block;width:100%;padding:8px 10px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box"></label>
        <button type="submit" style="grid-column:span 2;padding:10px;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px">Добавить</button>
      </form>
    </div>
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
    <div class="settings-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <span style="color:var(--text-muted);font-size:13px">${list.length} контактов</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button onclick="scanContactsHistory()" style="padding:8px 14px;background:var(--bg-alt);color:var(--text);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:12px">🔄 Перебрать историю</button>
        <a href="/admin/contacts/export.csv" download style="padding:8px 14px;background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-size:12px;font-weight:500">⬇ CSV</a>
      </div>
    </div>
    <div class="settings-card" style="padding:0;overflow:hidden">
      <table class="admin-table"><thead><tr><th style="padding:10px 12px">Email</th><th style="padding:10px 12px">Имя</th><th style="padding:10px 12px">Кол-во</th><th style="padding:10px 12px">Последнее</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    </div>
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

  // Summary metrics
  const totalSessions = list.reduce((s, u) => s + u.sessionCount, 0);
  const totalHours = list.reduce((s, u) => s + parseFloat(u.totalSessionHours || 0), 0);
  const totalSent = list.reduce((s, u) => s + u.sent, 0);
  const activeUsers = list.filter(u => u.sessionCount > 0).length;

  // User cards
  const roleColors = { owner: "#6366f1", admin: "#2563eb", manager: "#6b7280" };
  const userCards = list.map((u) => {
    const inactive = u.inactiveDays !== null && u.inactiveDays > 7;
    return `
      <div class="settings-card" style="display:flex;gap:14px;align-items:start;${inactive ? "border-left:3px solid var(--danger);" : ""}">
        <div style="width:40px;height:40px;border-radius:50%;background:${roleColors[u.role] || "#6b7280"};display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:14px;flex-shrink:0">${escapeHtml((u.name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:600;font-size:14px">${escapeHtml(u.name)}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${roleColors[u.role]}22;color:${roleColors[u.role]}">${u.role}</span>
            ${inactive ? `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:#ef444422;color:#ef4444">неактивен ${u.inactiveDays} дн</span>` : ""}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${escapeHtml(u.email)}</div>
          <div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">
            <div style="text-align:center"><div style="font-size:18px;font-weight:600">${u.sessionCount}</div><div style="font-size:10px;color:var(--text-muted)">сессий</div></div>
            <div style="text-align:center"><div style="font-size:18px;font-weight:600">${u.totalSessionHours}ч</div><div style="font-size:10px;color:var(--text-muted)">время</div></div>
            <div style="text-align:center"><div style="font-size:18px;font-weight:600;color:var(--accent)">${u.sent}</div><div style="font-size:10px;color:var(--text-muted)">отправл.</div></div>
            <div style="text-align:center"><div style="font-size:18px;font-weight:600">${u.deleted}</div><div style="font-size:10px;color:var(--text-muted)">удалено</div></div>
            <div style="text-align:center"><div style="font-size:18px;font-weight:600">${u.avgResponseHours !== null ? u.avgResponseHours + "ч" : "—"}</div><div style="font-size:10px;color:var(--text-muted)">ответ</div></div>
            <div style="text-align:center"><div style="font-size:18px;font-weight:600">${u.aiUsageRatio}%</div><div style="font-size:10px;color:var(--text-muted)">AI</div></div>
          </div>
          ${u.lastLoginAt ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Последний вход: ${new Date(u.lastLoginAt).toLocaleString("ru")}</div>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // Leaderboard (only if data)
  const lbFiltered = leaderboard.filter((l) => Number(l.sent) > 0);

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:16px">
      <div class="settings-card" style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--accent)">${activeUsers}</div><div style="font-size:11px;color:var(--text-muted)">активных</div></div>
      <div class="settings-card" style="text-align:center"><div style="font-size:24px;font-weight:700">${totalSessions}</div><div style="font-size:11px;color:var(--text-muted)">сессий</div></div>
      <div class="settings-card" style="text-align:center"><div style="font-size:24px;font-weight:700">${totalHours.toFixed(1)}ч</div><div style="font-size:11px;color:var(--text-muted)">часов</div></div>
      <div class="settings-card" style="text-align:center"><div style="font-size:24px;font-weight:700;color:#10b981">${totalSent}</div><div style="font-size:11px;color:var(--text-muted)">отправлено</div></div>
    </div>
    ${lbFiltered.length ? `
      <div class="settings-card" style="margin-bottom:16px">
        <div class="settings-card-title">🏆 Лидерборд за 7 дней</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${lbFiltered.slice(0,5).map((l, i) => `<div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:18px;font-weight:700;color:${i===0?"#f59e0b":i===1?"#9ca3af":i===2?"#b45309":"var(--text)"}">${i+1}</span>
            <div><div style="font-size:13px;font-weight:500">${escapeHtml(l.email)}</div><div style="font-size:11px;color:var(--text-muted)">${Number(l.sent)} писем</div></div>
          </div>`).join("")}
        </div>
      </div>
    ` : ""}
    ${maxV > 0 ? `<div class="settings-card" style="overflow-x:auto;margin-bottom:16px"><div class="settings-card-title">📊 Активность отправки за 30 дней</div>${hmHtml}</div>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="font-size:13px;font-weight:500">По пользователям</span>
      <button onclick="exportAnalyticsCSV()" style="padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:12px">📊 CSV</button>
    </div>
    ${userCards}
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
  const [list, users] = await Promise.all([api("/admin/audit?limit=200"), api("/admin/users")]);
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name || u.email]));
  const actionLabels = {
    "auth.login": "Вход",
    "auth.logout": "Выход",
    "message.send": "Отправка",
    "message.delete": "Удаление",
    "message.summarize": "AI саммари",
    "message.ai_reply": "AI ответ",
    "task.update": "Задача",
  };
  function fmtDetails(d) {
    if (!d || !Object.keys(d).length) return "";
    const parts = [];
    if (d.subject) parts.push(d.subject);
    if (d.to) parts.push("→ " + (Array.isArray(d.to) ? d.to.join(", ") : d.to));
    if (d.taskId) parts.push("задача");
    if (d.changes) {
      const ch = d.changes;
      parts.push(Object.entries(ch).map(([k,v]) => k + ": " + v).join(", "));
    }
    if (d.messageId && !parts.length) parts.push("msg");
    if (!parts.length) return JSON.stringify(d).slice(0, 80);
    return parts.join(" · ");
  }
  const rows = list.map((a) => `<tr>
    <td style="white-space:nowrap;font-size:12px">${new Date(a.createdAt).toLocaleString("ru",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
    <td style="font-size:12px">${escapeHtml(userMap[a.userId] || "—")}</td>
    <td style="font-size:12px">${escapeHtml(actionLabels[a.action] || a.action)}</td>
    <td style="font-size:12px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(fmtDetails(a.details))}</td>
  </tr>`).join("");
  return `<table class="admin-table"><thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Детали</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function renderTelegramTab() {
  const [chats, bindings, users] = await Promise.all([
    api("/admin/tg-chats"),
    api("/admin/tg-bindings"),
    api("/admin/users"),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  // Chat cards
  const chatCards = chats.map((c) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:36px;height:36px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;color:white;font-size:16px;flex-shrink:0">💬</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:500;font-size:13px">${escapeHtml(c.name)}</div>
        <div style="font-size:11px;color:var(--text-muted);font-family:monospace">${escapeHtml(c.chatId)}</div>
      </div>
      <button onclick="adminDeleteTgChat('${escapeHtml(c.chatId)}')" style="padding:4px 8px;border:1px solid var(--danger);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px;color:var(--danger)">✕</button>
    </div>
  `).join("");

  // Binding cards
  const bindingCards = bindings.map((b) => {
    const u = userMap[b.userId];
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="width:36px;height:36px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;color:white;font-size:14px;flex-shrink:0">${u ? escapeHtml((u.name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()) : "?"}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:13px">${u ? escapeHtml(u.name) : "<i>удалён</i>"} <span style="color:var(--text-muted);font-size:11px">${u ? escapeHtml(u.email) : ""}</span></div>
          <div style="font-size:11px;color:var(--text-muted)">ID: ${escapeHtml(b.tgUserId)} ${b.tgUsername ? " · @" + escapeHtml(b.tgUsername) : ""}</div>
        </div>
        <button onclick="adminDeleteTgBinding('${b.userId}')" style="padding:4px 8px;border:1px solid var(--danger);border-radius:6px;background:var(--bg);cursor:pointer;font-size:11px;color:var(--danger)">✕</button>
      </div>
    `;
  }).join("");

  const userOptions = users.map((u) => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join("");

  return `
    <div class="settings-card">
      <div class="settings-card-title">💬 Чаты для задач</div>
      <p style="margin:0 0 10px">Группы где @task_crm_bot принимает #task / #задача и создаёт задачи.</p>
      ${chatCards || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">нет чатов</div>'}
      <form onsubmit="adminCreateTgChat(event)" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <input type="text" name="chatId" placeholder="chat_id (-100...)" required style="flex:1;min-width:140px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px">
        <input type="text" name="name" placeholder="название группы" required style="flex:1;min-width:140px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px">
        <button type="submit" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500">+ Чат</button>
      </form>
    </div>

    <div class="settings-card">
      <div class="settings-card-title">🔗 Привязки пользователей</div>
      <p style="margin:0 0 10px">Связь CRM-юзера с Telegram-аккаунтом. Нужна для назначения задач через @username, уведомлений и утреннего дайджеста. ID и @username можно узнать через @userinfobot.</p>
      ${bindingCards || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">нет привязок</div>'}
      <form onsubmit="adminCreateTgBinding(event)" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <select name="userId" required style="flex:1;min-width:140px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px"><option value="">— пользователь —</option>${userOptions}</select>
        <input type="text" name="tgUserId" placeholder="tg user_id" required style="width:120px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px">
        <input type="text" name="tgUsername" placeholder="@username" style="width:120px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px">
        <button type="submit" style="padding:8px 16px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500">+ Связать</button>
      </form>
    </div>
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
    <form style="display:flex;flex-direction:column;gap:0;max-width:640px" onsubmit="saveTaskSettings(event)">

      <div class="settings-card">
        <div class="settings-card-title">✉️ Отправка</div>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <label class="toggle-switch"><input name="email_sending_enabled" type="checkbox" ${s.email_sending_paused !== "true" ? "checked" : ""}><span class="slider"></span></label>
          Отправка писем
        </label>
        <label style="display:flex;align-items:center;gap:10px">
          <label class="toggle-switch"><input name="tg_notifications_enabled" type="checkbox" ${s.tg_notifications_paused !== "true" ? "checked" : ""}><span class="slider"></span></label>
          Уведомления в Telegram
        </label>
        <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <label class="toggle-switch"><input name="ai_summary_enabled" type="checkbox" ${s.ai_summary_enabled !== "false" ? "checked" : ""}><span class="slider"></span></label>
          AI краткое содержание писем
        </label>
        <p>Галка включена — письма отправляются, TG-уведомления приходят. Выключено — на паузе.</p>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">🏦 ВТБ Host-to-Host</div>
        <label>CustID<input type="text" name="vtb_cust_id" value="${escapeHtml(s.vtb_cust_id || "")}" placeholder="662875628"></label>
        <label>Логин ВТБ Бизнес<input type="text" name="vtb_login" value="${escapeHtml(s.vtb_login || "")}" placeholder="логин"></label>
        <label>Пароль ВТБ Бизнес<input type="password" name="vtb_password" value="${escapeHtml(s.vtb_password || "")}" placeholder="пароль"></label>
        <p>Используются сервером для H2H авторизации вместе с сертификатом КЭП.</p>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">🏷 Метки задач</div>
        <label>Список меток (через запятую)<input type="text" name="task_labels" value="${escapeHtml(s.task_labels || "")}" placeholder="электричество, планировки, арендаторы"></label>
        <p>Появятся в выпадающем списке при создании задачи и как фильтр в «Поставлено мной».</p>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">⏰ Утренний дайджест</div>
        <label>Час МСК (0-23)<input type="number" name="digest_hour_msk" min="0" max="23" value="${escapeHtml(s.digest_hour_msk || "9")}" style="width:100px"></label>
        <p>Каждое утро task-бот шлёт каждому юзеру с TG-привязкой список открытых задач.</p>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">📧 AI: задачи из писем</div>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <label class="toggle-switch"><input name="ai_email_detect_enabled" type="checkbox" ${s.ai_email_detect_enabled === "true" ? "checked" : ""}><span class="slider"></span></label>
          AI смотрит каждое входящее и предлагает создать задачу
        </label>
        <label>Кому слать предложения
          <select name="email_ai_notify_user_id">
            <option value="">— никто —</option>
            ${userOptions(s.email_ai_notify_user_id)}
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <label class="toggle-switch"><input name="ai_autoclose_enabled" type="checkbox" ${s.ai_autoclose_enabled === "true" ? "checked" : ""}><span class="slider"></span></label>
          Автозакрытие — AI спрашивает «Закрыть задачу N?»
        </label>
        <p>Claude Haiku, уверенность ≥60%. Кнопки в TG: создать / игнор.</p>
      </div>

      <div class="settings-card">
        <div class="settings-card-title">🏗 Авто-задачи из metr</div>
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <label class="toggle-switch"><input name="metr_deadline_enabled" type="checkbox" ${s.metr_deadline_enabled === "true" ? "checked" : ""}><span class="slider"></span></label>
          Создавать задачи на ближайшие выкупы (8:00 МСК)
        </label>
        <label>За сколько дней до даты выкупа<input type="number" name="metr_deadline_lead_days" min="1" max="30" value="${escapeHtml(s.metr_deadline_lead_days || "3")}" style="width:100px"></label>
        <label>Назначать на
          <select name="metr_default_assignee_user_id">
            <option value="">— не назначать —</option>
            ${userOptions(s.metr_default_assignee_user_id)}
          </select>
        </label>
        <p>Источник: metr.Object.buyback_date. Дубли не создаёт.</p>
      </div>

      <button type="submit" style="padding:12px 24px;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;align-self:flex-start;margin-top:4px">Сохранить</button>
    </form>


  `;
}

async function renderPersonasTab() {
  const list = await api("/personas");
  const cards = list.map((p) => `
    <div class="settings-card" style="display:flex;gap:16px;align-items:start">
      <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;font-weight:600;font-size:16px;flex-shrink:0">${escapeHtml((p.name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;margin-bottom:4px">${escapeHtml(p.name)}</div>
        <div style="font-size:12px;color:var(--text-muted);white-space:pre-wrap;line-height:1.5">${escapeHtml(p.signature)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="editPersona('${p.id}')" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px">✏️</button>
        <button onclick="deletePersona('${p.id}')" style="padding:6px 10px;border:1px solid var(--danger);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px;color:var(--danger)">✕</button>
      </div>
    </div>
  `).join("");
  return `
    <p style="color:var(--text-muted);font-size:12px;margin:0 0 16px">Подписи-визитки для писем. Выбираются в селекте «От имени» при написании письма.</p>
    ${cards || '<div class="settings-card" style="text-align:center;color:var(--text-muted)">Пока нет сотрудников</div>'}
    <div class="settings-card">
      <div class="settings-card-title">+ Новый сотрудник</div>
      <form onsubmit="adminCreatePersona(event)" style="display:flex;flex-direction:column;gap:10px">
        <label style="font-size:12px;color:var(--text-muted)">Имя
          <input type="text" name="name" placeholder="Ольга Иванова" required style="display:block;width:100%;padding:10px 12px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px;box-sizing:border-box">
        </label>
        <label style="font-size:12px;color:var(--text-muted)">Визитка
          <textarea name="signature" rows="5" placeholder="С уважением,&#10;Ольга Иванова&#10;менеджер по аренде&#10;+7 (xxx) xxx-xx-xx&#10;olya@example.com" required style="display:block;width:100%;padding:10px 12px;margin-top:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-family:inherit;font-size:13px;box-sizing:border-box;resize:vertical"></textarea>
        </label>
        <button type="submit" style="align-self:flex-start;padding:10px 20px;background:var(--accent);color:white;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px">Добавить</button>
      </form>
    </div>
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
    vtb_cust_id: String(f.get("vtb_cust_id") || ""),
    vtb_login: String(f.get("vtb_login") || ""),
    vtb_password: String(f.get("vtb_password") || ""),
    task_labels: String(f.get("task_labels") || ""),
    digest_hour_msk: String(f.get("digest_hour_msk") || "9"),
    email_sending_paused: e.target.email_sending_enabled.checked ? "false" : "true",
    tg_notifications_paused: e.target.tg_notifications_enabled.checked ? "false" : "true",
    ai_email_detect_enabled: e.target.ai_email_detect_enabled.checked ? "true" : "false",
    ai_autoclose_enabled: e.target.ai_autoclose_enabled.checked ? "true" : "false",
    email_ai_notify_user_id: String(f.get("email_ai_notify_user_id") || ""),
    metr_deadline_enabled: e.target.metr_deadline_enabled.checked ? "true" : "false",
    metr_deadline_lead_days: String(f.get("metr_deadline_lead_days") || "3"),
    metr_default_assignee_user_id: String(f.get("metr_default_assignee_user_id") || ""),
    ai_summary_enabled: e.target.ai_summary_enabled ? (e.target.ai_summary_enabled.checked ? "true" : "false") : "true",
  };
  await api("/admin/task-settings", { method: "PUT", body: JSON.stringify(payload) });
  alert("Сохранено");
}

async function renderSheetsAdminTab() {
  const s = await api("/admin/task-settings").catch(() => ({}));
  let links = [];
  try { links = JSON.parse(s.quick_links || "[]"); } catch {}
  let rows = links.map((l, i) => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input type="text" name="ql_name_${i}" value="${escapeHtml(l.name)}" placeholder="Название" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:13px">
      <input type="text" name="ql_url_${i}" value="${escapeHtml(l.url)}" placeholder="https://..." style="flex:2;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);color:var(--text);font-size:12px">
      <button type="button" onclick="removeQuickLink(${i})" style="padding:6px 10px;border:1px solid var(--danger);border-radius:6px;background:var(--bg);color:var(--danger);cursor:pointer;font-size:12px">✕</button>
    </div>
  `).join("");
  return `
    <form id="quick-links-form" onsubmit="saveQuickLinks(event)">
      <div style="margin-bottom:14px">${rows || '<div style="color:var(--text-muted)">Нет ссылок</div>'}</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button type="button" onclick="addQuickLink()" style="padding:8px 16px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);cursor:pointer;font-size:13px">+ Добавить</button>
        <button type="submit" style="padding:8px 20px;background:var(--accent);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">Сохранить</button>
      </div>
    </form>
  `;
}

async function addQuickLink() {
  const s = await api("/admin/task-settings").catch(() => ({}));
  let links = [];
  try { links = JSON.parse(s.quick_links || "[]"); } catch {}
  links.push({ name: "Новая таблица", url: "" });
  await api("/admin/task-settings", { method: "PUT", body: JSON.stringify({ quick_links: JSON.stringify(links) }) });
  renderAdminTab();
}

async function removeQuickLink(idx) {
  const s = await api("/admin/task-settings").catch(() => ({}));
  let links = [];
  try { links = JSON.parse(s.quick_links || "[]"); } catch {}
  links.splice(idx, 1);
  await api("/admin/task-settings", { method: "PUT", body: JSON.stringify({ quick_links: JSON.stringify(links) }) });
  await loadQuickLinks();
  renderAdminTab();
}

async function saveQuickLinks(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const links = [];
  for (let i = 0; ; i++) {
    const name = f.get("ql_name_" + i);
    const url = f.get("ql_url_" + i);
    if (name === null || url === null) break;
    links.push({ name: String(name), url: String(url) });
  }
  await api("/admin/task-settings", { method: "PUT", body: JSON.stringify({ quick_links: JSON.stringify(links) }) });
  await loadQuickLinks();
  alert("Таблицы сохранены");
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
    app.style.gridTemplateColumns = `56px var(--sidebar-w, 220px) 4px ${listW}px 4px 1fr`;
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
