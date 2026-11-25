import type { Metadata } from "next";
import { Geist_Mono, IBM_Plex_Sans_KR } from "next/font/google";

import { AppShell } from "./app-shell";
import { Providers } from "./providers";
import "./globals.css";

const ibmPlex = IBM_Plex_Sans_KR({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BlindLimit",
  description: "민감정보 유출 없이 TEE 안 AI로 계약서·장부를 검증하는 프라이버시 담보 레이어",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${ibmPlex.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-transparent text-foreground">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
