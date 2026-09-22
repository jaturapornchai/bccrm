import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "โซมายด์ — Staff Dashboard",
  description: "ระบบ CRM + Queue สำหรับธุรกิจไทย (Open Source)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
      </body>
    </html>
  );
}
