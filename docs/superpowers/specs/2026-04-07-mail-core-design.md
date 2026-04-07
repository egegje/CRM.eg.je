# Mail Core (Subsystem 1) — Design Spec

**Project:** crm.eg.je — corporate email CRM
**Subsystem:** 1 of 5 (Mail Core)
**Date:** 2026-04-07
**Status:** Approved for planning

## 1. Purpose & Scope

Build the foundational mail engine for crm.eg.je: a backend service that
aggregates IMAP from multiple Mail.ru mailboxes, sends via SMTP through a
chosen mailbox, persists messages and attachments in Postgres, and exposes a
REST API for higher-level subsystems (web UI, admin panel, AI, Telegram bot,
audit log).

### In scope
- User accounts with role enum (owner/admin/manager) and password login.
  Role-based access checks are stubbed at the API layer; full admin UI is a
  later subsystem.
- Mailbox registry with encrypted Mail.ru app-passwords.
- IMAP sync (IDLE + periodic full-sync) for all enabled mailboxes.
- SMTP send through a selected mailbox.
- Folder model: system folders (inbox/sent/drafts/trash) per mailbox plus
  user-defined custom folders.
- Message CRUD: read/unread, star, move, soft-delete to trash, hard-delete
  after 30 days via cron.
- Drafts (auto-saved by client via PATCH).
- Scheduled send via BullMQ delayed jobs.
- Attachment storage on local disk.
- REST API covering all of the above.
- Integration tests with greenmail (IMAP/SMTP mock) and a real Postgres via
  testcontainers.

### Explicitly out of scope (future subsystems)
- Web UI (subsystem 2)
- Admin panel CRUD UI, audit log writes (subsystem 3)
- AI summarization of incoming mail (subsystem 4)
- Telegram bot notifications (subsystem 5)
- Auto-collection of contacts from incoming/outgoing mail (subsystem 3)
- Routing rules engine (subsystem 3)
- Real-time push to clients (WebSocket/SSE) — added with subsystem 2

## 2. Tech Stack

- **Runtime:** Node.js 22 + TypeScript (strict)
- **HTTP:** Fastify
- **DB:** Postgres 16, accessed via Prisma ORM
- **Queue / scheduler:** BullMQ on Redis (Redis added as a system dep)
- **IMAP:** ImapFlow
- **SMTP:** Nodemailer
- **Mail parsing:** mailparser
- **Auth:** session cookies, argon2id password hashing
- **Tests:** Vitest + @testcontainers/postgresql + greenmail (docker)
- **Deploy:** systemd units, nginx reverse proxy, certbot TLS on crm.eg.je

## 3. Repository Layout

```
/opt/crm.eg.je/
├── apps/
│   └── api/                  # Fastify HTTP server + workers entrypoints
│       ├── src/
│       │   ├── server.ts     # Fastify bootstrap
│       │   ├── routes/       # one file per resource
│       │   ├── workers/
│       │   │   ├── sync.ts          # IMAP IDLE per mailbox
│       │   │   └── scheduled-send.ts# BullMQ consumer
│       │   ├── crypto.ts     # AES-256-GCM helpers
│       │   ├── auth.ts       # session middleware
│       │   └── config.ts
│       └── test/             # vitest integration tests
├── packages/
│   ├── db/                   # prisma/schema.prisma + migrations + client
│   └── mail/                 # IMAP/SMTP wrappers, parsing helpers
├── docs/superpowers/specs/
└── ops/
    ├── systemd/              # crm-api.service, crm-sync.service
    └── nginx/                # crm.eg.je.conf
```

## 4. Data Model (Prisma)

