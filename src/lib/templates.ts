import type { Person } from "./types";

/** The fields a template can use, written as {first_name} and so on. */
export const TEMPLATE_FIELDS = [
  { key: "first_name", label: "First name", example: "Rachel" },
  { key: "name", label: "Full name", example: "Rachel Lounds" },
  { key: "company", label: "Company", example: "Lounds Consulting" },
  { key: "title", label: "Job title", example: "Founder" },
] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number]["key"];

export interface Template {
  id: string;
  name: string;
  body: string;
}

const PLACEHOLDER = /\{\s*(first_name|name|company|title)\s*\}/gi;

function valueFor(field: string, person: Pick<Person, "name" | "company" | "jobTitle">): string {
  switch (field.toLowerCase()) {
    case "first_name":
      return person.name.trim().split(/\s+/)[0] ?? "";
    case "name":
      return person.name.trim();
    case "company":
      return person.company.trim();
    case "title":
      return person.jobTitle.trim();
    default:
      return "";
  }
}

/**
 * The template written out for one person. A field with no value is left out
 * and the spacing around it tidied. Use missingFields to warn before sending.
 */
export function fillTemplate(body: string, person: Pick<Person, "name" | "company" | "jobTitle">): string {
  return body
    .replace(PLACEHOLDER, (_, field: string) => valueFor(field, person))
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Fields the template uses that this person has no value for, e.g. ["company"]. */
export function missingFields(body: string, person: Pick<Person, "name" | "company" | "jobTitle">): TemplateField[] {
  const missing = new Set<TemplateField>();
  for (const match of body.matchAll(PLACEHOLDER)) {
    const field = match[1].toLowerCase() as TemplateField;
    if (!valueFor(field, person)) missing.add(field);
  }
  return [...missing];
}
