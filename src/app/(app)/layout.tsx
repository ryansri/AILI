import { Rail } from "@/components/shell/rail";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getWorkspace } from "@/lib/data";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const workspace = await getWorkspace();
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        <Rail initials={workspace.initials} />
        <main className="flex min-w-0 flex-1">{children}</main>
      </div>
    </TooltipProvider>
  );
}
