"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import {
  DEMO_TICKETS,
  SOURCE_LABEL,
  STATE_LABEL,
  demoCallNext,
  demoStats,
  type DemoTicket,
} from "../lib/demo";

// prod build ใช้ "" เพื่อเรียก relative path (/api, /socket.io) ผ่าน Caddy โดเมนเดียวกัน
// ป้องกัน Browser แจ้งเตือนสิทธิ์ Private Network (Access other apps and services)
const API = process.env.NEXT_PUBLIC_API_URL || "";
const BRANCH_ID = "demo";
const COUNTER_ID = "เคาน์เตอร์ต้อนรับหน้าร้าน";
const STAFF_ID = "staff-demo";
const REFRESH_MS = 10_000;
const LATE_MIN = 20;
const RECALL_HINT_MIN = 5;

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
  tableNumber?: string;
  customerName?: string;
  totalAmount: number;
  status?: string;
  items: OrderItem[];
  createdAt?: string;
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

const OPTION_LABELS: Record<string, string> = {
  "non-spicy": "ไม่เผ็ด",
  mild: "เผ็ดน้อย",
  "extra-spicy": "เผ็ด x2",
  spicy: "ซอสเผ็ดหวาน",
  garlic: "การ์ลิคซอย",
  snow: "สโนว์ออเนียน",
  original: "ออริจินัล",
  "less-sweet": "หวาน 50%",
};

const minutesSince = (iso: string | number) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

const itemDetail = (i: OrderItem) =>
  [i.spiciness, i.sauce, i.sweetness].map((v) => v && OPTION_LABELS[v]).concat(i.note).filter(Boolean).join(" · ");

const timeText = (d: Date) =>
  d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

