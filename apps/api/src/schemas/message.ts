import { z } from "zod";

/**
 * PATCH /messages/:id body. Lives in its own module so tests can import
 * it without pulling in queue.ts (which wants a live Redis/Postgres config
 * at import time).
 */
export const MessagePatch = z.object({
  to: z.array(z.string().email()).optional(),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  folderId: z.string().optional(),
  // Draft-only: changing mailboxId re-homes the draft to the target
  // mailbox's Drafts folder. The route rejects it for sent messages.
  mailboxId: z.string().optional(),
  senderUserId: z.string().nullable().optional(),
  personaId: z.string().nullable().optional(),
});

export type MessagePatchBody = z.infer<typeof MessagePatch>;
