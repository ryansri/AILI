import { redirect } from "next/navigation";

/** Settings opens on Connections. Old links with ?linkedin=… keep their message. */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { linkedin } = await searchParams;
  redirect(typeof linkedin === "string" ? `/settings/connections?linkedin=${encodeURIComponent(linkedin)}` : "/settings/connections");
}
