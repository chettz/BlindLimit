import { cn } from "@/lib/ui/cn";

export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>;
}

export function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface px-4 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)]",
        highlight && "border-accent/25 bg-accent-muted",
      )}
    >
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-2 text-[22px] font-semibold leading-[1.2] tabular-nums", highlight && "text-accent")}>
        {value}
      </p>
    </div>
  );
}
