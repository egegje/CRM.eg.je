import type { FastifyInstance } from "fastify";
import { mkdir, writeFile, access as fsAccess, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { prisma } from "@crm/db";
import { requireUser } from "../auth.js";
import { loadConfig } from "../config.js";
import { NotFound, BadRequest } from "../errors.js";
import { assertMessageAccess } from "../services/access.js";
import { imapFetchAttachment } from "../services/attachment-fetch.js";

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
    const sha = createHash("sha256").update(buf).digest("hex");
    return prisma.attachment.create({
      data: {
        messageId: id,
        filename: file.filename,
        mime: file.mimetype,
        size: buf.length,
        storagePath: path,
        sha256: sha,
        cachedAt: new Date(),
      },
    });
  });

  app.get("/attachments/:id", { preHandler: requireUser() }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const a = await prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { mailboxId: true, imapUid: true } } },
    });
    if (!a) throw new NotFound();
    await assertMessageAccess(req.user!, a.message);

    let path = a.storagePath;
    let onDisk = false;
    if (path) {
      try {
        await fsAccess(path);
        onDisk = true;
      } catch {
        onDisk = false;
      }
    }

    // Lazy fetch from IMAP if not cached
    if (!onDisk) {
      const uid = a.imapUid ?? a.message.imapUid;
      if (!uid) throw new NotFound("attachment not on disk and no IMAP uid");
      let buf: Buffer;
      try {
        buf = await imapFetchAttachment(a.message.mailboxId, uid, a.imapPart);
      } catch (e) {
        app.log.error({ err: e, attachmentId: id }, "lazy-fetch failed");
        throw new NotFound("could not fetch attachment from mail server");
      }
      const cleaned = a.filename.replace(/[/\\]/g, "_");
      const safeBuf = Buffer.from(cleaned, "utf8");
      const safe = safeBuf.length > 200 ? safeBuf.subarray(0, 200).toString("utf8") + "_" : cleaned;
      const dir = join(cfg.attachmentDir, a.message.mailboxId, a.messageId);
      await mkdir(dir, { recursive: true });
      path = join(dir, safe);
      await writeFile(path, buf);
      const sha = createHash("sha256").update(buf).digest("hex");
      await prisma.attachment.update({
        where: { id: a.id },
        data: {
          storagePath: path,
          sha256: sha,
          cachedAt: new Date(),
        },
      });
    }

    // Mark accessed (async — don't block download)
    prisma.attachment
      .update({ where: { id: a.id }, data: { lastAccessedAt: new Date() } })
      .catch(() => {});

    reply.header("content-type", a.mime);
    const inline = a.mime === "application/pdf" || a.mime.startsWith("image/");
    const disp = inline ? "inline" : "attachment";
    const encodedFilename = encodeURIComponent(a.filename).replace(/'/g, "%27");
    reply.header(
      "content-disposition",
      `${disp}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    );
    const stream = createReadStream(path!);
    stream.on("error", () => {
      if (!reply.sent) reply.status(500).send({ error: "read error" });
    });
    return reply.send(stream);
  });

  // Delete an attachment. Only allowed on drafts — once a message has been
  // sent, its attachments are part of the sent record and must stay put.
  app.delete("/attachments/:id", { preHandler: requireUser() }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const a = await prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { mailboxId: true, isDraft: true } } },
    });
    if (!a) throw new NotFound();
    await assertMessageAccess(req.user!, a.message);
    if (!a.message.isDraft) throw new BadRequest("cannot delete attachment of sent message");
    if (a.storagePath) {
      try {
        await unlink(a.storagePath);
      } catch {
        /* file may already be gone */
      }
    }
    await prisma.attachment.delete({ where: { id } });
    return reply.status(204).send();
  });
}
