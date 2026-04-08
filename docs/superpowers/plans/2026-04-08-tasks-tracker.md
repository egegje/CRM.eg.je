# Task Tracker MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a task-tracker subsystem to crm.eg.je: Postgres-backed CRUD, Telegram bot capture from groups, daily digest, email↔task sync.

**Architecture:** Extend existing `apps/api` (Fastify + Prisma + Postgres). New tables Task/TaskComment/TaskTag/Project/TgTaskChat/TgUserBinding. Reuse existing auth, ACL, audit. New Telegram bot (token 8713495502) runs as a second polling worker in `crm-workers` service. New `/tasks` UI tab in static `apps/api/public/`. AI parsing uses existing Anthropic SDK with Claude Haiku 4.5.

**Tech Stack:** Node 22 + Fastify + Prisma + Postgres 16 + grammy-style raw fetch + Anthropic SDK + vanilla JS UI.

**Spec discussion:** captured in this conversation; user confirmed all 8 questions on 2026-04-08.

---

## File Structure

```
/opt/crm.eg.je/
├── packages/db/prisma/schema.prisma           # +6 models
├── packages/db/prisma/migrations/<ts>_tasks/  # SQL migration
├── apps/api/src/
│   ├── routes/
│   │   ├── tasks.ts                           # CRUD + comments + bulk
│   │   ├── projects.ts                        # CRUD + sync from metr
│   │   └── tg-bindings.ts                     # admin: link @username → user
│   ├── services/
│   │   ├── tasks.ts                           # business logic, AI parsing
│   │   └── metr-sync.ts                       # fetch metr objects → projects
│   ├── workers/
│   │   ├── task-bot.ts                        # NEW second TG bot polling loop
│   │   └── morning-digest.ts                  # daily 9am cron
│   └── server.ts                              # register new routes
├── apps/api/public/
│   ├── index.html                             # add Tasks tab + modals
│   └── app.js                                 # add Tasks render+CRUD funcs
└── docs/superpowers/plans/2026-04-08-tasks-tracker.md
```

---

## Task 1: DB schema (Prisma + raw SQL migration)

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260408140000_tasks/migration.sql`

- [ ] **Step 1: Add models to schema.prisma** (append before model AuditLog)

```prisma
enum TaskStatus { open in_progress done cancelled }
enum TaskPriority { low normal high urgent }

model Project {
  id          String   @id @default(cuid())
  name        String
  source      String   @default("manual") // manual | metr
  externalId  String?
  notes       String?
  createdAt   DateTime @default(now())
  tasks       Task[]
}

model Task {
  id           String       @id @default(cuid())
  title        String
  description  String?
  assigneeId   String?
  creatorId    String
  projectId    String?
  dueDate      DateTime?
  priority     TaskPriority @default(normal)
  status       TaskStatus   @default(open)
  category     String?
  sourceEmailMessageId String?
  sourceTgChatId String?
  sourceTgMessageId Int?
  createdAt    DateTime     @default(now())
  completedAt  DateTime?
  project      Project?     @relation(fields: [projectId], references: [id])
  comments     TaskComment[]
  tagAssignments TaskTagAssignment[]

  @@index([assigneeId, status])
  @@index([dueDate, status])
  @@index([projectId])
}

model TaskComment {
  id        String   @id @default(cuid())
  taskId    String
  userId    String
  text      String
  createdAt DateTime @default(now())
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
}

model TaskTag {
  id    String @id @default(cuid())
  name  String @unique
  color String @default("#3b82f6")
  assignments TaskTagAssignment[]
}

model TaskTagAssignment {
  taskId String
  tagId  String
  task   Task    @relation(fields: [taskId], references: [id], onDelete: Cascade)
  tag    TaskTag @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([taskId, tagId])
}

model TgTaskChat {
  chatId    BigInt   @id
  name      String
  addedAt   DateTime @default(now())
}

