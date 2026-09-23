"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { io } from "socket.io-client";

const API = process.env.NEXT_PUBLIC_API_URL || "";
const BRANCH_ID = "demo";
const REFRESH_MS = 10_000;

const api = (path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

interface OrderItem {
  itemId?: string;
  name: string;
  price: number;
  quantity: number;
  spiciness?: string;
  sauce?: string;
  sweetness?: string;
  note?: string;
  subtotal?: number;
}

export type OrderStatus = "PENDING" | "COOKING" | "READY" | "SERVED" | "CANCELLED";

interface OrderRecord {
  id: string;
  orderNumber: string;
  branchId: string;
  tableNumber?: string;
  ticketId?: string;
  customerName?: string;
  phone?: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  note?: string;
  createdAt: string;
  updatedAt?: string;
}

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

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: "รอทำ", color: "#F59E0B", bg: "#78350F" },
  COOKING: { label: "กำลังปรุง", color: "#38BDF8", bg: "#0369A1" },
  READY: { label: "พร้อมเสิร์ฟ", color: "#34D399", bg: "#065F46" },
  SERVED: { label: "เสิร์ฟแล้ว", color: "#94A3B8", bg: "#334155" },
  CANCELLED: { label: "ยกเลิก", color: "#F87171", bg: "#7F1D1D" },
};

/** เสียงกริ่งแจ้งเตือนเมื่อมีออเดอร์ใหม่เข้าครัว (Web Audio API สังเคราะห์ ไม่ต้องใช้ไฟล์ภายนอก) */
function playKitchenChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.3, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.9);
  } catch {
    // Audio context may require user interaction
  }
}

