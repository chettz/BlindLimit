"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { RibbonBackground } from "@/components/ribbon-glow";
import { TabPill } from "@/components/tab-pill";
import { Alert } from "@/components/ui/page-shell";

import { AppHeader } from "./app-header";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showLocalOnly = !pathname.startsWith("/verify");

  return (
    <div className="relative flex min-h-dvh flex-col">
      <RibbonBackground />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col pb-24">
        <AppHeader />
        {showLocalOnly ? (
          <div className="mx-auto w-full max-w-6xl px-5 pt-4 lg:px-10">
            <Alert tone="warning">이 화면은 로컬 테스트넷에서만 동작합니다. TEE 검증은 /verify 를 이용하세요.</Alert>
          </div>
        ) : null}
        {children}
      </div>
      <TabPill />
    </div>
  );
}
