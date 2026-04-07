import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export class NotFound extends HttpError {
  constructor(m = "not found") { super(404, m); }
}
export class Forbidden extends HttpError {
  constructor(m = "forbidden") { super(403, m); }
}
export class BadRequest extends HttpError {
  constructor(m: string, d?: unknown) { super(400, m, d); }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "validation", details: err.flatten() });
    }
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.message, details: err.details });
    }
    const sc = (err as unknown as { statusCode?: number }).statusCode;
    if (typeof sc === "number" && sc < 500) {
      return reply.status(sc).send({ error: (err as Error).message });
    }
    // Prisma "record not found" → 404
    const code = (err as unknown as { code?: string }).code;
    if (code === "P2025") {
      return reply.status(404).send({ error: "not found" });
    }
    req.log.error({ err }, "unhandled");
    return reply.status(500).send({ error: "internal", requestId: req.id });
  });
}
