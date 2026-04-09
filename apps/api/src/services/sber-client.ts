import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";
import { readFileSync } from "node:fs";
import { Agent, request as httpsRequest } from "node:https";

const cfg = loadConfig();

const AUTH_HOST = "https://sbi.sberbank.ru:9443";
const TOKEN_HOST = "https://fintech.sberbank.ru:9443";
const API_HOST = "https://fintech.sberbank.ru:9443";

/** mTLS agent — loaded once, reused for all server-to-server calls. */
let _agent: Agent | undefined;
function sberAgent(): Agent {
  if (_agent) return _agent;
  try {
    _agent = new Agent({
      cert: readFileSync("/etc/crm/sber-client-cert.pem"),
      key: readFileSync("/etc/crm/sber-client-key.pem"),
      ca: readFileSync("/etc/crm/sber-ca-bundle.pem"),
      rejectUnauthorized: true,
    });
  } catch (e) {
    console.error("sber-client: failed to load certs, mTLS disabled:", (e as Error).message);
    _agent = new Agent({ rejectUnauthorized: false });
  }
  return _agent;
}

/** Low-level HTTPS request with mTLS agent — returns {status, body}. */
function sberHttp(
  method: string,
  rawUrl: string,
  headers: Record<string, string>,
  bodyStr?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers,
        agent: sberAgent(),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }),
        );
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const SCOPE_V2 = [
  "openid",
  "GET_CLIENT_ACCOUNTS",
  "GET_STATEMENT_ACCOUNT",
  "GET_STATEMENT_TRANSACTION",
].join(" ");

/** Build the Sber Business ID authorization URL that the user opens in their browser. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.sberClientId || "",
    redirect_uri: cfg.sberRedirectUri || "",
    scope: SCOPE_V2,
    state,
    nonce: Math.random().toString(36).slice(2),
  });
  return `${AUTH_HOST}/ic/sso/api/v2/oauth/authorize?${params}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.sberRedirectUri || "",
    client_id: cfg.sberClientId || "",
    client_secret: cfg.sberClientSecret || "",
  }).toString();
  const r = await sberHttp("POST", `${TOKEN_HOST}/ic/sso/api/v2/oauth/token`, {
    "Content-Type": "application/x-www-form-urlencoded",
  }, body);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`sber token ${r.status}: ${r.body.slice(0, 500)}`);
  }
  return JSON.parse(r.body);
}

/** Refresh access token using refresh_token. */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.sberClientId || "",
    client_secret: cfg.sberClientSecret || "",
  }).toString();
  const r = await sberHttp("POST", `${TOKEN_HOST}/ic/sso/api/v2/oauth/token`, {
    "Content-Type": "application/x-www-form-urlencoded",
  }, body);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`sber refresh ${r.status}: ${r.body.slice(0, 500)}`);
  }
  return JSON.parse(r.body);
}

/** Get a valid access token — auto-refreshes if expired. */
export async function getAccessToken(): Promise<string> {
  const row = await prisma.sberToken.findUnique({ where: { id: "singleton" } });
  if (!row) throw new Error("Sber не авторизован. Зайдите в Финансы → Подключить Сбер.");
  if (row.expiresAt > new Date()) return row.accessToken;
  if (!row.refreshToken) throw new Error("Sber токен истёк, refresh_token отсутствует. Переавторизуйтесь.");
  const fresh = await refreshAccessToken(row.refreshToken);
  const expiresAt = new Date(Date.now() + fresh.expires_in * 1000);
  await prisma.sberToken.update({
    where: { id: "singleton" },
    data: {
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token ?? row.refreshToken,
      expiresAt,
    },
  });
  return fresh.access_token;
}

/** Generic Sber API GET request with auto-auth + mTLS. */
async function sberGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(path, API_HOST);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await sberHttp("GET", url.toString(), {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`sber api ${r.status}: ${r.body.slice(0, 500)}`);
  }
  return JSON.parse(r.body) as T;
}

// ---- Business endpoints ----

export type SberAccount = {
  number: string;
  name: string;
  currencyCode: string;
  bic: string;
  type: string;
  state: string;
  openDate: string;
  closeDate: string | null;
};

export type SberClientInfo = {
  shortName: string;
  fullName: string;
  inn: string;
  accounts: SberAccount[];
};

export async function getClientInfo(): Promise<SberClientInfo> {
  return sberGet("/fintech/api/v1/client-info");
}

export type SberStatementSummary = {
  composedDateTime?: string;
  lastMovementDate?: string;
  openingBalance: number;
  closingBalance: number;
  debitTurnover: number;
  debitTransactionsNumber: number;
  creditTurnover: number;
  creditTransactionsNumber: number;
};

export async function getStatementSummary(
  accountNumber: string,
  statementDate: string,
): Promise<SberStatementSummary> {
  return sberGet("/fintech/api/v2/statement/summary", { accountNumber, statementDate });
}

export type SberTransaction = {
  id?: string;
  date: string;
  amount: number;
  direction: string; // "DEBIT" | "CREDIT"
  counterpartyName?: string;
  counterpartyInn?: string;
  counterpartyAccount?: string;
  counterpartyBankBic?: string;
  purpose?: string;
  paymentNumber?: string;
  operationCode?: string;
};

export type SberStatementTransactions = {
  transactions: SberTransaction[];
};

export async function getStatementTransactions(
  accountNumber: string,
  statementDate: string,
): Promise<SberStatementTransactions> {
  return sberGet("/fintech/api/v2/statement/transactions", { accountNumber, statementDate });
}
