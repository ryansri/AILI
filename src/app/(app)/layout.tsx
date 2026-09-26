import { Rail } from "@/components/shell/rail";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full">
        <Rail />
        <main className="flex min-w-0 flex-1">{children}</main>
      </div>
    </TooltipProvider>
  );
}
