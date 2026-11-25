"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";

export function WalletButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button className={fullWidth ? "w-full" : undefined} disabled size="sm">
        지갑 연결
      </Button>
    );
  }

  if (isConnected) {
    return (
      <Button
        className={fullWidth ? "w-full" : undefined}
        size="sm"
        variant="ghost"
        onClick={() => disconnect()}
      >
        {shortAddress(address)}
      </Button>
    );
  }

  return (
    <Button
      className={fullWidth ? "w-full" : undefined}
      disabled={isPending || connectors.length === 0}
      size="sm"
      onClick={() => {
        // Phantom이 ethereum을 가로채면 로컬 anvil 서명이 거절되는 경우가 많음 → MetaMask 우선
        const connector =
          connectors.find((item) => /metamask/i.test(item.name) || item.id === "metaMask") ?? connectors[0];
        if (connector) void connect({ connector });
      }}
    >
      {isPending ? "연결 중" : "지갑 연결"}
    </Button>
  );
}

function shortAddress(value: string | undefined): string {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
