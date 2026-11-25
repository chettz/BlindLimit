"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { cn } from "@/lib/ui/cn";

const TABS = [
  { href: "/", label: "홈", match: (path: string) => path === "/" },
  { href: "/lender", label: "대출사", match: (path: string) => path === "/lender" },
  { href: "/lender/agreement", label: "약정", match: (path: string) => path.startsWith("/lender/agreement") },
  { href: "/operator", label: "운영자", match: (path: string) => path.startsWith("/operator") },
  { href: "/pools", label: "풀", match: (path: string) => path.startsWith("/pools") || path.startsWith("/pool/") },
] as const;

type Spring = { x: number; v: number; t: number; k: number; c: number };

function spring(x: number): Spring {
  return { x, v: 0, t: x, k: 400, c: 30 };
}

function tune(s: Spring, k: number, c: number, reduce: boolean) {
  s.k = k;
  s.c = reduce ? 2 * Math.sqrt(k) : c;
}

function step(s: Spring, dt: number) {
  const a = -s.k * (s.x - s.t) - s.c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

export function TabPill() {
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const indexRef = useRef(-1);
  const edgeA = useRef(spring(0));
  const edgeB = useRef(spring(0));
  const reduceRef = useRef(false);

  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.match(pathname)),
  );

  useEffect(() => {
    reduceRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useLayoutEffect(() => {
    const el = buttonsRef.current[activeIndex];
    if (!el) return;

    const dir = activeIndex > indexRef.current ? 1 : -1;
    const prev = indexRef.current;
    indexRef.current = activeIndex;
    edgeA.current.t = el.offsetLeft;
    edgeB.current.t = el.offsetLeft + el.offsetWidth;

    if (prev < 0 || reduceRef.current) {
      edgeA.current.x = edgeA.current.t;
      edgeB.current.x = edgeB.current.t;
      return;
    }

    if (dir > 0) {
      tune(edgeB.current, 620, 40, reduceRef.current);
      tune(edgeA.current, 170, 19, reduceRef.current);
    } else {
      tune(edgeA.current, 620, 40, reduceRef.current);
      tune(edgeB.current, 170, 19, reduceRef.current);
    }
  }, [activeIndex, pathname]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      const sub = 4;
      for (let i = 0; i < sub; i++) {
        step(edgeA.current, dt / sub);
        step(edgeB.current, dt / sub);
      }
      const pill = pillRef.current;
      if (!pill) return;
      pill.style.transform = `translateX(${edgeA.current.x.toFixed(2)}px)`;
      pill.style.width = `${Math.max(0, edgeB.current.x - edgeA.current.x).toFixed(2)}px`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const el = buttonsRef.current[indexRef.current];
      if (!el) return;
      edgeA.current.t = el.offsetLeft;
      edgeB.current.t = el.offsetLeft + el.offsetWidth;
      edgeA.current.x = edgeA.current.t;
      edgeB.current.x = edgeB.current.t;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="주요 메뉴"
      className="tab-glass fixed bottom-5 left-1/2 z-30 flex w-[min(100%-1.5rem,36rem)] -translate-x-1/2 rounded-full p-1"
      role="tablist"
    >
      <span
        ref={pillRef}
        aria-hidden
        className="tab-glass-pill pointer-events-none absolute top-1 bottom-1 left-0 rounded-full will-change-[transform,width]"
      />
      {TABS.map((tab, index) => {
        const selected = index === activeIndex;
        return (
          <button
            key={tab.href}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            aria-selected={selected}
            className={cn(
              "relative z-10 flex-1 whitespace-nowrap rounded-full border-0 bg-transparent px-2 py-2.5 text-sm font-medium transition-colors sm:px-3",
              selected ? "text-accent" : "text-muted hover:text-foreground",
            )}
            role="tab"
            type="button"
            onClick={() => router.push(tab.href)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