/** สังเคราะห์เสียงกระดิ่งเรียกคิว */
function playCallChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    // ignore
  }
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"queue" | "kds" | "insights">("queue");
  const [demo, setDemo] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [calling, setCalling] = useState<Row[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [demoTickets, setDemoTickets] = useState<DemoTicket[]>(DEMO_TICKETS);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [staffOnline, setStaffOnline] = useState(1);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [now, setNow] = useState(() => new Date());

  const loadFromApi = useCallback(async () => {
    const paths = [
      `/api/queues/stats/today?branchId=${BRANCH_ID}`,
      `/api/queues/waiting?branchId=${BRANCH_ID}`,
      `/api/queues/current-calling?branchId=${BRANCH_ID}`,
      `/api/queues/services?branchId=${BRANCH_ID}`,
      `/api/menu/orders/today?branchId=${BRANCH_ID}&status=ALL`,
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
    const clock = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(clock);
  }, [loadFromApi, loadDemo]);

  // Realtime Socket.IO Connection
  useEffect(() => {
    if (demo !== false) return;
    const reload = () => loadFromApi().catch(() => undefined);
    const log = (text: string, color = "#475569") =>
      setActivity((prev) => [{ at: new Date(), text, color }, ...prev].slice(0, 20));

    const socketUrl = API || (typeof window !== "undefined" ? window.location.origin : "");
    const socket = io(socketUrl, { transports: ["websocket", "polling"] });

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
          payload.type === "created"
            ? `🎟️ คิวใหม่ ${t.number}`
            : payload.type === "recalled"
            ? `🔁 เรียกซ้ำ ${t.number}`
            : `${t.number} → ${state.label}`;
        log(text, state.color);
      }
      reload();
    });

    socket.on("order:new", (payload: { orderNumber: string; totalAmount: number }) => {
      log(`🧾 ออเดอร์ใหม่ ${payload.orderNumber} (${baht(payload.totalAmount)})`, "#059669");
      reload();
    });

    socket.on("order:update", (payload: { orderNumber: string; status: string }) => {
      log(`🍳 ${payload.orderNumber} → ${payload.status}`, "#0284C7");
      reload();
    });

    const timer = setInterval(reload, REFRESH_MS);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [demo, loadFromApi]);

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
    playCallChime();
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

  const recall = (ticketId: string) => {
    playCallChime();
    return run(() => api(`/api/queues/tickets/${ticketId}/recall`, { method: "POST" }));
  };

  const cancelTicket = (t: Row) => {
    if (confirm(`ยกเลิกคิว ${t.number}?`)) void run(() => api(`/api/queues/tickets/${t.id}/cancel`, { method: "POST" }));
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    await run(() =>
      api(`/api/menu/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    );
  };

  const serviceName = (id?: string) =>
    services.find((s) => s.id === id)?.name.replace(/\s*\(.*\)/, "") ?? "โต๊ะทั่วไป";

  const ordersOf = (ticketId: string) => orders.filter((o) => o.ticketId === ticketId);

  // กรองคิวตามโซนโต๊ะและการค้นหา
  const filteredWaiting = useMemo(() => {
    return waiting.filter((t) => {
      const matchZone = tableFilter === "all" || t.serviceId === tableFilter;
      const matchSearch =
        !searchQuery.trim() ||
        t.number.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchZone && matchSearch;
    });
  }, [waiting, tableFilter, searchQuery]);

  const nextWaiting = waiting[0];
  const nextTable = nextWaiting ? serviceName(nextWaiting.serviceId) : null;

  // รายการเตรียมของครัวรวม
  const kitchenTally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      if (o.status === "SERVED" || o.status === "CANCELLED") continue;
      for (const item of o.items) {
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const revenue = orders.reduce((sum, o) => sum + (o.status !== "CANCELLED" ? o.totalAmount : 0), 0);

  if (demo === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 18, color: "#64748B", fontWeight: 600 }}>🍗 กำลังเปิดระบบร้านโซมายด์…</div>
      </div>
    );
  }

  return (
    <>
      {/* Top Navbar */}
      <header className="admin-navbar">
        <div className="brand-section">
          <div className="brand-logo">🍗</div>
          <div>
            <div className="brand-title">โซมายด์ (Seoulmind)</div>
            <div className="brand-sub">Staff Management Console</div>
          </div>
        </div>

        {/* Center Tabs */}
        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn${activeTab === "queue" ? " active" : ""}`}
            onClick={() => setActiveTab("queue")}
          >
            <span>🎟️</span>
            <span>คิว & โต๊ะหน้าร้าน</span>
          </button>

          <button
            className={`nav-tab-btn${activeTab === "kds" ? " active" : ""}`}
            onClick={() => setActiveTab("kds")}
          >
            <span>🍳</span>
            <span>จอครัว (KDS)</span>
          </button>

          <button
            className={`nav-tab-btn${activeTab === "insights" ? " active" : ""}`}
            onClick={() => setActiveTab("insights")}
          >
            <span>📊</span>
            <span>สรุปยอด & รายงาน</span>
          </button>
        </nav>

        {/* Right Status */}
        <div className="navbar-right">
          <div className="live-badge">
            <span className="live-dot" />
            <span>{connected ? "เรียลไทม์" : "อัปเดตทุก 10 วิ"}</span>
          </div>

          <span className="info-pill">🖥️ พนักงาน {staffOnline} เครื่อง</span>
          <span className="info-pill">🕒 {timeText(now)}</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="admin-container">
        {/* ================= TAB 1: QUEUE & TABLES ================= */}
        {activeTab === "queue" && (
          <>
            {/* Hero Call Next Bar */}
            <div className="hero-call-bar">
              <div className="hero-call-info">
                <h2>
                  <span>📢 เรียกคิวลูกค้า</span>
                  {nextWaiting && (
                    <span
                      style={{
                        background: "#E11D48",
                        color: "#fff",
                        padding: "2px 10px",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 800,
                      }}
                    >
                      ถัดไป: {nextWaiting.number}
                    </span>
                  )}
                </h2>
                <p>
                  {nextWaiting
                    ? `คิวถัดไปคือ ${nextWaiting.number} (${nextTable}) · รอนาน ${nextWaiting.waitedMin} นาที`
                    : "ไม่มีคิวที่รออยู่ในขณะนี้ 🎉 สามารถเปิดรับลูกค้า walk-in หรือจองล่วงหน้าได้เลย"}
                </p>
              </div>

              <button
                className="hero-btn"
                disabled={busy || waiting.length === 0}
                onClick={callNext}
              >
                <span>📢 เรียกคิวถัดไป (เก่าสุด)</span>
                {nextWaiting && <span>({nextWaiting.number})</span>}
              </button>
            </div>

            {/* 4 Clean KPI Cards */}
            <div className="kpi-row">
              <div className="kpi-card" style={{ borderLeft: "4px solid #F59E0B" }}>
                <div className="kpi-card-head">
                  <span>⏳ รอเรียก (Waiting)</span>
                  <span>{waiting.length ? "คิวค้าง" : "ว่าง"}</span>
                </div>
                <div className="kpi-card-val" style={{ color: "#D97706" }}>
                  {waiting.length}
                </div>
                <div className="kpi-card-sub">
                  {waiting.length
                    ? `รอนานสุด ${Math.max(...waiting.map((w) => w.waitedMin))} นาที`
                    : "ไม่มีลูกค้ารอคิว"}
                </div>
              </div>

              <div className="kpi-card" style={{ borderLeft: "4px solid #E11D48" }}>
                <div className="kpi-card-head">
                  <span>🔔 กำลังเรียก (Called)</span>
                  <span>รอลูกค้า</span>
                </div>
                <div className="kpi-card-val" style={{ color: "#E11D48" }}>
                  {stats.CALLED ?? calling.filter((c) => c.state === "CALLED").length}
                </div>
                <div className="kpi-card-sub">ลูกค้ารับทราบแล้วกำลังมาโต๊ะ</div>
              </div>

              <div className="kpi-card" style={{ borderLeft: "4px solid #8B5CF6" }}>
                <div className="kpi-card-head">
                  <span>🍽️ กำลังทาน (Seated)</span>
                  <span>ในร้าน</span>
                </div>
                <div className="kpi-card-val" style={{ color: "#7C3AED" }}>
                  {stats.SERVING ?? calling.filter((c) => c.state === "SERVING").length}
                </div>
                <div className="kpi-card-sub">โต๊ะที่กำลังเปิดให้บริการ</div>
              </div>

              <div className="kpi-card" style={{ borderLeft: "4px solid #10B981" }}>
                <div className="kpi-card-head">
                  <span>🧾 ออเดอร์วันนี้</span>
                  <span>{orders.length} บิล</span>
                </div>
                <div className="kpi-card-val" style={{ color: "#059669" }}>
                  {baht(revenue)}
                </div>
                <div className="kpi-card-sub">ยอดสั่งอาหารล่วงหน้าสะสม</div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="filter-bar">
              <div className="filter-chips">
                <button
                  className={`filter-chip${tableFilter === "all" ? " active" : ""}`}
                  onClick={() => setTableFilter("all")}
                >
                  ทุกโซนโต๊ะ ({waiting.length})
                </button>
                {services.map((s) => (
                  <button
                    key={s.id}
                    className={`filter-chip${tableFilter === s.id ? " active" : ""}`}
                    onClick={() => setTableFilter(s.id)}
                  >
                    {serviceName(s.id)} ({waiting.filter((w) => w.serviceId === s.id).length})
                  </button>
                ))}
              </div>

              <div className="search-box">
                <span>🔍</span>
                <input
                  type="text"
                  placeholder="ค้นหาเลขคิว เช่น A001..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94A3B8" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Queue Columns (2 Main Columns) */}
            <div className="queue-columns">
              {/* Column 1: Called & Serving */}
              <div className="queue-col-panel">
                <div className="queue-col-header">
                  <h3>
                    <span>🔔 กำลังเรียก & นั่งโต๊ะแล้ว</span>
                    <span className="count-badge">{calling.length}</span>
                  </h3>
                  <span style={{ fontSize: 12, color: "#64748B" }}>ต้องดูแลเป็นพิเศษ</span>
                </div>

                {calling.length === 0 && (
                  <div className="empty-box">ยังไม่มีคิวที่เรียกในขณะนี้ — กดปุ่มเรียกคิวถัดไปด้านบนได้เลย</div>
                )}

                {calling.map((t) => {
                  const preorders = ordersOf(t.id);
                  const isCalled = t.state === "CALLED";
                  return (
                    <div
                      key={t.id}
                      className={`ticket-card ${isCalled ? "called" : "serving"}`}
                    >
                      <div className="ticket-card-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="ticket-number">{t.number}</span>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              background: isCalled ? "#FFE4E6" : "#EDE9FE",
                              color: isCalled ? "#E11D48" : "#7C3AED",
                            }}
                          >
                            {isCalled ? "กำลังเรียก" : "กำลังนั่งทาน"}
                          </span>
                        </div>

                        <span style={{ fontSize: 13, color: "#64748B" }}>
                          📍 {serviceName(t.serviceId)}
                        </span>
                      </div>

                      <div className="ticket-meta">
                        <span>
                          ⏱ {isCalled ? `เรียกล่าสุด ${t.calledMin ?? 0} นาทีที่แล้ว` : `นั่งทานมา ${t.waitedMin} นาที`}
                        </span>
                        <span>· {SOURCE_LABEL[t.source] ?? t.source}</span>
                      </div>

                      {/* Preorder food preview */}
                      {preorders.length > 0 && (
                        <div className="preorder-box">
                          <div style={{ fontWeight: 700, marginBottom: 4, color: "#0F172A", display: "flex", justifyContent: "space-between" }}>
                            <span>🍗 อาหารที่สั่งล่วงหน้า:</span>
                            <span style={{ color: "#059669" }}>{baht(preorders.reduce((s, o) => s + o.totalAmount, 0))}</span>
                          </div>
                          {preorders.flatMap((o) =>
                            o.items.map((item, i) => (
                              <div key={`${o.id}-${i}`} className="preorder-item">
                                <span>{item.name} × {item.quantity}</span>
                                {itemDetail(item) && <span className="preorder-opt">{itemDetail(item)}</span>}
                              </div>
                            )),
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="ticket-actions">
                        {isCalled ? (
                          <>
                            <button
                              className="btn-action btn-seat"
                              disabled={busy}
                              onClick={() => changeState(t.id, "serving")}
                            >
                              ✅ ลูกค้านั่งโต๊ะแล้ว
                            </button>

                            <button
                              className="btn-action btn-recall"
                              disabled={busy}
                              onClick={() => recall(t.id)}
                            >
                              🔁 เรียกซ้ำ
                            </button>

                            <button
                              className="btn-action btn-cancel"
                              disabled={busy}
                              onClick={() => changeState(t.id, "no_show")}
                            >
                              ไม่มาตามนัด
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-action btn-done"
                            disabled={busy}
                            onClick={() => changeState(t.id, "done")}
                          >
                            🧾 ทานเสร็จแล้ว / เช็คบิล
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Column 2: Waiting Queue */}
              <div className="queue-col-panel">
                <div className="queue-col-header">
                  <h3>
                    <span>⏳ คิวที่รออยู่</span>
                    <span className="count-badge">{filteredWaiting.length}</span>
                  </h3>
                  <span style={{ fontSize: 12, color: "#64748B" }}>เรียงตามลำดับเวลา</span>
                </div>

                {filteredWaiting.length === 0 && (
                  <div className="empty-box">ไม่มีคิวรออยู่ในขณะนี้ 🎉</div>
                )}

                {filteredWaiting.map((t, idx) => {
                  const preorders = ordersOf(t.id);
                  const isLate = t.waitedMin >= LATE_MIN;
                  return (
                    <div key={t.id} className="ticket-card">
                      <div className="ticket-card-top">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#94A3B8", fontWeight: 700, fontSize: 14 }}>#{idx + 1}</span>
                          <span className="ticket-number">{t.number}</span>
                          {t.isVip && <span title="VIP">⭐</span>}
                        </div>

                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            background: isLate ? "#FEE2E2" : "#FEF3C7",
                            color: isLate ? "#DC2626" : "#B45309",
                          }}
                        >
                          ⏱ รอ {t.waitedMin} นาที
                        </span>
                      </div>

                      <div className="ticket-meta">
                        <span>📍 {serviceName(t.serviceId)}</span>
                        <span>· {SOURCE_LABEL[t.source] ?? t.source}</span>
                        {preorders.length > 0 && (
                          <span style={{ color: "#059669", fontWeight: 600 }}>
                            · มีออเดอร์ล่วงหน้า ({baht(preorders.reduce((s, o) => s + o.totalAmount, 0))})
                          </span>
                        )}
                      </div>

                      <div className="ticket-actions">
                        <button
                          className="btn-action btn-call"
                          disabled={busy}
                          onClick={() => {
                            playCallChime();
                            void changeState(t.id, "called");
                          }}
                        >
                          📢 เรียกคิวนี้
                        </button>

                        <button
                          className="btn-action btn-cancel"
                          disabled={busy}
                          onClick={() => cancelTicket(t)}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ================= TAB 2: EMBEDDED KDS ================= */}
        {activeTab === "kds" && (
          <div className="kds-container">
            <header className="kds-topbar">
              <h2 className="kds-title">
                <span>🍳 จอแสดงผลในครัว (KDS)</span>
                <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 400 }}>
                  จัดการออเดอร์อาหารที่ลูกค้าสั่งจาก LINE LIFF
                </span>
              </h2>

              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <Link
                  href="/kds"
                  target="_blank"
                  className="kds-btn"
                  style={{ background: "#E11D48", borderColor: "#E11D48", color: "#fff" }}
                >
                  ⛶ เปิดจอครัวเต็มจอ (สำหรับแท็บเล็ตในครัว)
                </Link>
              </div>
            </header>

            {/* Summary Bar */}
            <div className="kds-summary-bar">
              <span style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>
                🔥 ออเดอร์ที่ครัวต้องทำ: {orders.filter((o) => o.status !== "SERVED" && o.status !== "CANCELLED").length} บิล
              </span>

              {kitchenTally.length > 0 && (
                <div className="kds-tally-items">
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>ต้องเตรียมด่วน:</span>
                  {kitchenTally.slice(0, 5).map(([name, qty]) => (
                    <span key={name} className="kds-tally-item">
                      {name} <span className="qty">× {qty}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Cards Grid */}
            <div className="kds-grid">
              {orders.filter((o) => o.status !== "SERVED" && o.status !== "CANCELLED").length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: "#64748B" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍🍳</div>
                  <h3 style={{ margin: 0, fontSize: 18, color: "#94A3B8" }}>ไม่มีออเดอร์ค้างในครัว</h3>
                  <p style={{ margin: "6px 0 0", fontSize: 13 }}>เมื่อลูกค้าสั่งอาหารจาก LINE LIFF ออเดอร์จะเด้งขึ้นที่นี่ทันที</p>
                </div>
              )}

              {orders
                .filter((o) => o.status !== "SERVED" && o.status !== "CANCELLED")
                .map((order) => {
                  const isReady = order.status === "READY";
                  const elapsedMin = order.createdAt ? minutesSince(order.createdAt) : 0;
                  const isUrgent = elapsedMin >= 15;

                  return (
                    <div key={order.id} className={`kds-card${isUrgent ? " urgent" : ""}${isReady ? " ready" : ""}`}>
                      <div className="kds-card-head">
                        <div>
                          <span className="kds-order-num">{order.orderNumber}</span>
                          <span
                            style={{
                              marginLeft: 8,
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              background: isReady ? "#065F46" : "#0369A1",
                              color: isReady ? "#34D399" : "#38BDF8",
                            }}
                          >
                            {isReady ? "พร้อมเสิร์ฟ" : "กำลังปรุง"}
                          </span>
                        </div>

                        <div className={`kds-timer ${isUrgent ? "urgent" : elapsedMin >= 10 ? "warning" : "normal"}`}>
                          ⏱ {elapsedMin} นาที
                        </div>
                      </div>

                      <div className="kds-card-meta">
                        <span>📍 {order.tableNumber || "โต๊ะสั่งล่วงหน้า"}</span>
                        <span>👤 {order.customerName || "ลูกค้า"}</span>
                      </div>

                      <div className="kds-items-list">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="kds-item-row">
                            <span className="kds-item-qty">×{item.quantity}</span>
                            <div className="kds-item-content">
                              <div className="kds-item-name">{item.name}</div>
                              {itemDetail(item) && <div className="kds-item-tag">{itemDetail(item)}</div>}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="kds-card-actions">
                        {!isReady ? (
                          <button
                            className="kds-action-btn"
                            style={{ background: "#059669", color: "#fff" }}
                            onClick={() => updateOrderStatus(order.id, "READY")}
                          >
                            🔔 ปรุงเสร็จ / พร้อมเสิร์ฟ
                          </button>
                        ) : (
                          <button
                            className="kds-action-btn"
                            style={{ background: "#10B981", color: "#fff" }}
                            onClick={() => updateOrderStatus(order.id, "SERVED")}
                          >
                            ✅ เสิร์ฟแล้ว
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: INSIGHTS & REPORTS ================= */}
        {activeTab === "insights" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Best Sellers */}
            <div className="queue-col-panel">
              <div className="queue-col-header">
                <h3>
                  <span>🔥 เมนูขายดีวันนี้</span>
                  <span className="count-badge">{kitchenTally.length} รายการ</span>
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {kitchenTally.slice(0, 6).map(([name, qty], idx) => {
                  const maxQty = kitchenTally[0]?.[1] || 1;
                  const pct = Math.round((qty / maxQty) * 100);
                  return (
                    <div key={name} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span style={{ fontWeight: 600 }}>
                          {idx + 1}. {name}
                        </span>
                        <span style={{ fontWeight: 800, color: "#E11D48" }}>{qty} จาน</span>
                      </div>
                      <div style={{ width: "100%", height: 8, background: "#F1F5F9", borderRadius: 9999, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #E11D48, #F43F5E)", borderRadius: 9999 }} />
                      </div>
                    </div>
                  );
                })}
                {kitchenTally.length === 0 && <div className="empty-box">ยังไม่มีรายการสั่งอาหารวันนี้</div>}
              </div>
            </div>

            {/* Live Activity Timeline */}
            <div className="queue-col-panel">
              <div className="queue-col-header">
                <h3>
                  <span>📜 ความเคลื่อนไหวล่าสุด</span>
                  <span className="count-badge">{activity.length}</span>
                </h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activity.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "#F8FAFC",
                      borderRadius: 10,
                      border: "1px solid #F1F5F9",
                    }}
                  >
                    <span style={{ color: a.color, fontWeight: 700, fontSize: 13 }}>{a.text}</span>
                    <span style={{ color: "#94A3B8", fontSize: 12 }}>{timeText(a.at)}</span>
                  </div>
                ))}
                {activity.length === 0 && (
                  <div className="empty-box">รอเหตุการณ์ใหม่ — ระบบจะบันทึกการเรียกคิวและสั่งอาหารทันที</div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
