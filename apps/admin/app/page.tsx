"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEMO_TICKETS,
  SOURCE_LABEL,
  STATE_LABEL,
  demoCallNext,
  demoStats,
  type DemoTicket,
} from "../lib/demo";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const BRANCH_ID = "demo";
const COUNTER_ID = "counter-1";
const STAFF_ID = "staff-demo";

interface ApiTicket {
  id: string;
  number: string;
  state: string;
  isVip: boolean;
  source: string;
  createdAt: string;
}

function Badge({ state }: { state: string }) {
  const { label, color } = STATE_LABEL[state] ?? { label: state, color: "#6B7280" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        backgroundColor: `${color}1A`,
        color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

/**
 * แดชบอร์ดคิว — เชื่อม API จริงถ้ามี, ถ้าไม่ได้ตกเข้าโหมดสาธิตอัตโนมัติ
 */
export default function DashboardPage() {
  const [demo, setDemo] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [waiting, setWaiting] = useState<Array<{ id: string; number: string; state: string; isVip: boolean; source: string; waitedMin: number }>>([]);
  const [demoTickets, setDemoTickets] = useState<DemoTicket[]>(DEMO_TICKETS);
  const [busy, setBusy] = useState(false);

  const loadFromApi = useCallback(async () => {
    const [statsRes, waitingRes] = await Promise.all([
      fetch(`${API}/api/queues/stats/today?branchId=${BRANCH_ID}`),
      fetch(`${API}/api/queues/waiting?branchId=${BRANCH_ID}`),
    ]);
    if (!statsRes.ok || !waitingRes.ok) throw new Error("API error");
    const statsJson = (await statsRes.json()) as Record<string, number>;
    const waitingJson = (await waitingRes.json()) as ApiTicket[];
    setStats(statsJson);
    setWaiting(
      waitingJson.map((t) => ({
        id: t.id,
        number: t.number,
        state: t.state,
        isVip: t.isVip,
        source: t.source,
        waitedMin: Math.max(0, Math.round((Date.now() - new Date(t.createdAt).getTime()) / 60000)),
      })),
    );
    setDemo(false);
  }, []);

  const loadDemo = useCallback(() => {
    setStats(demoStats(demoTickets));
    setWaiting(
      demoTickets
        .filter((t) => t.state === "WAITING")
        .sort((a, b) => (a.isVip === b.isVip ? a.createdAt - b.createdAt : a.isVip ? -1 : 1))
        .map((t) => ({
          id: t.id,
          number: t.number,
          state: t.state,
          isVip: t.isVip,
          source: t.source,
          waitedMin: Math.max(0, Math.round((Date.now() - t.createdAt) / 60000)),
        })),
    );
    setDemo(true);
  }, [demoTickets]);

  useEffect(() => {
    loadFromApi().catch(loadDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (demo) loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoTickets]);

  const callNext = async () => {
    setBusy(true);
    try {
      if (demo) {
        setDemoTickets((prev) => demoCallNext(prev));
      } else {
        const res = await fetch(`${API}/api/queues/call-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branchId: BRANCH_ID, counterId: COUNTER_ID, staffId: STAFF_ID }),
        });
        if (!res.ok) throw new Error("call-next ล้มเหลว");
        await loadFromApi();
      }
    } finally {
      setBusy(false);
    }
  };

  if (demo === null) {
    return <main style={{ padding: 24 }}>กำลังโหลด…</main>;
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const order = ["SERVING", "CALLED", "WAITING", "BOOKED", "DONE", "NO_SHOW", "CANCELLED"];

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>แดชบอร์ด BCCRM</h1>
        {demo ? (
          <span style={{ padding: "4px 12px", borderRadius: 9999, background: "#FEF3C7", color: "#92400E", fontSize: 13, fontWeight: 600 }}>
            โหมดสาธิต — ไม่ได้เชื่อม backend
          </span>
        ) : (
          <span style={{ padding: "4px 12px", borderRadius: 9999, background: "#D1FAE5", color: "#065F46", fontSize: 13, fontWeight: 600 }}>
            เชื่อมต่อ API แล้ว
          </span>
        )}
      </header>
      <p style={{ color: "#666" }}>สถิติคิววันนี้ · สาขา {BRANCH_ID} · รวม {total} คิว</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 8 }}>
        {order.filter((s) => stats[s]).map((state) => (
          <div key={state} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
            <Badge state={state} />
            <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{stats[state]}</div>
          </div>
        ))}
      </div>

      <section style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>คิวที่รอเรียก ({waiting.length})</h2>
          <button
            onClick={callNext}
            disabled={busy || waiting.length === 0}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              backgroundColor: waiting.length === 0 ? "#D1D5DB" : "#06C755",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: waiting.length === 0 ? "default" : "pointer",
            }}
          >
            📢 เรียกคิวถัดไป
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#888", fontSize: 13, borderBottom: "2px solid #eee" }}>
              <th style={{ padding: 8 }}>เลขคิว</th>
              <th style={{ padding: 8 }}>สถานะ</th>
              <th style={{ padding: 8 }}>ช่องทาง</th>
              <th style={{ padding: 8 }}>รอมาแล้ว</th>
            </tr>
          </thead>
          <tbody>
            {waiting.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10, fontWeight: 700, fontSize: 18 }}>
                  {t.number} {t.isVip && <span title="VIP">⭐</span>}
                </td>
                <td style={{ padding: 10 }}><Badge state={t.state} /></td>
                <td style={{ padding: 10, color: "#666" }}>{SOURCE_LABEL[t.source] ?? t.source}</td>
                <td style={{ padding: 10, color: "#666" }}>{t.waitedMin} นาที</td>
              </tr>
            ))}
            {waiting.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>ไม่มีคิวที่รออยู่ 🎉</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
