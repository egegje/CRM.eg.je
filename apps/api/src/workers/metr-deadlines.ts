import { prisma } from "@crm/db";
import pg from "pg";

const metrPool = new pg.Pool({ connectionString: "postgresql://crm:crm@localhost:5432/metr" });

/**
 * Daily scan of metr Object.buyback_date — for each object whose
 * buyback date is within `leadDays` from now, ensure there's an open
 * task linked to the corresponding Project. Avoids duplicates by
 * looking up tasks with sourceEmailMessageId = `metr-buyback:<objectId>`
 * (we hijack that field since there's no dedicated source kind yet).
 */
export async function scanMetrDeadlines(): Promise<{ created: number }> {
  const enabled = await prisma.taskSetting.findUnique({
    where: { key: "metr_deadline_enabled" },
  });
  if (enabled?.value !== "true") return { created: 0 };
  const assigneeRowEarly = await prisma.taskSetting.findUnique({
    where: { key: "metr_default_assignee_user_id" },
  });
  if (!assigneeRowEarly?.value) return { created: 0 };
  const leadRow = await prisma.taskSetting.findUnique({
    where: { key: "metr_deadline_lead_days" },
  });
  const leadDays = Math.max(1, Number(leadRow?.value ?? "3"));
  const defaultAssignee = assigneeRowEarly.value;

  const today = new Date();
  const cutoff = new Date(today.getTime() + leadDays * 24 * 60 * 60 * 1000);

  const r = await metrPool.query(
    `SELECT id, name, buyback_date FROM "Object"
     WHERE buyback_date IS NOT NULL
       AND buyback_date >= $1::date
       AND buyback_date <= $2::date`,
    [today.toISOString().slice(0, 10), cutoff.toISOString().slice(0, 10)],
  );

  let created = 0;
  for (const row of r.rows) {
    const project = await prisma.project.findFirst({
      where: { source: "metr", externalId: row.id },
    });
    if (!project) continue;
    const marker = `metr-buyback:${row.id}`;
    const exists = await prisma.task.findFirst({
      where: { sourceEmailMessageId: marker },
    });
    if (exists) continue;
    await prisma.task.create({
      data: {
        title: `Выкуп объекта «${row.name}» — ${new Date(row.buyback_date).toLocaleDateString("ru")}`,
        description: `Авто-задача из metr. До даты выкупа осталось ≤ ${leadDays} дней.`,
        creatorId: defaultAssignee,
        assigneeId: defaultAssignee,
        projectId: project.id,
        dueDate: new Date(row.buyback_date),
        priority: "high",
        sourceEmailMessageId: marker,
      },
    });
    created++;
  }
  return { created };
}

export function startMetrDeadlinesCron(): void {
  let lastRunDay = "";
  setInterval(async () => {
    const now = new Date();
    const mskHour = (now.getUTCHours() + 3) % 24;
    const day = now.toISOString().slice(0, 10);
    // Run once per day at 8:00 МСК
    if (mskHour === 8 && day !== lastRunDay) {
      lastRunDay = day;
      try {
        const { created } = await scanMetrDeadlines();
        if (created > 0) console.log(`metr deadlines: created ${created} tasks`);
      } catch (e) {
        console.error("metr deadlines:", (e as Error).message);
      }
    }
  }, 60_000);
  console.log("metr deadlines cron started");
}
