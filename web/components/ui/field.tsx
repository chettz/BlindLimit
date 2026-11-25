import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

const CONTROL =
  "w-full rounded-[12px] border border-border bg-surface px-3 py-2.5 text-base text-foreground placeholder:text-muted-2 focus:border-accent focus:outline-none";

export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("flex flex-col gap-1.5 text-sm text-muted", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "font-mono text-xs", className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-2", className)} {...props} />;
}
