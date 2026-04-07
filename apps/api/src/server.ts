import Fastify, { type FastifyInstance } from "fastify";
import secureSession from "@fastify/secure-session";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { setKey } from "./crypto.js";
import { registerErrorHandler } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { mailboxRoutes } from "./routes/mailboxes.js";
import { folderRoutes } from "./routes/folders.js";
import { messageRoutes } from "./routes/messages.js";
import { attachmentRoutes } from "./routes/attachments.js";
import { adminRoutes } from "./routes/admin.js";

export async function buildApp(): Promise<{ app: FastifyInstance; cfg: ReturnType<typeof loadConfig> }> {
  const cfg = loadConfig();
  setKey(cfg.encKey);

  const app = Fastify({
    logger: { level: cfg.env === "test" ? "warn" : "info" },
  });

  await app.register(secureSession, {
    key: cfg.sessionSecret,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: cfg.env === "production",
    },
  });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  registerErrorHandler(app);

  app.get("/health", async () => ({ ok: true }));

  const __dirname = dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: join(__dirname, "..", "public"),
    prefix: "/",
    decorateReply: false,
  });

  await app.register(authRoutes);
  await app.register(mailboxRoutes);
  await app.register(folderRoutes);
  await app.register(messageRoutes);
  await app.register(attachmentRoutes);
  await app.register(adminRoutes);

  return { app, cfg };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { app, cfg } = await buildApp();
  await app.listen({ host: "127.0.0.1", port: cfg.port });
}
