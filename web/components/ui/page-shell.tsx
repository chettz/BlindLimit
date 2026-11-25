import type { ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export function PageMain({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8 lg:px-10", className)}>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-[28px] font-bold leading-[1.29] tracking-[-0.5px] text-foreground sm:text-[36px] sm:leading-[1.22]">
          {title}
        </h1>
        {description ? <p className="text-base leading-[1.38] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Alert({
  tone = "default",
  children,
}: {
  tone?: "default" | "warning" | "danger";
  children: ReactNode;
}) {
  const styles = {
    default: "border-border bg-surface text-muted",
    warning: "border-transparent bg-warning-muted text-warning",
    danger: "border-transparent bg-danger-muted text-danger",
  };
  return (
    <p className={cn("rounded-[12px] border px-4 py-3 text-sm shadow-[0_1px_4px_rgba(16,24,40,0.04)]", styles[tone])}>
      {children}
    </p>
  );
}

export function TextLink({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn("text-base text-accent underline-offset-2 hover:text-accent-hover hover:underline", className)} {...props} />
  );
}