model TgUserBinding {
  userId     String  @id
  tgUserId   BigInt  @unique
  tgUsername String?
}

model TaskSetting {
  key   String @id
  value String
}
```

- [ ] **Step 2: Write migration SQL**

```sql
-- migration.sql
CREATE TYPE "TaskStatus" AS ENUM ('open','in_progress','done','cancelled');
CREATE TYPE "TaskPriority" AS ENUM ('low','normal','high','urgent');

CREATE TABLE "Project" (
  id text PRIMARY KEY,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  "externalId" text,
  notes text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "Task" (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  "assigneeId" text,
  "creatorId" text NOT NULL,
  "projectId" text REFERENCES "Project"(id),
  "dueDate" timestamptz,
  priority "TaskPriority" NOT NULL DEFAULT 'normal',
  status "TaskStatus" NOT NULL DEFAULT 'open',
  category text,
  "sourceEmailMessageId" text,
  "sourceTgChatId" text,
  "sourceTgMessageId" int,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
CREATE INDEX "Task_assignee_status_idx" ON "Task"("assigneeId", status);
CREATE INDEX "Task_due_status_idx" ON "Task"("dueDate", status);
CREATE INDEX "Task_project_idx" ON "Task"("projectId");

CREATE TABLE "TaskComment" (
  id text PRIMARY KEY,
  "taskId" text NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
  "userId" text NOT NULL,
  text text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "TaskTag" (
  id text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6'
);

CREATE TABLE "TaskTagAssignment" (
  "taskId" text NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
  "tagId" text NOT NULL REFERENCES "TaskTag"(id) ON DELETE CASCADE,
  PRIMARY KEY ("taskId", "tagId")
);

CREATE TABLE "TgTaskChat" (
  "chatId" bigint PRIMARY KEY,
  name text NOT NULL,
  "addedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "TgUserBinding" (
  "userId" text PRIMARY KEY,
  "tgUserId" bigint UNIQUE NOT NULL,
  "tgUsername" text
);

CREATE TABLE "TaskSetting" (
  key text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO "TaskSetting" (key, value) VALUES ('digest_hour_msk', '9') ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Apply migration + regen client**

```bash
cd /opt/crm.eg.je
DATABASE_URL=postgresql://crm:crm@localhost:5432/crm pnpm --filter @crm/db exec prisma generate
PGPASSWORD=crm psql -h localhost -U crm -d crm -f packages/db/prisma/migrations/20260408140000_tasks/migration.sql
PGPASSWORD=crm psql -h localhost -U crm -d crm -c "INSERT INTO _prisma_migrations VALUES ('20260408140000_tasks','manual',now(),'20260408140000_tasks',null,null,now(),1) ON CONFLICT DO NOTHING;"
```

- [ ] **Step 4: Commit**

```bash
git add packages/db && git commit -m "feat(db): tasks tracker schema (Task, Project, comments, tags, tg bindings)"
```

---

## Task 2: Settings env + token

**Files:**
- Modify: `/etc/crm/secrets.env`
- Modify: `apps/api/src/config.ts`

- [ ] **Step 1: Add task bot token to secrets**

```bash
echo 'TASK_BOT_TOKEN=8713495502:AAEU7HKj6ddtzCfr01-vU0VDMvnTRs4IDd4' | sudo tee -a /etc/crm/secrets.env
```

- [ ] **Step 2: Add to config schema**

```ts
// In Schema:
TASK_BOT_TOKEN: z.string().optional(),

// In Config type:
taskBotToken?: string;

// In return:
taskBotToken: p.TASK_BOT_TOKEN,
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @crm/api build
git add . && git commit -m "config: TASK_BOT_TOKEN"
```

---

## Task 3: REST API for projects + sync from metr

**Files:**
- Create: `apps/api/src/routes/projects.ts`
- Create: `apps/api/src/services/metr-sync.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: services/metr-sync.ts**

```ts
import { prisma } from "@crm/db";
import pg from "pg";

const metrPool = new pg.Pool({ connectionString: "postgresql://crm:crm@localhost:5432/metr" });

export async function syncProjectsFromMetr(): Promise<{ created: number; total: number }> {
  const r = await metrPool.query('SELECT id, name FROM "Object" ORDER BY name');
  let created = 0;
  for (const row of r.rows) {
    const exists = await prisma.project.findFirst({ where: { source: "metr", externalId: row.id } });
    if (!exists) {
      await prisma.project.create({ data: { name: row.name, source: "metr", externalId: row.id } });
      created++;
    }
  }
  return { created, total: r.rows.length };
}
```

- [ ] **Step 2: routes/projects.ts**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser, requireRole } from "../auth.js";
import { NotFound } from "../errors.js";
import { syncProjectsFromMetr } from "../services/metr-sync.js";

const Params = z.object({ id: z.string() });

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/projects", { preHandler: requireUser() }, async () =>
    prisma.project.findMany({ orderBy: { name: "asc" } }),
  );

  app.post("/projects", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ name: z.string().min(1), notes: z.string().optional() }).parse(req.body);
    return prisma.project.create({ data: { name: body.name, source: "manual", notes: body.notes } });
  });

  app.delete("/projects/:id", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.project.delete({ where: { id } });
    return reply.status(204).send();
  });

  app.post("/projects/sync-metr", { preHandler: requireRole("owner", "admin") }, async () => {
    return syncProjectsFromMetr();
  });
}
```

- [ ] **Step 3: Register in server.ts**

```ts
import { projectRoutes } from "./routes/projects.js";
// ...
await app.register(projectRoutes);
```

- [ ] **Step 4: Add `pg` dep if missing**

```bash
cd /opt/crm.eg.je && grep -q '"pg"' apps/api/package.json || pnpm --filter @crm/api add pg @types/pg
```

- [ ] **Step 5: Build, run sync, commit**

```bash
pnpm --filter @crm/api build
sudo systemctl restart crm-api
sleep 2
curl -sS -b /tmp/c.txt -X POST http://127.0.0.1:3000/projects/sync-metr
git add . && git commit -m "feat(api): projects route + sync from metr"
```

---

## Task 4: REST API for tasks (CRUD)

**Files:**
- Create: `apps/api/src/routes/tasks.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: routes/tasks.ts (CRUD endpoints)**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { NotFound, BadRequest } from "../errors.js";
import { audit } from "../services/audit.js";

const Params = z.object({ id: z.string() });

const Create = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  priority: z.enum(["low","normal","high","urgent"]).default("normal"),
  category: z.string().optional(),
});

const Patch = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  priority: z.enum(["low","normal","high","urgent"]).optional(),
  status: z.enum(["open","in_progress","done","cancelled"]).optional(),
  category: z.string().optional(),
});

const ListQuery = z.object({
  assigneeId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(["open","in_progress","done","cancelled","all"]).optional(),
  priority: z.enum(["low","normal","high","urgent"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tasks", { preHandler: requireUser() }, async (req) => {
    const q = ListQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.assigneeId) where.assigneeId = q.assigneeId;
    if (q.projectId) where.projectId = q.projectId;
    if (q.priority) where.priority = q.priority;
    if (!q.status || q.status === "all") {
      // no filter
    } else {
      where.status = q.status;
    }
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: "insensitive" } },
        { description: { contains: q.search, mode: "insensitive" } },
      ];
    }
    return prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: q.limit,
      include: { project: true, comments: { orderBy: { createdAt: "asc" } }, tagAssignments: { include: { tag: true } } },
    });
  });

  app.get("/tasks/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const t = await prisma.task.findUnique({
      where: { id },
      include: { project: true, comments: { orderBy: { createdAt: "asc" } }, tagAssignments: { include: { tag: true } } },
    });
    if (!t) throw new NotFound();
    return t;
  });

  app.post("/tasks", { preHandler: requireUser() }, async (req) => {
    const body = Create.parse(req.body);
    const user = req.user!;
    const t = await prisma.task.create({
      data: { ...body, creatorId: user.id },
    });
    await audit(req, "task.create", { taskId: t.id, title: t.title });
    return t;
  });

  app.patch("/tasks/:id", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = Patch.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.status === "done") data.completedAt = new Date();
    if (body.status && body.status !== "done") data.completedAt = null;
    const t = await prisma.task.update({ where: { id }, data });
    await audit(req, "task.update", { taskId: id, changes: body });
    return t;
  });

  app.delete("/tasks/:id", { preHandler: requireUser() }, async (req, reply) => {
    const { id } = Params.parse(req.params);
    await prisma.task.delete({ where: { id } });
    await audit(req, "task.delete", { taskId: id });
    return reply.status(204).send();
  });

  // Comments
  app.post("/tasks/:id/comments", { preHandler: requireUser() }, async (req) => {
    const { id } = Params.parse(req.params);
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    const user = req.user!;
    return prisma.taskComment.create({ data: { taskId: id, userId: user.id, text: body.text } });
  });
}
```

- [ ] **Step 2: Register in server.ts**

```ts
import { taskRoutes } from "./routes/tasks.js";
await app.register(taskRoutes);
```

- [ ] **Step 3: Build + smoke test**

```bash
pnpm --filter @crm/api build
sudo systemctl restart crm-api
curl -sS -b /tmp/c.txt http://127.0.0.1:3000/tasks
git add . && git commit -m "feat(api): tasks CRUD routes"
```

---

## Task 5: Tasks UI tab

**Files:**
- Modify: `apps/api/public/index.html`
- Modify: `apps/api/public/app.js`

- [ ] **Step 1: Add Tasks tab button in sidebar**

In `index.html`, replace the system folders block addition or add a sidebar section:

```html
<div class="folder-group">
  <div class="folder-title">Задачи</div>
  <div class="folder-item" onclick="showTasksView()">✅ Все задачи</div>
  <div class="folder-item" onclick="showTasksView('me')">📌 Мои</div>
  <div class="folder-item" onclick="showTasksView('overdue')">⏰ Просроченные</div>
</div>
```

- [ ] **Step 2: Add task view container in main pane**

In `index.html` after the messages list section, add:

```html
<div id="tasks-view" class="hidden" style="padding:18px;overflow-y:auto">
  <div style="display:flex;justify-content:space-between;margin-bottom:14px">
    <h2 style="margin:0">Задачи</h2>
    <button class="primary" onclick="openTaskForm()">+ Задача</button>
  </div>
  <div id="tasks-list"></div>
</div>
```

- [ ] **Step 3: Add task modal form**

```html
<div id="task-form-modal" class="modal hidden">
  <div class="modal-box">
    <h3 id="task-form-title">Новая задача</h3>
    <form id="task-form" onsubmit="saveTask(event)">
      <input type="hidden" name="id">
      <label>Заголовок<input name="title" required></label>
      <label>Описание<textarea name="description" rows="3"></textarea></label>
      <label>Исполнитель<select name="assigneeId"><option value="">—</option></select></label>
      <label>Проект<select name="projectId"><option value="">—</option></select></label>
      <label>Дедлайн<input name="dueDate" type="datetime-local"></label>
      <label>Приоритет<select name="priority">
        <option value="low">низкий</option>
        <option value="normal" selected>обычный</option>
        <option value="high">высокий</option>
        <option value="urgent">срочный</option>
      </select></label>
      <label>Категория<input name="category"></label>
      <div class="compose-actions">
        <button type="button" onclick="closeModal('task-form-modal')">Отмена</button>
        <button type="submit">Сохранить</button>
      </div>
    </form>
  </div>
</div>
```

- [ ] **Step 4: app.js — render+CRUD funcs**

```js
let tasksFilter = null;
async function showTasksView(filter = null) {
  tasksFilter = filter;
  document.querySelector(".list-pane").classList.add("hidden");
  document.querySelector(".preview-pane").classList.add("hidden");
  document.getElementById("tasks-view").classList.remove("hidden");
  await loadTasks();
}

async function loadTasks() {
  const params = new URLSearchParams();
  if (tasksFilter === "me" && state.user) params.set("assigneeId", state.user.id);
  if (tasksFilter === "overdue") params.set("status", "open");
  params.set("limit", "200");
  let tasks = await api("/tasks?" + params.toString());
  if (tasksFilter === "overdue") {
    const now = new Date();
    tasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "done");
  }
  renderTasks(tasks);
}

function renderTasks(tasks) {
  const el = document.getElementById("tasks-list");
  if (!tasks.length) {
    el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">нет задач</div>';
    return;
  }
  el.innerHTML = tasks.map((t) => {
    const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "done";
    const prioColor = { urgent: "#ef4444", high: "#f59e0b", normal: "var(--text)", low: "var(--text-muted)" }[t.priority];
    return `<div class="msg-item" style="cursor:pointer;display:block" onclick="openTaskForm('${t.id}')">
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" ${t.status === "done" ? "checked" : ""} onclick="event.stopPropagation();toggleTaskDone('${t.id}', this.checked)">
        <div style="flex:1">
          <div style="font-weight:${t.status === "done" ? 400 : 600};text-decoration:${t.status === "done" ? "line-through" : "none"};color:${prioColor}">${escapeHtml(t.title)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
            ${t.project ? `📁 ${escapeHtml(t.project.name)} · ` : ""}
            ${t.dueDate ? `${overdue ? "⏰" : "📅"} ${new Date(t.dueDate).toLocaleDateString("ru")} · ` : ""}
            ${t.priority}
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function toggleTaskDone(id, done) {
  await api("/tasks/" + id, { method: "PATCH", body: JSON.stringify({ status: done ? "done" : "open" }) });
  loadTasks();
}

async function openTaskForm(id) {
  const f = document.getElementById("task-form");
  f.reset();
  // Populate selects
  const [users, projects] = await Promise.all([api("/admin/users").catch(() => []), api("/projects").catch(() => [])]);
  f.assigneeId.innerHTML = '<option value="">—</option>' + users.map((u) => `<option value="${u.id}">${escapeHtml(u.email)}</option>`).join("");
  f.projectId.innerHTML = '<option value="">—</option>' + projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (id) {
    const t = await api("/tasks/" + id);
    document.getElementById("task-form-title").textContent = "Редактировать";
    f.id.value = t.id;
    f.title.value = t.title;
    f.description.value = t.description || "";
    f.assigneeId.value = t.assigneeId || "";
    f.projectId.value = t.projectId || "";
    f.dueDate.value = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 16) : "";
    f.priority.value = t.priority;
    f.category.value = t.category || "";
  } else {
    document.getElementById("task-form-title").textContent = "Новая задача";
    f.id.value = "";
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
  loadTasks();
}
```

- [ ] **Step 5: Build + smoke test in browser + commit**

```bash
pnpm --filter @crm/api build
sudo systemctl restart crm-api
git add . && git commit -m "feat(ui): tasks tab with list, create, edit, complete"
```

---

## Task 6: Telegram task bot — capture from group

**Files:**
- Create: `apps/api/src/workers/task-bot.ts`
- Create: `apps/api/src/services/tasks.ts`
- Modify: `apps/api/src/workers.ts`

- [ ] **Step 1: services/tasks.ts — AI-powered task parsing**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";

const cfg = loadConfig();
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  if (cfg.anthropicApiKey) client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  else throw new Error("no anthropic key");
  return client;
}

export type ParsedTask = {
  title: string;
  description?: string;
  assigneeUsername?: string;
  dueDate?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  projectHint?: string;
};

const SYSTEM = `Ты разбираешь сообщения из рабочего чата на задачи. Дано сообщение и текущая дата.
Верни JSON: {"title", "description", "assigneeUsername" (без @), "dueDate" (ISO YYYY-MM-DD or null), "priority" (low/normal/high/urgent), "projectHint" (если упомянут объект)}.
Если не хватает данных — оставляй поля null. Title должен быть кратким (5-10 слов).`;

export async function parseTaskFromText(text: string, todayIso: string): Promise<ParsedTask> {
  const r = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: SYSTEM,
    messages: [{ role: "user", content: `Сегодня ${todayIso}. Сообщение:\n${text}` }],
  });
  const txt = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  try {
    const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { title: text.slice(0, 80) };
  }
}
```

- [ ] **Step 2: workers/task-bot.ts**

```ts
import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { parseTaskFromText } from "../services/tasks.js";

const cfg = loadConfig();
let offset = 0;

async function tg(method: string, body: unknown): Promise<unknown> {
  const r = await fetch(`https://api.telegram.org/bot${cfg.taskBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

type Update = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; title?: string };
    from: { id: number; username?: string; first_name?: string };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
  };
};

async function handleMessage(msg: NonNullable<Update["message"]>): Promise<void> {
  const text = msg.text || "";
  if (!text) return;
  // Trigger: contains #task OR mentions bot
  const isTask = /#task\b|#задача\b/i.test(text) || (msg.entities || []).some((e) => e.type === "mention" && text.slice(e.offset, e.offset + e.length).toLowerCase().includes("bot"));
  if (!isTask) return;

  // Verify chat is registered
  const chat = await prisma.tgTaskChat.findUnique({ where: { chatId: BigInt(msg.chat.id) } });
  if (!chat) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: "Этот чат не зарегистрирован для приёма задач. Админ должен добавить его в /admin/tg-chats",
    });
    return;
  }

  const cleanText = text.replace(/#task|#задача/gi, "").trim();
  const today = new Date().toISOString().slice(0, 10);
  let parsed;
  try {
    parsed = await parseTaskFromText(cleanText, today);
  } catch (e) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: "Не смог распарсить: " + (e as Error).message,
    });
    return;
  }

  // Resolve assignee from username if provided
  let assigneeId: string | null = null;
  if (parsed.assigneeUsername) {
    const binding = await prisma.tgUserBinding.findFirst({
      where: { tgUsername: parsed.assigneeUsername.toLowerCase() },
    });
    assigneeId = binding?.userId ?? null;
  }

  // Resolve project from hint
  let projectId: string | null = null;
  if (parsed.projectHint) {
    const proj = await prisma.project.findFirst({
      where: { name: { contains: parsed.projectHint, mode: "insensitive" } },
    });
    projectId = proj?.id ?? null;
  }

  // Find creator: TG user → User binding
  const creatorBinding = await prisma.tgUserBinding.findUnique({
    where: { tgUserId: BigInt(msg.from.id) },
  });
  const creatorId = creatorBinding?.userId;
  if (!creatorId) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: `Твой Telegram (@${msg.from.username || msg.from.first_name}) не привязан к юзеру в CRM. Админ должен привязать в /admin → TG bindings.`,
    });
    return;
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.title,
      description: parsed.description || cleanText,
      creatorId,
      assigneeId,
      projectId,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      priority: parsed.priority || "normal",
      sourceTgChatId: String(msg.chat.id),
      sourceTgMessageId: msg.message_id,
    },
  });

  await tg("setMessageReaction", { chat_id: msg.chat.id, message_id: msg.message_id, reaction: [{ type: "emoji", emoji: "✅" }] });
  await tg("sendMessage", {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text: `✅ Задача создана: <b>${escapeHtml(task.title)}</b>\nID: <code>${task.id}</code>${assigneeId ? "" : "\n⚠️ исполнитель не определён"}${task.dueDate ? `\nДедлайн: ${task.dueDate.toLocaleDateString("ru")}` : ""}`,
    parse_mode: "HTML",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function startTaskBot(): Promise<void> {
  if (!cfg.taskBotToken) return;
  console.log("task bot polling started");
  void (async function loop() {
    while (true) {
      try {
        const res = (await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] })) as { ok: boolean; result: Update[] };
        if (res?.ok && res.result) {
          for (const u of res.result) {
            offset = u.update_id + 1;
            if (u.message) await handleMessage(u.message).catch((e) => console.error("task bot:", (e as Error).message));
          }
        }
      } catch (e) {
        console.error("task bot poll:", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
}
```

- [ ] **Step 3: Wire into workers.ts**

```ts
import { startTaskBot } from "./workers/task-bot.js";
// ...
void startTaskBot();
```

- [ ] **Step 4: Build + restart + commit**

```bash
pnpm --filter @crm/api build
sudo systemctl restart crm-workers
git add . && git commit -m "feat(tg): task bot — captures #task messages from registered chats"
```

---

## Task 7: Admin endpoints for TG chats and bindings

**Files:**
- Create: `apps/api/src/routes/tg-bindings.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: routes/tg-bindings.ts**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@crm/db";
import { requireRole } from "../auth.js";

export async function tgBindingRoutes(app: FastifyInstance): Promise<void> {
  // TG chats
  app.get("/admin/tg-chats", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.tgTaskChat.findMany({ orderBy: { addedAt: "desc" } });
    return rows.map((r) => ({ ...r, chatId: r.chatId.toString() }));
  });

  app.post("/admin/tg-chats", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ chatId: z.string(), name: z.string() }).parse(req.body);
    return prisma.tgTaskChat.create({ data: { chatId: BigInt(body.chatId), name: body.name } });
  });

  app.delete("/admin/tg-chats/:chatId", { preHandler: requireRole("owner", "admin") }, async (req, reply) => {
    const { chatId } = z.object({ chatId: z.string() }).parse(req.params);
    await prisma.tgTaskChat.delete({ where: { chatId: BigInt(chatId) } });
    return reply.status(204).send();
  });

  // TG user bindings
  app.get("/admin/tg-bindings", { preHandler: requireRole("owner", "admin") }, async () => {
    const rows = await prisma.tgUserBinding.findMany();
    return rows.map((r) => ({ ...r, tgUserId: r.tgUserId.toString() }));
  });

  app.post("/admin/tg-bindings", { preHandler: requireRole("owner", "admin") }, async (req) => {
    const body = z.object({ userId: z.string(), tgUserId: z.string(), tgUsername: z.string().optional() }).parse(req.body);
    return prisma.tgUserBinding.upsert({
      where: { userId: body.userId },
      create: { userId: body.userId, tgUserId: BigInt(body.tgUserId), tgUsername: body.tgUsername?.toLowerCase() },
      update: { tgUserId: BigInt(body.tgUserId), tgUsername: body.tgUsername?.toLowerCase() },
    }).then((r) => ({ ...r, tgUserId: r.tgUserId.toString() }));
  });
}
```

- [ ] **Step 2: Register in server.ts**

```ts
import { tgBindingRoutes } from "./routes/tg-bindings.js";
await app.register(tgBindingRoutes);
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @crm/api build
git add . && git commit -m "feat(api): tg chat + user binding admin routes"
```

---

## Task 8: Morning digest cron

**Files:**
- Create: `apps/api/src/workers/morning-digest.ts`
- Modify: `apps/api/src/workers.ts`

- [ ] **Step 1: morning-digest.ts**

```ts
import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

