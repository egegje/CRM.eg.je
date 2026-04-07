import type { FastifyInstance } from "fastify";
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { loadConfig } from "../config.js";
import { NotFound, BadRequest } from "../errors.js";
import { assertMessageAccess } from "../services/access.js";

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  const cfg = loadConfig();

  app.post("/messages/:id/attachments", { preHandler: requireUser() }, async (req) => {
    const id = (req.params as { id: string }).id;
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) throw new NotFound();
    await assertMessageAccess(req.user!, m);
    const file = await req.file();
    if (!file) throw new BadRequest("no file");
    const buf = await file.toBuffer();
    if (buf.length > 25 * 1024 * 1024) {
      throw new BadRequest("file > 25MB; use a cloud link");
    }
    const dir = join(cfg.attachmentDir, m.mailboxId, m.id);
    await mkdir(dir, { recursive: true });
    const path = join(dir, file.filename);
    await writeFile(path, buf);
    return prisma.attachment.create({
      data: {
        messageId: id,
        filename: file.filename,
        mime: file.mimetype,
        size: buf.length,
        storagePath: path,
      },
    });
  });

  app.get("/attachments/:id", { preHandler: requireUser() }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const a = await prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { mailboxId: true } } },
    });
    if (!a) throw new NotFound();
    await assertMessageAccess(req.user!, a.message);
    reply.header("content-type", a.mime);
    reply.header("content-disposition", `attachment; filename="${a.filename}"`);
    return reply.send(createReadStream(a.storagePath));
  });
}
