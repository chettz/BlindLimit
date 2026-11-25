"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "홈" },
  { href: "/lender", label: "대출사" },
  { href: "/lender/agreement", label: "약정 서명" },
  { href: "/operator", label: "운영자" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-zinc-50 px-3 py-6 dark:border-zinc-800 dark:bg-zinc-950">
      <Link className="mb-4 px-2 text-sm font-semibold tracking-tight" href="/">
        BlindLimit
      </Link>
      {LINKS.map((row) => {
        const active =
          row.href === "/"
            ? pathname === "/"
            : row.href === "/lender"
              ? pathname === "/lender"
              : pathname === row.href || pathname.startsWith(`${row.href}/`);
        return (
          <Link
            key={row.href}
            className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-700 hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}
            href={row.href}
          >
            {row.label}
          </Link>
        );
      })}
    </nav>
  );
}