import { prisma } from "@crm/db";
import {
  getClientInfo,
  getStatementSummary,
  getStatementTransactions,
} from "./sber-client.js";

// Sber API transaction — raw shape (superset of typed SberTransaction)
type RawTx = Record<string, unknown> & {
  amount: { amount: string } | number;
  direction: string;
  rurTransfer?: Record<string, string>;
  uuid?: string;
  operationDate?: string;
  documentDate?: string;
  paymentPurpose?: string;
  number?: string;
};

/**
 * Sync transactions from Sber API into local BankTransaction table.
 * For each open account:
 *   - First run: fetch last 90 days day-by-day
 *   - Subsequent: fetch from lastSyncDate+1 to today
 * Deduplicates by sberUuid.
 */
export async function syncSberTransactions(): Promise<{ synced: number; errors: string[] }> {
  const info = await getClientInfo();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let synced = 0;
  const errors: string[] = [];

  for (const acc of info.accounts || []) {
    if (acc.state !== "OPEN") continue;
    const state = await prisma.bankSyncState.findUnique({
      where: { accountNumber: acc.number },
    });
    // Determine start date
    let startDate: Date;
    if (state) {
      // Next day after last sync
      startDate = new Date(state.lastSyncDate);
      startDate.setDate(startDate.getDate() + 1);
    } else {
      // First sync: go back 90 days
      startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    }

    // Walk day by day
    const cursor = new Date(startDate);
    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      try {
        const resp = await getStatementTransactions(acc.number, dateStr);
        const txs = (resp.transactions || []) as RawTx[];
        for (const t of txs) {
          const uuid = t.uuid || null;
          if (uuid) {
            const exists = await prisma.bankTransaction.findUnique({
              where: { sberUuid: uuid },
            });
            if (exists) continue;
          }
          const amt = typeof t.amount === "object" ? parseFloat((t.amount as { amount: string }).amount) : parseFloat(String(t.amount)) || 0;
          const rur = t.rurTransfer || {};
          const isDebit = (t.direction || "").toUpperCase() === "DEBIT";
          await prisma.bankTransaction.create({
            data: {
              accountNumber: acc.number,
              operationDate: new Date(t.operationDate || t.documentDate || dateStr),
              documentDate: t.documentDate ? new Date(t.documentDate) : null,
              amount: amt,
              direction: t.direction || "DEBIT",
              counterpartyName: isDebit ? (rur.payeeName || null) : (rur.payerName || null),
              counterpartyInn: isDebit ? (rur.payeeInn || null) : (rur.payerInn || null),
              counterpartyAccount: isDebit ? (rur.payeeAccount || null) : (rur.payerAccount || null),
              counterpartyBankBic: isDebit ? (rur.payeeBankBic || null) : (rur.payerBankBic || null),
              paymentPurpose: t.paymentPurpose || null,
              paymentNumber: t.number || null,
              sberUuid: uuid,
            },
          });
          synced++;
        }
      } catch (e) {
        // Some dates may have no data — that's fine
        const msg = (e as Error).message;
        if (!msg.includes("404") && !msg.includes("204")) {
          errors.push(`${acc.number}/${dateStr}: ${msg.slice(0, 200)}`);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Update sync state
    await prisma.bankSyncState.upsert({
      where: { accountNumber: acc.number },
      create: { accountNumber: acc.number, lastSyncDate: todayStr },
      update: { lastSyncDate: todayStr },
    });

    // Refresh BankAccount row so the home page counter reflects today's
    // closing balance (the home handler reads BankAccount, not Sber live).
    try {
      const summary = await getStatementSummary(acc.number, todayStr);
      // Sber sometimes returns amounts as {amount: "12345.67"} objects, not
      // plain numbers, despite what the TS type claims.
      const rawBal = (summary as unknown as { closingBalance: unknown }).closingBalance;
      const closingBalance =
        typeof rawBal === "object" && rawBal !== null
          ? parseFloat((rawBal as { amount: string }).amount)
          : Number(rawBal) || 0;
      const company = await prisma.company.findFirst({ select: { id: true } });
      if (company) {
        const existing = await prisma.bankAccount.findFirst({
          where: { accountNumber: acc.number },
          select: { id: true },
        });
        if (existing) {
          await prisma.bankAccount.update({
            where: { id: existing.id },
            data: {
              balance: closingBalance,
              currency: "RUB",
            },
          });
        } else {
          await prisma.bankAccount.create({
            data: {
              companyId: company.id,
              bank: "Sber",
              accountNumber: acc.number,
              currency: "RUB",
              balance: closingBalance,
            },
          });
        }
      }
    } catch (e) {
      errors.push(`${acc.number}: balance refresh — ${(e as Error).message.slice(0, 200)}`);
    }
  }

  return { synced, errors };
}
