/**
 * Seeds the local database with the sample people from prisma/seed-data.ts.
 * Safe to re-run: it wipes and recreates the single workspace.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Same default as prisma.config.ts so the seed runs with no .env file.
process.env.DATABASE_URL ??= "file:./dev.db";
import { ACCOUNT, PEOPLE, TAGS } from "./seed-data";

const db = new PrismaClient();

async function main() {
  await db.workspace.deleteMany();

  const workspace = await db.workspace.create({
    data: { name: ACCOUNT.name, initials: ACCOUNT.initials, dailyCap: ACCOUNT.dailyCap },
  });

  const tagIds = new Map<string, string>();
  for (const tag of TAGS) {
    const created = await db.tag.create({
      data: { workspaceId: workspace.id, label: tag.label, color: tag.color },
    });
    tagIds.set(tag.id, created.id);
  }

  for (const person of PEOPLE) {
    await db.person.create({
      data: {
        workspaceId: workspace.id,
        name: person.name,
        headline: person.headline,
        company: person.company,
        location: person.location ?? "",
        linkedinUrl: person.linkedinUrl,
        stage: person.stage,
        notes: person.notes,
        connectedAt: person.connectedAt ? new Date(person.connectedAt) : null,
        snoozedUntil: person.snoozedUntil ? new Date(person.snoozedUntil) : null,
        tags: {
          create: person.tagIds.map((id) => ({ tagId: tagIds.get(id)! })),
        },
        messages: {
          create: person.messages.map((m) => ({
            direction: m.direction,
            body: m.body,
            sentAt: new Date(m.sentAt),
            followUp: m.followUp ?? null,
            source: "seed",
          })),
        },
      },
    });
  }

  console.log(`Seeded ${PEOPLE.length} people and ${TAGS.length} tags into workspace ${workspace.id}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
