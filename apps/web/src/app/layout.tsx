import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import { DiscordActivity } from "@/components/DiscordActivity";
import "./globals.css";

// Self-hosted at build time. A Google Fonts <link>/@import would be blocked
// inside the Discord Activity, whose proxy only reaches our own origin.
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Kill on Sight",
  description: "Shared KOS list",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <DiscordActivity />
        {children}
      </body>
    </html>
  );
}