export default function KdsPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "COOKING" | "READY" | "SERVED" | "ALL">("ACTIVE");
  const [stationFilter, setStationFilter] = useState<string>("ALL");
  const [struckItems, setStruckItems] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // นาฬิกาเดินทุก 1 วินาที เพื่อให้อัปเดตเวลาบนตัวจับเวลาแบบเรียลไทม์
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const res = await api(`/api/menu/orders/today?branchId=${BRANCH_ID}&status=ALL`);
      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as OrderRecord[];
      setOrders(data);
    } catch (err) {
      console.error("Load orders error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();

    const socket = io(API || window.location.origin, { transports: ["websocket", "polling"] });
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-staff", BRANCH_ID);
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("order:new", () => {
      if (audioEnabled) playKitchenChime();
      void loadOrders();
    });

    socket.on("order:update", () => {
      void loadOrders();
    });

    const timer = setInterval(loadOrders, REFRESH_MS);

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [loadOrders, audioEnabled]);

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setBusyId(orderId);
    try {
      const res = await api(`/api/menu/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        alert("ไม่สามารถเปลี่ยนสถานะได้");
        return;
      }
      await loadOrders();
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setBusyId(null);
    }
  };

  const toggleItemStrike = (orderId: string, itemIdx: number) => {
    const key = `${orderId}-${itemIdx}`;
    setStruckItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) void document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // การจำแนกสเตชันครัวจากชื่อเมนู
  const isItemMatchStation = (itemName: string, station: string) => {
    if (station === "ALL") return true;
    if (station === "chicken") return itemName.includes("ไก่ทอด") || itemName.includes("ชิ้น");
    if (station === "bingsu_drink") return itemName.includes("บิงซู") || itemName.includes("สลัชชี่") || itemName.includes("ชา") || itemName.includes("นม");
    if (station === "korean_dish") return itemName.includes("ข้าว") || itemName.includes("ต๊อก") || itemName.includes("ซุป") || itemName.includes("หม้อไฟ") || itemName.includes("จูกุมิ") || itemName.includes("ราพ็อกกี") || itemName.includes("จับเช");
    if (station === "snack") return itemName.includes("ฟรายส์") || itemName.includes("คิมมารี") || itemName.includes("มันดู") || itemName.includes("กิมจิ") || itemName.includes("หัวไชเท้า");
    return true;
  };

  // กรองออเดอร์ตามสถานะและสเตชัน
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // ตัวกรองสถานะ
      if (statusFilter === "ACTIVE") {
        if (!["PENDING", "COOKING", "READY"].includes(order.status)) return false;
      } else if (statusFilter !== "ALL") {
        if (order.status !== statusFilter) return false;
      }

      // ตัวกรองสเตชัน
      if (stationFilter !== "ALL") {
        const hasMatchingItem = order.items.some((item) => isItemMatchStation(item.name, stationFilter));
        if (!hasMatchingItem) return false;
      }

      return true;
    });
  }, [orders, statusFilter, stationFilter]);

  // สรุปยอดจานที่ครัวต้องเตรียมในออเดอร์ที่กำลังปรุงอยู่
  const activeTallies = useMemo(() => {
    const activeOrders = orders.filter((o) => ["PENDING", "COOKING"].includes(o.status));
    const counts = new Map<string, number>();
    for (const order of activeOrders) {
      for (const item of order.items) {
        if (stationFilter !== "ALL" && !isItemMatchStation(item.name, stationFilter)) continue;
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [orders, stationFilter]);

  // คำนวณเวลาที่ผ่านไป (วินาที)
  const getElapsedSeconds = (isoDate: string) => {
    return Math.max(0, Math.floor((now.getTime() - new Date(isoDate).getTime()) / 1000));
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const activeCount = orders.filter((o) => ["PENDING", "COOKING"].includes(o.status)).length;
  const readyCount = orders.filter((o) => o.status === "READY").length;
  const servedCount = orders.filter((o) => o.status === "SERVED").length;

  return (
    <div className="kds-container">
      {/* Topbar */}
      <header className="kds-topbar">
        <h1 className="kds-title">
          <span>🍳 โซมายด์ KDS</span>
          <span style={{ fontSize: 14, color: "#94A3B8", fontWeight: 500 }}>จอแสดงผลในครัว (Kitchen Display)</span>
        </h1>

        <span className="kds-badge" style={{ background: connected ? "#065F46" : "#78350F", color: connected ? "#A7F3D0" : "#FDE68A" }}>
          {connected ? "🟢 เรียลไทม์" : "🟡 อัปเดตทุก 10 วิ"}
        </span>

        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="kds-btn"
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
          >
            {audioEnabled ? "🔔 เสียงเปิดอยู่" : "🔕 ปิดเสียง"}
          </button>

          <button className="kds-btn" onClick={toggleFullscreen}>
            {isFullscreen ? "🗗 ย่อหน้าต่าง" : "⛶ เต็มจอ"}
          </button>

          <Link href="/" className="kds-btn kds-btn-primary">
            ← จัดการคิวหน้าร้าน
          </Link>
        </span>
      </header>

      {/* Summary Bar */}
      <section className="kds-summary-bar">
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#E2E8F0" }}>
            🔥 กำลังทำ: <b style={{ color: "#38BDF8", fontSize: 16 }}>{activeCount}</b> บิล · พร้อมเสิร์ฟ:{" "}
            <b style={{ color: "#34D399", fontSize: 16 }}>{readyCount}</b> บิล · วันนี้เสิร์ฟแล้ว:{" "}
            <b style={{ color: "#94A3B8", fontSize: 16 }}>{servedCount}</b>
          </span>
        </div>

        {activeTallies.length > 0 && (
          <div className="kds-tally-items">
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>ต้องทำรวม:</span>
            {activeTallies.slice(0, 5).map(([name, qty]) => (
              <span key={name} className="kds-tally-item">
                {name} <span className="qty">× {qty}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Filter Controls */}
      <section className="kds-controls">
        <div className="kds-chip-group">
          {(
            [
              { id: "ACTIVE", label: `กำลังทำ (${activeCount + readyCount})` },
              { id: "COOKING", label: `กำลังปรุง (${activeCount})` },
              { id: "READY", label: `พร้อมเสิร์ฟ (${readyCount})` },
              { id: "SERVED", label: `เสิร์ฟแล้ว (${servedCount})` },
              { id: "ALL", label: `ทั้งหมด (${orders.length})` },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              className={`kds-chip${statusFilter === c.id ? " active" : ""}`}
              onClick={() => setStatusFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="kds-chip-group">
          {[
            { id: "ALL", label: "ทุกสเตชัน" },
            { id: "chicken", label: "🍗 ไก่ทอดเกาหลี" },
            { id: "korean_dish", label: "🍲 อาหารเกาหลี" },
            { id: "snack", label: "🍟 ของทานเล่น" },
            { id: "bingsu_drink", label: "🍧 บิงซู & เครื่องดื่ม" },
          ].map((s) => (
            <button
              key={s.id}
              className={`kds-chip${stationFilter === s.id ? " active" : ""}`}
              onClick={() => setStationFilter(s.id)}
              style={{ fontSize: 12, padding: "5px 12px" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Order Cards Grid */}
      <main className="kds-grid">
        {loading && <div style={{ color: "#94A3B8", padding: 24, fontSize: 18 }}>กำลังโหลดออเดอร์ในครัว…</div>}

        {!loading && filteredOrders.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: "#64748B" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍🍳</div>
            <h3 style={{ margin: 0, fontSize: 20, color: "#94A3B8" }}>ไม่มีออเดอร์ที่ค้างอยู่ในตัวกรองนี้</h3>
            <p style={{ margin: "8px 0 0", fontSize: 14 }}>เมื่อลูกค้าสั่งอาหารจาก LINE LIFF รายการจะเด้งขึ้นหน้าจอนี้ทันที</p>
          </div>
        )}

        {filteredOrders.map((order) => {
          const elapsed = getElapsedSeconds(order.createdAt);
          const isUrgent = elapsed >= 900; // >= 15 นาที
          const isWarning = elapsed >= 600 && elapsed < 900; // 10-15 นาที
          const timerClass = isUrgent ? "urgent" : isWarning ? "warning" : "normal";
          const isReady = order.status === "READY";
          const isServed = order.status === "SERVED";
          const isBusy = busyId === order.id;

          const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.COOKING;

          return (
            <div
              key={order.id}
              className={`kds-card${isUrgent && !isReady && !isServed ? " urgent" : ""}${isReady ? " ready" : ""}`}
            >
              {/* Card Header */}
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
                      backgroundColor: statusCfg.bg,
                      color: statusCfg.color,
                    }}
                  >
                    {statusCfg.label}
                  </span>
                </div>

                <div className={`kds-timer ${timerClass}`}>
                  <span>⏱</span>
                  <span>{formatTimer(elapsed)}</span>
                </div>
              </div>

              {/* Card Meta */}
              <div className="kds-card-meta">
                <span>📍 {order.tableNumber || "สั่งล่วงหน้า"} {order.ticketId ? `(คิว ${order.ticketId})` : ""}</span>
                <span>👤 {order.customerName || "ลูกค้า"}</span>
              </div>

              {order.note && (
                <div style={{ padding: "6px 16px", background: "#3A1A1A", color: "#FCA5A5", fontSize: 12, fontWeight: 600 }}>
                  ⚠️ โน้ต: {order.note}
                </div>
              )}

              {/* Items List */}
              <div className="kds-items-list">
                {order.items.map((item, idx) => {
                  const strikeKey = `${order.id}-${idx}`;
                  const isStruck = struckItems.has(strikeKey);
                  const optList = [
                    item.sauce && OPTION_LABELS[item.sauce],
                    item.spiciness && OPTION_LABELS[item.spiciness],
                    item.sweetness && OPTION_LABELS[item.sweetness],
                  ].filter(Boolean);

                  return (
                    <div
                      key={strikeKey}
                      className={`kds-item-row${isStruck ? " struck" : ""}`}
                      onClick={() => toggleItemStrike(order.id, idx)}
                      title="แตะเพื่อขีดฆ่าจานที่ทำเสร็จแล้ว"
                    >
                      <span className="kds-item-qty">×{item.quantity}</span>
                      <div className="kds-item-content">
                        <div className="kds-item-name">{item.name}</div>
                        {optList.length > 0 && (
                          <div>
                            {optList.map((opt, i) => (
                              <span key={i} className="kds-item-tag">
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.note && <div className="kds-item-note">· {item.note}</div>}
                      </div>
                      <span style={{ fontSize: 16, color: isStruck ? "#10B981" : "#475569" }}>
                        {isStruck ? "✓" : "○"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Card Actions */}
              <div className="kds-card-actions">
                {order.status === "PENDING" && (
                  <button
                    className="kds-action-btn"
                    style={{ background: "#0284C7", color: "#fff" }}
                    disabled={isBusy}
                    onClick={() => updateStatus(order.id, "COOKING")}
                  >
                    🍳 เริ่มปรุงอาหาร
                  </button>
                )}

                {order.status === "COOKING" && (
                  <>
                    <button
                      className="kds-action-btn"
                      style={{ background: "#059669", color: "#fff" }}
                      disabled={isBusy}
                      onClick={() => updateStatus(order.id, "READY")}
                    >
                      🔔 ปรุงเสร็จ / พร้อมเสิร์ฟ
                    </button>
                    <button
                      className="kds-action-btn"
                      style={{ background: "#334155", color: "#94A3B8", flex: "0 0 70px" }}
                      disabled={isBusy}
                      onClick={() => {
                        if (confirm(`ยกเลิกออเดอร์ ${order.orderNumber}?`)) {
                          void updateStatus(order.id, "CANCELLED");
                        }
                      }}
                    >
                      ยกเลิก
                    </button>
                  </>
                )}

                {order.status === "READY" && (
                  <>
                    <button
                      className="kds-action-btn"
                      style={{ background: "#10B981", color: "#fff" }}
                      disabled={isBusy}
                      onClick={() => updateStatus(order.id, "SERVED")}
                    >
                      ✅ เสิร์ฟถึงโต๊ะแล้ว
                    </button>
                    <button
                      className="kds-action-btn"
                      style={{ background: "#334155", color: "#CBD5E1", flex: "0 0 90px" }}
                      disabled={isBusy}
                      onClick={() => updateStatus(order.id, "COOKING")}
                    >
                      ↩ ปรุงต่อ
                    </button>
                  </>
                )}

                {order.status === "SERVED" && (
                  <button
                    className="kds-action-btn"
                    style={{ background: "#1E293B", color: "#94A3B8" }}
                    disabled={isBusy}
                    onClick={() => updateStatus(order.id, "READY")}
                  >
                    ↩ ย้อนกลับไปพร้อมเสิร์ฟ
                  </button>
                )}

                {order.status === "CANCELLED" && (
                  <button
                    className="kds-action-btn"
                    style={{ background: "#1E293B", color: "#94A3B8" }}
                    disabled={isBusy}
                    onClick={() => updateStatus(order.id, "COOKING")}
                  >
                    ↩ คืนสถานะกลับมาทำใหม่
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
