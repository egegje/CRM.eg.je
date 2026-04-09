import { prisma } from "@crm/db";
import { loadConfig } from "../config.js";

const cfg = loadConfig();

const AUTH_HOST = "https://sbi.sberbank.ru:9443";
const TOKEN_HOST = "https://fintech.sberbank.ru:9443";
const API_HOST = "https://fintech.sberbank.ru:9443";

const SCOPE_V1 = `openid ${cfg.sberClientId ? `di-20c769e4-4af8-4192-8e38-e35435c433f6` : ""}`.trim();

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
  });
  const r = await fetch(`${TOKEN_HOST}/ic/sso/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`sber token ${r.status}: ${txt}`);
  }
  return r.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  }>;
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
  });
  const r = await fetch(`${TOKEN_HOST}/ic/sso/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`sber refresh ${r.status}: ${txt}`);
  }
  return r.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
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

/** Generic Sber API GET request with auto-auth. */
async function sberGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(path, API_HOST);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`sber api ${r.status}: ${txt.slice(0, 500)}`);
  }
  return r.json() as Promise<T>;
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