```prisma
enum Role { owner admin manager }
enum FolderKind { inbox sent drafts trash custom }
enum SendStatus { pending sent failed cancelled }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role
  createdAt    DateTime @default(now())
  lastLoginAt  DateTime?
}

model Mailbox {
  id                   String   @id @default(cuid())
  email                String   @unique
  displayName          String
  encryptedAppPassword Bytes
  imapHost             String   @default("imap.mail.ru")
  imapPort             Int      @default(993)
  smtpHost             String   @default("smtp.mail.ru")
  smtpPort             Int      @default(465)
  enabled              Boolean  @default(true)
  createdAt            DateTime @default(now())
  folders              Folder[]
  messages             Message[]
}

model Folder {
  id        String     @id @default(cuid())
  mailbox   Mailbox?   @relation(fields: [mailboxId], references: [id])
  mailboxId String?
  owner     User?      @relation(fields: [ownerId], references: [id])
  ownerId   String?
  name      String
  kind      FolderKind
  parentId  String?
  messages  Message[]
  @@index([mailboxId, kind])
}

model Message {
  id          String   @id @default(cuid())
  mailbox     Mailbox  @relation(fields: [mailboxId], references: [id])
  mailboxId   String
  folder      Folder   @relation(fields: [folderId], references: [id])
  folderId    String
  imapUid     Int?
  messageId   String?  @unique
  fromAddr    String
  toAddrs     String[]
  ccAddrs     String[]
  subject     String
  bodyText    String?
  bodyHtml    String?
  isRead      Boolean  @default(false)
  isStarred   Boolean  @default(false)
  isDraft     Boolean  @default(false)
  receivedAt  DateTime?
  sentAt      DateTime?
  deletedAt   DateTime?
  attachments Attachment[]
  @@index([mailboxId, folderId, receivedAt])
  @@index([deletedAt])
}

model Attachment {
  id          String  @id @default(cuid())
  message     Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  messageId   String
  filename    String
  mime        String
  size        Int
  storagePath String
}

model ScheduledSend {
  id        String     @id @default(cuid())
  user      User       @relation(fields: [userId], references: [id])
  userId    String
  mailbox   Mailbox    @relation(fields: [mailboxId], references: [id])
  mailboxId String
  payload   Json       // {to, cc, subject, bodyText, bodyHtml, attachmentIds}
  sendAt    DateTime
  status    SendStatus @default(pending)
  jobId     String?
  createdAt DateTime   @default(now())
}
```

## 5. Secret Storage

App-passwords are encrypted with AES-256-GCM.
- Master key lives in `/etc/crm/secrets.env` (`CRM_ENC_KEY=base64(32 bytes)`),
  file mode `600`, owner `crm:crm`.
- Stored format (in `Mailbox.encryptedAppPassword`, `Bytes`):
  `iv(12) || ciphertext || tag(16)`.
- `crypto.ts` exports `encrypt(plaintext: string): Buffer` and
  `decrypt(blob: Buffer): string`. AAD is the mailbox email.
- Key never logged. Decryption happens only inside the sync worker and the
  send path.

## 6. IMAP Sync Worker

- One persistent ImapFlow connection per enabled mailbox, spawned on startup
  and on mailbox enable/add events.
- Listens to `exists` events on INBOX (IDLE).
- On event: fetch new UIDs since the last seen UID (stored in memory + a
  per-mailbox `last_uid` row in a small `SyncState` table), parse with
  mailparser, persist Message + Attachments, write attachment bytes to
  `/var/lib/crm/attachments/<mailboxId>/<messageId>/<filename>`.
- Every 5 minutes, do a full sync of non-INBOX folders (Sent, Drafts, custom)
  to catch flag changes and externally-moved messages.
- On disconnect: exponential backoff reconnect, max 60 s.
- Concurrency: a single Node process runs all mailbox connections; ImapFlow
  is async-friendly.

## 7. SMTP Send Path

```
POST /messages/:id/send { sendAt? }
  ├── load draft, validate ownership and that mailbox is enabled
  ├── if sendAt > now → enqueue BullMQ delayed job, mark ScheduledSend(pending)
  └── else → Nodemailer transport for that mailbox
        ├── send
        ├── append to remote Sent folder (IMAP APPEND)
        └── update Message.sentAt, move to local Sent folder
```

The scheduled-send worker consumes the delayed queue and calls the same
internal send function.

## 8. Trash Lifecycle

- `DELETE /messages/:id` → `deletedAt = now()`, `folderId = trash folder`.
- Restore = move out of trash, clear `deletedAt`.
- Daily cron (BullMQ repeatable job at 03:00 UTC):
  `DELETE FROM messages WHERE deletedAt < now() - interval '30 days'`,
  cascade removes attachments rows; the worker also unlinks attachment files.

## 9. REST API

All endpoints require an authenticated session except `/auth/login`.

