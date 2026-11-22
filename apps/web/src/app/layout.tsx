import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kill on Sight",
  description: "Shared KOS list",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
