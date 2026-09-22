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
const REFRESH_MS = 10_000;

interface ApiTicket {
  id: string;
  number: string;
  state: string;
  isVip: boolean;
  source: string;
  serviceId: string;
  createdAt: string;
}

interface ApiService {
  id: string;
  name: string;
  ticketPrefix: string;
}

interface ApiOrder {
  id: string;
  orderNumber: string;
  ticketId?: string;
  totalAmount: number;
  items: Array<{ name: string; quantity: number; note?: string }>;
}

interface Row {
  id: string;
  number: string;
  state: string;
  isVip: boolean;
  source: string;
  serviceId?: string;
  waitedMin: number;
}

const minutesSince = (iso: string | number) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

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

function ActionButton({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: "none",
        backgroundColor: color,
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

/** สรุปออเดอร์ล่วงหน้าของคิว — พนักงานเห็นว่าต้องเตรียมอะไรก่อนลูกค้าถึงโต๊ะ */
function PreorderSummary({ orders }: { orders: ApiOrder[] }) {
  if (orders.length === 0) return <span style={{ color: "#9CA3AF" }}>ไม่มีออเดอร์ล่วงหน้า</span>;
  const total = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
      {orders.flatMap((o) =>
        o.items.map((item, i) => (
          <div key={`${o.id}-${i}`}>
            {item.name} × {item.quantity}
            {item.note && <span style={{ color: "#DC2626" }}> ({item.note})</span>}
          </div>
        )),
      )}
      <div style={{ fontWeight: 700, marginTop: 2 }}>
        {orders.map((o) => o.orderNumber).join(", ")} · ฿{total}
      </div>
    </div>
  );
}

/**
 * หน้าจอพนักงานร้าน — เชื่อม API จริงถ้ามี, ถ้าไม่ได้ตกเข้าโหมดสาธิตอัตโนมัติ
 */
export default function DashboardPage() {
  const [demo, setDemo] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [calling, setCalling] = useState<Row[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [demoTickets, setDemoTickets] = useState<DemoTicket[]>(DEMO_TICKETS);
  const [busy, setBusy] = useState(false);

  const loadFromApi = useCallback(async () => {
    const urls = [
      `${API}/api/queues/stats/today?branchId=${BRANCH_ID}`,
      `${API}/api/queues/waiting?branchId=${BRANCH_ID}`,
      `${API}/api/queues/current-calling?branchId=${BRANCH_ID}`,
      `${API}/api/queues/services?branchId=${BRANCH_ID}`,
      `${API}/api/menu/orders/today?branchId=${BRANCH_ID}`,
    ];
    const responses = await Promise.all(urls.map((u) => fetch(u)));
    if (responses.some((r) => !r.ok)) throw new Error("API error");
    const [statsJson, waitingJson, callingJson, servicesJson, ordersJson] = await Promise.all(
      responses.map((r) => r.json()),
    );
    const toRow = (t: ApiTicket): Row => ({
      id: t.id,
      number: t.number,
      state: t.state,
      isVip: t.isVip,
      source: t.source,
      serviceId: t.serviceId,
      waitedMin: minutesSince(t.createdAt),
    });
    setStats(statsJson as Record<string, number>);
    setWaiting((waitingJson as ApiTicket[]).map(toRow));
    setCalling(((callingJson as { callingTickets: ApiTicket[] }).callingTickets ?? []).map(toRow));
    setServices(servicesJson as ApiService[]);
    setOrders(ordersJson as ApiOrder[]);
    setUpdatedAt(new Date());
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
          waitedMin: minutesSince(t.createdAt),
        })),
    );
    setDemo(true);
  }, [demoTickets]);

  useEffect(() => {
    loadFromApi().catch(loadDemo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ลูกค้าจองผ่าน LINE ได้ตลอด — รีเฟรชเองให้พนักงานไม่ต้องกดโหลดหน้าใหม่
  useEffect(() => {
    if (demo !== false) return;
    const timer = setInterval(() => loadFromApi().catch(() => undefined), REFRESH_MS);
    return () => clearInterval(timer);
  }, [demo, loadFromApi]);

  useEffect(() => {
    if (demo) loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoTickets]);

  const run = async (request: () => Promise<Response>) => {
    setBusy(true);
    try {
      const res = await request();
      if (!res.ok) alert(`ทำรายการไม่สำเร็จ: ${(await res.json().catch(() => ({}))).message ?? res.status}`);
      await loadFromApi();
    } finally {
      setBusy(false);
    }
  };

  const callNext = async () => {
    if (demo) {
      setDemoTickets((prev) => demoCallNext(prev));
      return;
    }
    await run(() =>
      fetch(`${API}/api/queues/call-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: BRANCH_ID, counterId: COUNTER_ID, staffId: STAFF_ID }),
      }),
    );
  };

  const changeState = (ticketId: string, state: string) =>
    run(() => fetch(`${API}/api/queues/tickets/${ticketId}/state/${state}`, { method: "PATCH" }));

  if (demo === null) {
    return <main style={{ padding: 24 }}>กำลังโหลด…</main>;
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const statOrder = ["SERVING", "CALLED", "WAITING", "BOOKED", "DONE", "NO_SHOW", "CANCELLED"];
  const serviceName = (id?: string) => services.find((s) => s.id === id)?.name.replace(/\s*\(.*\)/, "") ?? "";
  const ordersOf = (ticketId: string) => orders.filter((o) => o.ticketId === ticketId);
  const visibleWaiting = tableFilter === "all" ? waiting : waiting.filter((t) => t.serviceId === tableFilter);
  const cell = { padding: 10, verticalAlign: "top" } as const;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>🍗 โซมายด์ — หน้าจอพนักงาน</h1>
        {demo ? (
          <span style={{ padding: "4px 12px", borderRadius: 9999, background: "#FEF3C7", color: "#92400E", fontSize: 13, fontWeight: 600 }}>
            โหมดสาธิต — ไม่ได้เชื่อม backend
          </span>
        ) : (
          <span style={{ padding: "4px 12px", borderRadius: 9999, background: "#D1FAE5", color: "#065F46", fontSize: 13, fontWeight: 600 }}>
            ● ออนไลน์ · อัปเดต {updatedAt?.toLocaleTimeString("th-TH")}
          </span>
        )}
      </header>
      <p style={{ color: "#666" }}>สถิติคิววันนี้ · รวม {total} คิว · ออเดอร์ล่วงหน้า {orders.length} บิล</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 8 }}>
        {statOrder.filter((s) => stats[s]).map((state) => (
          <div key={state} style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
            <Badge state={state} />
            <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{stats[state]}</div>
          </div>
        ))}
      </div>

      {!demo && (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🔔 เรียกแล้ว / กำลังนั่งทาน ({calling.length})</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <tbody>
              {calling.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...cell, fontWeight: 700, fontSize: 18, width: 90 }}>{t.number}</td>
                  <td style={{ ...cell, width: 140 }}>
                    <Badge state={t.state} />
                    <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{serviceName(t.serviceId)}</div>
                  </td>
                  <td style={cell}><PreorderSummary orders={ordersOf(t.id)} /></td>
                  <td style={{ ...cell, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {t.state === "CALLED" && (
                        <>
                          <ActionButton label="✅ นั่งแล้ว" color="#2563EB" disabled={busy} onClick={() => changeState(t.id, "serving")} />
                          <ActionButton label="ไม่มา" color="#9CA3AF" disabled={busy} onClick={() => changeState(t.id, "no_show")} />
                        </>
                      )}
                      {t.state === "SERVING" && (
                        <ActionButton label="🧾 เสร็จ / เช็คบิล" color="#059669" disabled={busy} onClick={() => changeState(t.id, "done")} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {calling.length === 0 && (
                <tr><td style={{ padding: 16, color: "#9CA3AF" }}>ยังไม่มีคิวที่เรียก</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>⏳ คิวที่รอเรียก ({waiting.length})</h2>
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
            📢 เรียกคิวถัดไป (เก่าสุด)
          </button>
        </div>

        {!demo && services.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {[{ id: "all", label: "ทุกโต๊ะ" }, ...services.map((s) => ({ id: s.id, label: serviceName(s.id) }))].map((f) => {
              const count = f.id === "all" ? waiting.length : waiting.filter((t) => t.serviceId === f.id).length;
              const active = tableFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setTableFilter(f.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 9999,
                    border: `1px solid ${active ? "#E11D48" : "#E5E7EB"}`,
                    background: active ? "#E11D48" : "#fff",
                    color: active ? "#fff" : "#374151",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#888", fontSize: 13, borderBottom: "2px solid #eee" }}>
              <th style={{ padding: 8 }}>เลขคิว</th>
              <th style={{ padding: 8 }}>โต๊ะ / ช่องทาง</th>
              {!demo && <th style={{ padding: 8 }}>ออเดอร์ล่วงหน้า</th>}
              <th style={{ padding: 8 }}>รอมาแล้ว</th>
              {!demo && <th style={{ padding: 8 }} />}
            </tr>
          </thead>
          <tbody>
            {visibleWaiting.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...cell, fontWeight: 700, fontSize: 18 }}>
                  {t.number} {t.isVip && <span title="VIP">⭐</span>}
                </td>
                <td style={{ ...cell, color: "#666" }}>
                  <div>{serviceName(t.serviceId)}</div>
                  <div style={{ fontSize: 13 }}>{SOURCE_LABEL[t.source] ?? t.source}</div>
                </td>
                {!demo && <td style={cell}><PreorderSummary orders={ordersOf(t.id)} /></td>}
                <td style={{ ...cell, color: "#666" }}>{t.waitedMin} นาที</td>
                {!demo && (
                  <td style={{ ...cell, textAlign: "right" }}>
                    <ActionButton label="📢 เรียก" color="#E11D48" disabled={busy} onClick={() => changeState(t.id, "called")} />
                  </td>
                )}
              </tr>
            ))}
            {visibleWaiting.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>ไม่มีคิวที่รออยู่ 🎉</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
