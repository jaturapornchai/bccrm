"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Stats = Record<string, number>;

/**
 * หน้าแดชบอร์ดเริ่มต้น — ดึงสถิติคิววันนี้จาก API
 * TODO(phase-1): login, เลือกสาขา, ตารางคิว real-time ผ่าน socket.io
 */
export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // branchId ตัวอย่าง — phase 1 จะมาจาก session หลัง login
    const branchId = new URLSearchParams(window.location.search).get("branchId") ?? "demo";
    fetch(`${API}/api/queues/stats/today?branchId=${branchId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>แดชบอร์ด BCCRM</h1>
      <p style={{ color: "#666" }}>สถิติคิววันนี้</p>

      {error && <p style={{ color: "#E02020" }}>เชื่อมต่อ API ไม่ได้: {error}</p>}

      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {Object.entries(stats).map(([state, count]) => (
            <div key={state} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#888" }}>{state}</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{count}</div>
            </div>
          ))}
        </div>
      )}

      {!stats && !error && <p>กำลังโหลด…</p>}
    </main>
  );
}
