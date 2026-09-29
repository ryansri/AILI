"use server";

import { revalidatePath } from "next/cache";
import { run } from "./action-result";
import { rawKey } from "./companies";
import { getWorkspace } from "./data";
import { db } from "./db";

/*
 * Leads by company: the user's corrections to how company names are grouped.
 * Each is a rule from a company name as LinkedIn gave it to the name it goes
 * under (see companies.ts). Nothing about the people changes.
 */

const clean = (value: string, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function names(raws: string[]): string[] {
  if (!Array.isArray(raws)) throw new Error("Pick a company.");
  const list = [...new Set(raws.map((r) => clean(r)).filter(Boolean))].slice(0, 200);
  if (list.length === 0) throw new Error("Pick a company.");
  return list;
}

async function save(workspaceId: string, pairs: { raw: string; name: string }[]) {
  await db.$transaction(
    pairs.map((p) =>
      db.companyName.upsert({
        where: { workspaceId_raw: { workspaceId, raw: rawKey(p.raw) } },
        update: { name: p.name },
        create: { workspaceId, raw: rawKey(p.raw), name: p.name },
      }),
    ),
  );
  revalidatePath("/people");
}

/**
 * Group these company names under one name: to rename a company, to confirm a
 * guess, or to put two companies together (give them the same name). An empty
 * name hands them back to AILI's own matching.
 */
async function nameCompanyImpl(raws: string[], name: string) {
  const workspace = await getWorkspace();
  const list = names(raws);
  const to = clean(name);
  if (!to) {
    await db.companyName.deleteMany({ where: { workspaceId: workspace.id, raw: { in: list.map(rawKey) } } });
    revalidatePath("/people");
    return;
  }
  await save(workspace.id, list.map((raw) => ({ raw, name: to })));
}

/** Each of these company names is its own company, as LinkedIn spells it. */
async function keepCompaniesApartImpl(raws: string[]) {
  const workspace = await getWorkspace();
  await save(workspace.id, names(raws).map((raw) => ({ raw, name: raw })));
}

export async function nameCompany(...args: Parameters<typeof nameCompanyImpl>) {
  return run(() => nameCompanyImpl(...args));
}

export async function keepCompaniesApart(...args: Parameters<typeof keepCompaniesApartImpl>) {
  return run(() => keepCompaniesApartImpl(...args));
}
