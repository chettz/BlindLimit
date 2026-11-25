"use client";

import type { ReactNode } from "react";

import { RibbonBackground } from "@/components/ribbon-glow";
import { TabPill } from "@/components/tab-pill";

import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col">
      <RibbonBackground />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col pb-24">
        <AppHeader />
        {children}
      </div>
      <TabPill />
    </div>
  );
}
