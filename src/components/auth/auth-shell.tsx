/** The full-screen frame for log in, sign up, password reset and onboarding: the mark top left, one card in the middle. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col items-center justify-center gap-5 bg-sidebar p-6">
      <div className="absolute top-5 left-6 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          A
        </span>
        AILI
      </div>
      {children}
    </div>
  );
}

export function AuthCard({
  title,
  children,
  centered,
}: {
  title?: string;
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <div
      className={
        centered
          ? "flex w-full max-w-[440px] flex-col items-center gap-3 rounded-2xl border bg-background px-7 py-8 text-center"
          : "flex w-full max-w-[440px] flex-col gap-4 rounded-2xl border bg-background p-7"
      }
    >
      {title && <h1 className="text-xl font-bold tracking-tight">{title}</h1>}
      {children}
    </div>
  );
}
