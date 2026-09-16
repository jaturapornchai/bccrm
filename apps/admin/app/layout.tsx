import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "BCCRM Admin — ระบบจัดการคิวและลูกค้า",
  description: "ระบบ CRM + Queue สำหรับธุรกิจไทย (Open Source)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "system-ui, 'Sarabun', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