async function tg(method: string, body: unknown): Promise<unknown> {
  const r = await fetch(`https://api.telegram.org/bot${cfg.taskBotToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function sendMorningDigest(): Promise<void> {
  const bindings = await prisma.tgUserBinding.findMany();
  for (const b of bindings) {
    const tasks = await prisma.task.findMany({
      where: { assigneeId: b.userId, status: { in: ["open", "in_progress"] } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      include: { project: true },
      take: 30,
    });
    if (!tasks.length) continue;
    const now = new Date();
    const lines: string[] = ["🌅 <b>Доброе утро! Открытые задачи:</b>", ""];
    for (const t of tasks) {
      const overdue = t.dueDate && t.dueDate < now;
      const due = t.dueDate ? ` · ${overdue ? "⏰" : "📅"} ${t.dueDate.toLocaleDateString("ru")}` : "";
      const proj = t.project ? ` · 📁 ${t.project.name}` : "";
      lines.push(`${overdue ? "🔴 " : "• "}${t.title}${due}${proj}`);
    }
    await tg("sendMessage", {
      chat_id: Number(b.tgUserId),
      text: lines.join("\n"),
      parse_mode: "HTML",
    }).catch((e) => console.error("digest:", e));
  }
}

export function startMorningDigestCron(): void {
  // Check every minute, fire at configured hour
  setInterval(async () => {
    const setting = await prisma.taskSetting.findUnique({ where: { key: "digest_hour_msk" } });
    const hour = parseInt(setting?.value || "9", 10);
    const now = new Date();
    const mskHour = (now.getUTCHours() + 3) % 24;
    if (mskHour === hour && now.getUTCMinutes() === 0) {
      sendMorningDigest().catch((e) => console.error(e));
    }
  }, 60_000);
}
```

- [ ] **Step 2: Wire into workers.ts**

```ts
import { startMorningDigestCron } from "./workers/morning-digest.js";
startMorningDigestCron();
```

- [ ] **Step 3: Build + restart + commit**

```bash
pnpm --filter @crm/api build
sudo systemctl restart crm-workers
git add . && git commit -m "feat(tg): morning digest cron sends per-user task list"
```

---

## Task 9: Email → task button in preview

**Files:**
- Modify: `apps/api/public/app.js`

- [ ] **Step 1: Add button in renderPreview**

In `renderPreview()`, add to preview-actions:

```js
<button onclick="emailToTask('${m.id}')">📋 → задача</button>
```

- [ ] **Step 2: Implement emailToTask**

```js
async function emailToTask(messageId) {
  const m = state.messages.find((x) => x.id === messageId) || (await api("/messages/" + messageId));
  // pre-fill task form
  openTaskForm();
  setTimeout(() => {
    const f = document.getElementById("task-form");
    f.title.value = m.subject || "(без темы)";
    f.description.value = `Из письма от ${m.fromAddr}:\n\n${(m.bodyText || "").slice(0, 1000)}`;
    f.querySelector("[name=sourceEmailMessageId]")?.remove();
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "sourceEmailMessageId";
    hidden.value = m.id;
    f.appendChild(hidden);
  }, 200);
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @crm/api build
git add . && git commit -m "feat(ui): email→task button in preview"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| DB schema for tasks | 1 |
| Task bot config token | 2 |
| Projects CRUD + metr sync | 3 |
| Tasks CRUD API | 4 |
| Tasks UI (list, create, edit, complete) | 5 |
| TG bot — capture #task from group | 6 |
| AI parsing of messages | 6 (services/tasks.ts) |
| Reply with task ID + reaction | 6 |
| Admin: TG chats whitelist | 7 |
| Admin: TG username → user binding | 7 |
| Morning digest cron | 8 |
| Email → task button | 9 |

Tasks NOT covered (deferred per scope):
- Voice messages
- AI auto-detect tasks in incoming emails (auto-prompt)
- AI auto-close tasks from emails
- /overdue, /me, /project bot commands (can be added in v2)
- Comment thread UI in task modal
- Tags UI
