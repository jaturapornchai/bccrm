"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import {
  DEMO_TICKETS,
  SOURCE_LABEL,
  STATE_LABEL,
  demoCallNext,
  demoStats,
  type DemoTicket,
} from "../lib/demo";

// prod build ตั้งเป็น "" → เรียก /api และ /socket.io โดเมนเดียวกัน (Caddy proxy ไป API)
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const BRANCH_ID = "demo";
const COUNTER_ID = "เคาน์เตอร์ต้อนรับ"; // แสดงบน LINE push/บัตรคิวลูกค้า
const STAFF_ID = "staff-demo";
const REFRESH_MS = 10_000;
const LATE_MIN = 30;
const RECALL_HINT_MIN = 5; // เรียกแล้วเกิน 5 นาทียังไม่มา → เน้นสีให้พนักงานเรียกซ้ำ
const ACTIVITY_MAX = 30;

// ponytail: เปิดเดโม่ไม่ต้อง login (ลุงจืด 2026-09-23) — ใส่ auth เมื่อเปิดใช้กับร้านจริง
const api = (path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

interface ApiTicket {
  id: string;
  number: string;
  state: string;
  isVip: boolean;
  source: string;
  serviceId: string;
  createdAt: string;
  calledAt?: string | null;
}

interface ApiService {
  id: string;
  name: string;
  ticketPrefix: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  note?: string;
  spiciness?: string;
  sauce?: string;
  sweetness?: string;
}

interface ApiOrder {
  id: string;
  orderNumber: string;
  ticketId?: string;
  totalAmount: number;
  items: OrderItem[];
}

interface Row {
  id: string;
  number: string;
  state: string;
  isVip: boolean;
  source: string;
  serviceId?: string;
  waitedMin: number;
  calledMin?: number;
}

interface Activity {
  at: Date;
  text: string;
  color: string;
}

// ค่าเดียวกับที่ LIFF ส่งมา (apps/liff OPTION_LABELS) — "normal" ไม่แสดง ให้ครัวเห็นเฉพาะที่ต่างจากปกติ
const OPTION_LABELS: Record<string, string> = {
  "non-spicy": "ไม่เผ็ด",
  mild: "เผ็ดน้อย",
  "extra-spicy": "เผ็ดเกาหลี x2",
  spicy: "ซอสเกาหลีเผ็ดหวาน",
  garlic: "ซอสการ์ลิคซอย",
  snow: "ซอสสโนว์ออเนียน",
  original: "ออริจินัล",
  "less-sweet": "หวานน้อย 50%",
};

const STAT_ORDER = ["WAITING", "CALLED", "SERVING", "DONE", "NO_SHOW", "CANCELLED", "BOOKED"];

const minutesSince = (iso: string | number) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const itemDetail = (i: OrderItem) =>
  [i.spiciness, i.sauce, i.sweetness].map((v) => v && OPTION_LABELS[v]).concat(i.note).filter(Boolean).join(" · ");
const timeText = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

/** รวมจำนวนจานตามเมนู (+ตัวเลือก) เรียงมากไปน้อย */
function tally(orders: ApiOrder[], withDetail: boolean) {
  const rows = new Map<string, { name: string; detail: string; qty: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const detail = withDetail ? itemDetail(item) : "";
      const key = `${item.name}|${detail}`;
      const row = rows.get(key) ?? { name: item.name, detail, qty: 0 };
      row.qty += item.quantity;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.qty - a.qty);
}

function Badge({ state }: { state: string }) {
  const { label, color } = STATE_LABEL[state] ?? { label: state, color: "#6B7280" };
  return (
    <span
      style={{
        display: "inline-block",
        width: "fit-content",
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

function Kpi({ icon, label, value, sub, color }: { icon: string; label: string; value: ReactNode; sub?: string; color: string }) {
  return (
    <div className="card kpi" style={{ borderTop: `4px solid ${color}` }}>
      <div className="kpi-label">
        {icon} {label}
      </div>
      <div className="kpi-value" style={{ color }}>
        {value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** สรุปออเดอร์ล่วงหน้าของคิว — พนักงานเห็นว่าต้องเตรียมอะไรก่อนลูกค้าถึงโต๊ะ */
function PreorderSummary({ orders }: { orders: ApiOrder[] }) {
  if (orders.length === 0) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>ไม่มีออเดอร์ล่วงหน้า</span>;
  const total = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
      {orders.flatMap((o) =>
        o.items.map((item, i) => (
          <div key={`${o.id}-${i}`}>
            {item.name} × {item.quantity}
            {itemDetail(item) && <span style={{ color: "#B45309" }}> · {itemDetail(item)}</span>}
          </div>
        )),
      )}
      <div style={{ fontWeight: 700, marginTop: 2 }}>
        {orders.map((o) => o.orderNumber).join(", ")} · {baht(total)}
      </div>
    </div>
  );
}

function TicketRow({ t, table, orders, actions }: { t: Row; table: string; orders?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="trow">
      <div className="tnum">
        {t.number} {t.isVip && <span title="VIP">⭐</span>}
      </div>
      <div className="tmeta">
        <Badge state={t.state} />
        <span>{[table, SOURCE_LABEL[t.source] ?? t.source].filter(Boolean).join(" · ")}</span>
        <span className={t.waitedMin >= LATE_MIN ? "late" : undefined}>⏱ {t.waitedMin} นาทีตั้งแต่เข้าคิว</span>
        {t.state === "CALLED" && t.calledMin !== undefined && (
          <span className={t.calledMin >= RECALL_HINT_MIN ? "late" : undefined}>📢 เรียกล่าสุด {t.calledMin} นาทีที่แล้ว</span>
        )}
      </div>
      {orders && <div className="torder">{orders}</div>}
      {actions && <div className="tact">{actions}</div>}
    </div>
  );
}

/**
 * Dashboard พนักงานร้าน — เปิดพร้อมกันได้หลายเครื่อง ทุกเครื่องเห็นสถานะเดียวกันแบบ realtime
 * (socket.io + poll สำรอง) ถ้าเชื่อม API ไม่ได้ตกเข้าโหมดสาธิตอัตโนมัติ
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
  const [connected, setConnected] = useState(false);
  const [staffOnline, setStaffOnline] = useState(0);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [now, setNow] = useState(() => new Date());

  const loadFromApi = useCallback(async () => {
    const paths = [
      `/api/queues/stats/today?branchId=${BRANCH_ID}`,
      `/api/queues/waiting?branchId=${BRANCH_ID}`,
      `/api/queues/current-calling?branchId=${BRANCH_ID}`,
      `/api/queues/services?branchId=${BRANCH_ID}`,
      `/api/menu/orders/today?branchId=${BRANCH_ID}`,
    ];
    const responses = await Promise.all(paths.map((p) => api(p)));
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
      calledMin: t.calledAt ? minutesSince(t.calledAt) : undefined,
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
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ทุกเครื่องเห็นการเปลี่ยนแปลงของกันและกันผ่าน socket (ห้อง staff:<branch>) + poll สำรองเผื่อ socket หลุด
  useEffect(() => {
    if (demo !== false) return;
    const reload = () => loadFromApi().catch(() => undefined);
    const log = (text: string, color = "#475569") =>
      setActivity((prev) => [{ at: new Date(), text, color }, ...prev].slice(0, ACTIVITY_MAX));
    const socket = io(API || window.location.origin, { transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-staff", BRANCH_ID);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("staff:count", (count: number) => setStaffOnline(count));
    socket.on("queue:update", (payload: { type?: string; ticket?: ApiTicket }) => {
      const t = payload.ticket;
      if (t) {
        const state = STATE_LABEL[t.state] ?? { label: t.state, color: "#475569" };
        const text =
          payload.type === "created" ? `🎟️ คิวใหม่ ${t.number}` : payload.type === "recalled" ? `🔁 เรียกซ้ำ ${t.number}` : `${t.number} → ${state.label}`;
        log(text, state.color);
      }
      reload();
    });
    socket.on("order:new", (payload: { orderNumber: string; totalAmount: number }) => {
      log(`🧾 ออเดอร์ล่วงหน้า ${payload.orderNumber} · ${baht(payload.totalAmount)}`, "#059669");
      reload();
    });
    const timer = setInterval(reload, REFRESH_MS);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
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
      api("/api/queues/call-next", {
        method: "POST",
        body: JSON.stringify({ branchId: BRANCH_ID, counterId: COUNTER_ID, staffId: STAFF_ID }),
      }),
    );
  };

  const changeState = (ticketId: string, state: string) =>
    run(() => api(`/api/queues/tickets/${ticketId}/state/${state}`, { method: "PATCH" }));

  const recall = (ticketId: string) => run(() => api(`/api/queues/tickets/${ticketId}/recall`, { method: "POST" }));

  const cancelTicket = (t: Row) => {
    if (confirm(`ยกเลิกคิว ${t.number}?`)) void run(() => api(`/api/queues/tickets/${t.id}/cancel`, { method: "POST" }));
  };

  if (demo === null) {
    return <main style={{ padding: 24 }}>กำลังโหลด…</main>;
  }

  const totalTickets = Object.values(stats).reduce((a, b) => a + b, 0);
  const serviceName = (id?: string) => services.find((s) => s.id === id)?.name.replace(/\s*\(.*\)/, "") ?? "";
  const ordersOf = (ticketId: string) => orders.filter((o) => o.ticketId === ticketId);
  const visibleWaiting = tableFilter === "all" ? waiting : waiting.filter((t) => t.serviceId === tableFilter);
  const activeIds = new Set([...waiting, ...calling].map((t) => t.id));
  const kitchen = tally(orders.filter((o) => o.ticketId && activeIds.has(o.ticketId)), true);
  const topDishes = tally(orders, false).slice(0, 5);
  const revenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const longestWait = waiting.reduce((max, t) => Math.max(max, t.waitedMin), 0);
  const avgWait = waiting.length ? Math.round(waiting.reduce((sum, t) => sum + t.waitedMin, 0) / waiting.length) : 0;

  return (
    <>
      <header className="topbar">
        <h1>🍗 โซมายด์ · Staff Dashboard</h1>
        {demo ? (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E" }}>
            โหมดสาธิต — ไม่ได้เชื่อม backend
          </span>
        ) : (
          <>
            <span className="pill">{connected ? "🟢 เรียลไทม์" : "🟡 กำลังเชื่อมต่อใหม่ (อัปเดตทุก 10 วิ)"}</span>
            <span className="pill">🖥️ พนักงานออนไลน์ {staffOnline} เครื่อง</span>
            <span className="pill">อัปเดต {updatedAt ? timeText(updatedAt) : "-"}</span>
          </>
        )}
        <span className="spacer">
          🕒 {timeText(now)} · 🧪 เดโม่ระบบ — กดได้ทุกปุ่ม
        </span>
      </header>

      <main className="wrap">
        <div className="kpis">
          <Kpi icon="⏳" label="รอเรียก" value={waiting.length} sub={waiting.length ? `เฉลี่ย ${avgWait} นาที` : "ไม่มีคิวค้าง"} color="#D97706" />
          <Kpi icon="🔔" label="เรียกแล้ว" value={stats.CALLED ?? 0} sub="รอลูกค้ามาที่ร้าน" color="#E11D48" />
          <Kpi icon="🍽️" label="กำลังนั่งทาน" value={stats.SERVING ?? 0} color="#7C3AED" />
          <Kpi icon="✅" label="เสร็จแล้ววันนี้" value={stats.DONE ?? 0} sub={`ไม่มา ${stats.NO_SHOW ?? 0} · ยกเลิก ${stats.CANCELLED ?? 0}`} color="#059669" />
          {!demo && (
            <>
              <Kpi icon="🧾" label="ออเดอร์ล่วงหน้า" value={orders.length} sub={`${tally(orders, false).reduce((s, r) => s + r.qty, 0)} จาน`} color="#0284C7" />
              <Kpi icon="💰" label="ยอดสั่งล่วงหน้าวันนี้" value={baht(revenue)} sub={orders.length ? `เฉลี่ย ${baht(Math.round(revenue / orders.length))}/บิล` : undefined} color="#0F766E" />
            </>
          )}
          <Kpi icon="⌛" label="รอนานสุด" value={`${longestWait} นาที`} sub={longestWait >= LATE_MIN ? "⚠️ เกิน 30 นาที" : "ปกติ"} color={longestWait >= LATE_MIN ? "#DC2626" : "#475569"} />
        </div>

        <Panel title={`📊 สถานะคิววันนี้ · รวม ${totalTickets} คิว`}>
          <div className="stack">
            {STAT_ORDER.filter((s) => stats[s]).map((s) => (
              <div key={s} title={`${STATE_LABEL[s]?.label ?? s}: ${stats[s]}`} style={{ flex: stats[s], background: STATE_LABEL[s]?.color ?? "#94A3B8" }} />
            ))}
          </div>
          <div className="legend">
            {STAT_ORDER.filter((s) => stats[s]).map((s) => (
              <span key={s}>
                <span className="dot" style={{ background: STATE_LABEL[s]?.color ?? "#94A3B8" }} />
                {STATE_LABEL[s]?.label ?? s} <b>{stats[s]}</b>
              </span>
            ))}
            {totalTickets === 0 && <span>ยังไม่มีคิววันนี้</span>}
          </div>
          {!demo && services.length > 0 && (
            <div className="svc-grid">
              {services.map((s) => {
                const svcWaiting = waiting.filter((t) => t.serviceId === s.id);
                const oldest = svcWaiting.reduce((max, t) => Math.max(max, t.waitedMin), 0);
                return (
                  <div key={s.id} className="svc">
                    <b>{serviceName(s.id)}</b>
                    รอ <b style={{ display: "inline", color: "#D97706" }}>{svcWaiting.length}</b> · เรียก/ทาน{" "}
                    {calling.filter((t) => t.serviceId === s.id).length}
                    <div className={oldest >= LATE_MIN ? "late" : undefined}>{svcWaiting.length ? `รอนานสุด ${oldest} นาที` : "ว่าง"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="cols">
          <div className="stackcol">
            {!demo && (
              <Panel title={`🔔 เรียกแล้ว / กำลังนั่งทาน (${calling.length})`}>
                {calling.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    table={serviceName(t.serviceId)}
                    orders={<PreorderSummary orders={ordersOf(t.id)} />}
                    actions={
                      t.state === "CALLED" ? (
                        <>
                          <ActionButton label="🔁 เรียกซ้ำ" color="#D97706" disabled={busy} onClick={() => recall(t.id)} />
                          <ActionButton label="✅ นั่งแล้ว" color="#2563EB" disabled={busy} onClick={() => changeState(t.id, "serving")} />
                          <ActionButton label="ไม่มา" color="#9CA3AF" disabled={busy} onClick={() => changeState(t.id, "no_show")} />
                        </>
                      ) : (
                        <ActionButton label="🧾 เสร็จ / เช็คบิล" color="#059669" disabled={busy} onClick={() => changeState(t.id, "done")} />
                      )
                    }
                  />
                ))}
                {calling.length === 0 && <div className="empty">ยังไม่มีคิวที่เรียก</div>}
              </Panel>
            )}

            <Panel
              title={`⏳ คิวที่รอเรียก (${waiting.length})`}
              right={
                <ActionButton label="📢 เรียกคิวถัดไป (เก่าสุด)" color="#06C755" disabled={busy || waiting.length === 0} onClick={callNext} />
              }
            >
              {!demo && services.length > 0 && (
                <div className="chips">
                  {[{ id: "all", label: "ทุกโต๊ะ" }, ...services.map((s) => ({ id: s.id, label: serviceName(s.id) }))].map((f) => (
                    <button key={f.id} className={`chip${tableFilter === f.id ? " on" : ""}`} onClick={() => setTableFilter(f.id)}>
                      {f.label} ({f.id === "all" ? waiting.length : waiting.filter((t) => t.serviceId === f.id).length})
                    </button>
                  ))}
                </div>
              )}
              {visibleWaiting.map((t) => (
                <TicketRow
                  key={t.id}
                  t={t}
                  table={serviceName(t.serviceId)}
                  orders={demo ? undefined : <PreorderSummary orders={ordersOf(t.id)} />}
                  actions={
                    demo ? undefined : (
                      <>
                        <ActionButton label="📢 เรียก" color="#E11D48" disabled={busy} onClick={() => changeState(t.id, "called")} />
                        <ActionButton label="ยกเลิก" color="#94A3B8" disabled={busy} onClick={() => cancelTicket(t)} />
                      </>
                    )
                  }
                />
              ))}
              {visibleWaiting.length === 0 && <div className="empty">ไม่มีคิวที่รออยู่ 🎉</div>}
            </Panel>
          </div>

          {!demo && (
            <div className="stackcol">
              <Panel title="🍳 ครัว — ต้องเตรียม (คิวที่ยังไม่เสร็จ)">
                <ul className="list">
                  {kitchen.map((r) => (
                    <li key={`${r.name}|${r.detail}`}>
                      <span>
                        {r.name}
                        {r.detail && <small>{r.detail}</small>}
                      </span>
                      <span className="qty">× {r.qty}</span>
                    </li>
                  ))}
                </ul>
                {kitchen.length === 0 && <div className="empty">ยังไม่มีรายการต้องเตรียม</div>}
              </Panel>

              <Panel title="🔥 เมนูขายดีวันนี้">
                <ul className="list">
                  {topDishes.map((r, i) => (
                    <li key={r.name}>
                      <span>
                        {i + 1}. {r.name}
                      </span>
                      <span className="qty">{r.qty} จาน</span>
                    </li>
                  ))}
                </ul>
                {topDishes.length === 0 && <div className="empty">ยังไม่มีออเดอร์วันนี้</div>}
              </Panel>

              <Panel title="📜 ความเคลื่อนไหวล่าสุด (ทุกเครื่อง)">
                <ul className="list">
                  {activity.map((a, i) => (
                    <li key={`${a.at.getTime()}-${i}`}>
                      <span style={{ color: a.color, fontWeight: 600 }}>{a.text}</span>
                      <span style={{ color: "#94A3B8", fontSize: 12 }}>{timeText(a.at)}</span>
                    </li>
                  ))}
                </ul>
                {activity.length === 0 && <div className="empty">รอเหตุการณ์ใหม่ — แสดงทันทีเมื่อมีการเปลี่ยนแปลงจากทุกเครื่อง</div>}
              </Panel>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
