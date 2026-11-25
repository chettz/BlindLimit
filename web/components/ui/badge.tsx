import type { HTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

const TONE = {
  default: "bg-[rgba(104,107,130,0.12)] text-[#484b5e] rounded-[8px]",
  accent: "bg-accent-muted text-accent rounded-[8px]",
  mock: "bg-warning-muted text-warning rounded-[8px]",
  success: "bg-success-muted text-success-fg rounded-[6px]",
  danger: "bg-danger-muted text-danger rounded-[8px]",
} as const;

type Props = HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE };

export function Badge({ className, tone = "default", ...props }: Props) {
  return (
    <span
      className={cn("inline-flex items-center px-2 py-0.5 text-xs font-medium", TONE[tone], className)}
      {...props}
    />
  );
}
