import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

const VARIANT = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-transparent",
  secondary: "bg-white text-accent-hover border border-accent-hover hover:bg-accent-muted",
  ghost: "bg-[rgba(148,151,169,0.08)] text-foreground border border-transparent hover:bg-[rgba(148,151,169,0.16)]",
  danger: "bg-danger-muted text-danger border border-transparent hover:bg-danger-muted",
} as const;

export function buttonClassName(
  variant: keyof typeof VARIANT = "primary",
  size: "sm" | "md" = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center rounded-[12px] font-medium transition-colors",
    size === "sm" ? "px-3 py-1.5 text-sm" : "px-3.5 py-2 text-sm",
    VARIANT[variant],
    className,
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  size?: "sm" | "md";
};

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(buttonClassName(variant, size), "disabled:cursor-not-allowed disabled:opacity-45", className)}
      {...props}
    />
  );
}