| Method | Path | Purpose |
|--------|------|---------|
| POST   | /auth/login | email+password → session cookie |
| POST   | /auth/logout | clear session |
| GET    | /me | current user |
| GET    | /mailboxes | list enabled mailboxes |
| GET    | /folders?mailboxId= | list folders for mailbox or user-custom |
| POST   | /folders | create custom folder |
| PATCH  | /folders/:id | rename |
| DELETE | /folders/:id | delete (only if empty or with `?force=true`) |
| GET    | /messages | list with filters: `folderId`, `q`, `from`, `dateFrom`, `dateTo`, `status=read\|unread\|all`, `mailboxId`, pagination |
| GET    | /messages/:id | full message incl. attachment metadata |
| POST   | /messages | create draft |
| PATCH  | /messages/:id | update draft / flags / move folder |
| DELETE | /messages/:id | soft-delete to trash |
| POST   | /messages/:id/restore | restore from trash |
| POST   | /messages/:id/send | send now or scheduled (`{sendAt?}`) |
| GET    | /attachments/:id | download file |
| POST   | /messages/:id/attachments | upload file (multipart, ≤25MB) |

Search uses Postgres full-text on `subject || ' ' || bodyText` with a GIN
index on a generated `tsvector` column.

## 10. Auth

- Sessions: signed cookies (`@fastify/secure-session`), 30-day TTL.
- Passwords: argon2id (`argon2` package), default params.
- Role checks: route-level guard (`requireRole('admin')`) — all subsystem-1
  routes are accessible to any authenticated role; the guard exists so
  subsystem 3 can extend it.
- "Forgot password" flow is deferred to subsystem 3.

## 11. Errors & Validation

- Zod schemas for every request body and query.
- Fastify error handler maps `ZodError` → 400, `NotFoundError` → 404,
  `ForbiddenError` → 403, anything else → 500 with a request-id.
- Email addresses validated with `zod`'s email refinement.
- Attachment upload rejects >25 MB with 413 and a hint string.

## 12. Testing Strategy

- **Unit:** crypto round-trip, folder routing logic, address parsing.
- **Integration (vitest + testcontainers):**
  - Spin up Postgres + Redis + greenmail in containers per suite.
  - Register a mailbox pointing at greenmail.
  - End-to-end: send via API → greenmail receives → sync worker fetches →
    message visible via `GET /messages`.
  - Trash TTL: insert message with old `deletedAt`, run cleanup job, assert
    row + file gone.
  - Scheduled send: enqueue with `sendAt = now+2s`, wait, assert sent.
- **Coverage gate:** ≥80% on `apps/api/src` and `packages/mail/src`.

## 13. Deployment

- Two systemd units:
  - `crm-api.service` — Fastify HTTP on `127.0.0.1:3000`.
  - `crm-sync.service` — sync + scheduled-send workers (separate process so
    HTTP restarts don't drop IMAP IDLE).
- nginx vhost `crm.eg.je.conf`: TLS via certbot, proxy `/` → `127.0.0.1:3000`,
  `client_max_body_size 30M`.
- Postgres + Redis run as system services on the same host.
- Migrations applied via `prisma migrate deploy` in a pre-start hook.
- Logs to journald; structured JSON via pino.

## 14. Seed Data

Initial owner user is created via a one-shot CLI:
`pnpm --filter api seed:owner --email=... --password=...`

Mailboxes are added via API once subsystem 3 ships; for subsystem 1, a
companion CLI `seed:mailbox --email=... --app-password=... --name=...` is
provided so integration is testable end-to-end before the admin UI exists.
The 12 Mail.ru mailboxes from the brief (Венера, Нептун, …) are not seeded
automatically — they're added manually via this CLI once the encryption key
is in place.

## 15. Open Questions Resolved

- **Stack:** Node/TS/Fastify/Postgres/Prisma — confirmed.
- **Secret storage:** plain key file on the server — confirmed.
- **Scope:** as listed in §1 — confirmed.
- **Hosting:** crm.eg.je on this server — confirmed.

## 16. Risks

- Mail.ru IMAP IDLE has historically had quirks; reconnect logic must be
  robust. Mitigation: integration test with greenmail covers happy path;
  staging soak-test against one real Mail.ru box before adding the rest.
- 12 simultaneous IMAP connections from one IP may trip Mail.ru rate limits.
  Mitigation: stagger initial connects, exponential backoff on auth errors,
  single sync process (not per-mailbox process).
- Local-disk attachments don't survive a server rebuild. Acceptable for v1;
  S3-compatible storage can replace `storagePath` later.
