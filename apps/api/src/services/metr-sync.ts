import { prisma } from "@crm/db";
import pg from "pg";

const metrPool = new pg.Pool({ connectionString: "postgresql://crm:crm@localhost:5432/metr" });

export async function syncProjectsFromMetr(): Promise<{ created: number; total: number }> {
  const r = await metrPool.query('SELECT id, name FROM "Object" ORDER BY name');
  let created = 0;
  for (const row of r.rows) {
    const exists = await prisma.project.findFirst({
      where: { source: "metr", externalId: row.id },
    });
    if (!exists) {
      await prisma.project.create({
        data: { name: row.name, source: "metr", externalId: row.id },
      });
      created++;
    }
  }
  return { created, total: r.rows.length };
}
