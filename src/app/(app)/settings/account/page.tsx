import { getWorkspace } from "@/lib/data";
import { AccountView } from "@/components/settings/account-view";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const workspace = await getWorkspace();
  return <AccountView name={workspace.name} email={workspace.email ?? ""} />;
}
