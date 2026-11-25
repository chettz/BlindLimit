import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[22px] font-semibold leading-[1.2] tracking-tight text-foreground", className)} {...props} />;
}

export function CardEyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-2", className)} {...props} />;
}
