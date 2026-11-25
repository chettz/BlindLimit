"use client";

import Link from "next/link";

import { WalletButton } from "@/components/wallet-button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-white/35 px-5 backdrop-blur-md lg:px-10">
      <Link className="text-base font-semibold tracking-tight text-foreground" href="/">
        BlindLimit
      </Link>
      <div className="ml-auto">
        <WalletButton />
      </div>
    </header>
  );
}
