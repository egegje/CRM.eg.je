import { ImapFlow } from "imapflow";

export type ImapCreds = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

export function newClient(c: ImapCreds): ImapFlow {
  return new ImapFlow({
    host: c.host,
    port: c.port,
    secure: c.port === 993,
    auth: { user: c.user, pass: c.pass },
    logger: false,
  });
}

export async function appendToSent(c: ImapCreds, raw: Buffer): Promise<void> {
  const client = newClient(c);
  await client.connect();
  try {
    await client.append("Sent", raw, ["\\Seen"]);
  } finally {
    await client.logout();
  }
}
