import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export const metadata: Metadata = {
  title: "MarketPilot AI — Research Workstation",
  description:
    "Professional quant-terminal research workstation: AI analyst, forecast lab, strategy backtester, trade journal, and risk assistant.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Sidebar />
        <div className="pl-60">
          <Topbar />
          <main className="min-h-[calc(100vh-3.5rem)] p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
