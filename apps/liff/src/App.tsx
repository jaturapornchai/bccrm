import React, { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { initLiff, type LiffProfile } from "./lib/liff";

const API =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "http://localhost:3001");
const BRANCH_ID = "demo";

interface ServiceItem {
  id: string;
  branchId: string;
  name: string;
  ticketPrefix: string;
  avgServiceMinutes: number;
  isActive: boolean;
}

interface TicketRecord {
  id: string;
  branchId: string;
  serviceId: string;
  counterId: string | null;
  customerId: string | null;
  number: string;
  state: string;
  isVip: boolean;
  createdAt: string;
  calledAt: string | null;
  servedAt: string | null;
  doneAt: string | null;
  cancelledAt: string | null;
}

interface TicketDetails {
  ticket: TicketRecord;
  service: ServiceItem | null;
  aheadCount: number;
  estimatedWaitMinutes: number;
}

type TabType = "book" | "ticket" | "chat" | "profile";

export default function App() {
  const [profile, setProfile] = useState<LiffProfile>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("book");

  // Services
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [pdpaConsent, setPdpaConsent] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active Ticket
  const [currentTicket, setCurrentTicket] = useState<TicketDetails | null>(null);
  const [loadingTicket, setLoadingTicket] = useState<boolean>(false);
  const [ticketHistory, setTicketHistory] = useState<TicketRecord[]>([]);

  // Socket
  const socketRef = useRef<Socket | null>(null);
  const [callAlert, setCallAlert] = useState<string | null>(null);

  // AI Chat (DeepSeek)
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: "user" | "ai"; text: string; time: string; hasCard?: boolean }>
  >([
    {
      sender: "ai",
      text: "สวัสดีค่ะ! น้องบีซี ผู้ช่วย AI (DeepSeek) ยินดีให้บริการค่ะ สอบถามข้อมูลบริการ คลินิก หรือเช็กคิวสดได้เลยนะคะ 😊",
      time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isAiTyping, setIsAiTyping] = useState<boolean>(false);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Initialize LIFF
  useEffect(() => {
    initLiff()
      .then((p) => {
        setProfile(p);
        if (p?.userId) {
          // Sync customer profile with API
          fetch(`${API}/api/customers/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lineUserId: p.userId,
              displayName: p.displayName,
              pictureUrl: p.pictureUrl,
              pdpaConsent: true,
            }),
          }).catch((err) => console.error("Sync profile error:", err));
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // 2. Fetch available services
  const loadServices = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/queues/services?branchId=${BRANCH_ID}`);
      if (res.ok) {
        const data: ServiceItem[] = await res.json();
        setServices(data);
        if (data.length > 0 && !selectedServiceId) {
          setSelectedServiceId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Load services error:", err);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // 3. Load active ticket for customer
  const loadActiveTicket = useCallback(async (userId: string) => {
    try {
      setLoadingTicket(true);
      const res = await fetch(
        `${API}/api/queues/customer/active?branchId=${BRANCH_ID}&customerId=${userId}`,
      );
      if (res.ok) {
        const data: TicketDetails | null = await res.json();
        if (data && data.ticket) {
          setCurrentTicket(data);
          setActiveTab("ticket");
        }
      }
    } catch (err) {
      console.error("Load active ticket error:", err);
    } finally {
      setLoadingTicket(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.userId) {
      loadActiveTicket(profile.userId);
    }
  }, [profile?.userId, loadActiveTicket]);

  // 4. Realtime Socket connection
  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_branch", BRANCH_ID);
    });

    socket.on("call", (data: { number: string; counterName: string }) => {
      if (currentTicket && currentTicket.ticket.number === data.number) {
        setCallAlert(`🔔 ถึงคิวของคุณแล้ว! (${data.number}) กรุณาติดต่อที่ ${data.counterName}`);
        if (profile?.userId) loadActiveTicket(profile.userId);
      }
    });

    socket.on("queue_update", () => {
      if (profile?.userId) {
        loadActiveTicket(profile.userId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentTicket, profile?.userId, loadActiveTicket]);

  // 5. Handle Booking
  const handleBooking = async () => {
    if (!profile) return;
    if (!pdpaConsent) {
      alert("กรุณายินยอมเงื่อนไข PDPA ก่อนรับบัตรคิว");
      return;
    }
    const selectedSvc = services.find((s) => s.id === selectedServiceId);
    if (!selectedSvc) {
      alert("กรุณาเลือกบริการ");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`${API}/api/queues/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: BRANCH_ID,
          serviceId: selectedSvc.id,
          customerId: profile.userId,
          lineUserId: profile.userId,
          source: "LINE_BOOKING",
          state: "WAITING",
          isVip: selectedSvc.ticketPrefix === "V",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "ออกบัตรคิวไม่สำเร็จ");
      }

      const createdTicket: TicketRecord = await res.json();
      setTicketHistory((prev) => [createdTicket, ...prev]);

      // Load full details & switch tab
      await loadActiveTicket(profile.userId);
      setActiveTab("ticket");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`เกิดข้อผิดพลาด: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 6. Handle Cancel Ticket
  const handleCancelTicket = async () => {
    if (!currentTicket) return;
    const confirmCancel = window.confirm(
      `คุณต้องการยกเลิกคิว ${currentTicket.ticket.number} ใช่หรือไม่?`,
    );
    if (!confirmCancel) return;

    try {
      const res = await fetch(`${API}/api/queues/tickets/${currentTicket.ticket.id}/cancel`, {
        method: "POST",
      });
      if (res.ok) {
        alert(`ยกเลิกคิว ${currentTicket.ticket.number} เรียบร้อยแล้ว`);
        setCurrentTicket(null);
        setActiveTab("book");
      }
    } catch (err) {
      alert("ยกเลิกคิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  };

  // Chat auto scroll
  useEffect(() => {
    if (activeTab === "chat") {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab, isAiTyping]);

  // Send message to DeepSeek AI
  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = (presetText || chatInput).trim();
    if (!textToSend || isAiTyping) return;

    const userMsg = {
      sender: "user" as const,
      text: textToSend,
      time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!presetText) setChatInput("");
    setIsAiTyping(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          lineUserId: profile?.userId || "Uguest",
        }),
      });

      if (!res.ok) {
        throw new Error("ระบบ AI ไม่ตอบสนองในขณะนี้");
      }

      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: data.reply || "น้องบีซีได้รับข้อความแล้วค่ะ มีอะไรให้ช่วยเพิ่มเติมสอบถามได้เลยนะคะ",
          time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
          hasCard: Boolean(data.activeTicket),
        },
      ]);
      if (data.activeTicket && !currentTicket) {
        setCurrentTicket(data.activeTicket);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: `ขออภัยค่ะ พอดีมีปัญหาชั่วคราว: ${msg}`,
          time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Dev user switcher
  const switchDevUser = (newId: string, newName: string) => {
    localStorage.setItem("bccrm_dev_userid", newId);
    localStorage.setItem("bccrm_dev_name", newName);
    window.location.reload();
  };

  if (error) {
    return (
      <main style={styles.centerContainer}>
        <div style={styles.errorBox}>
          <h3>⚠️ ไม่สามารถเปิด LIFF ได้</h3>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={styles.centerContainer}>
        <div style={{ textAlign: "center", color: "#666" }}>
          <div style={styles.spinner}></div>
          <p style={{ marginTop: 12 }}>กำลังเชื่อมต่อ LINE...</p>
        </div>
      </main>
    );
  }

  const selectedService = services.find((s) => s.id === selectedServiceId);

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={styles.logoBadge}>BCCRM</div>
          <div>
            <h1 style={styles.headerTitle}>คลินิกและบริการตัวอย่าง</h1>
            <span style={styles.headerSubtitle}>📍 สาขาหลัก (Demo)</span>
          </div>
        </div>
        {profile.devMode && (
          <span style={styles.devTag}>โหมด Dev</span>
        )}
      </header>

      {/* Realtime Call Alert Modal / Toast */}
      {callAlert && (
        <div style={styles.callAlertBanner}>
          <div>{callAlert}</div>
          <button style={styles.closeAlertBtn} onClick={() => setCallAlert(null)}>
            รับทราบ
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      <main style={styles.content}>
        {/* ================= TAB 1: BOOK QUEUE ================= */}
        {activeTab === "book" && (
          <section>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>📋 รับบัตรคิวออนไลน์</h2>
              <p style={styles.textMuted}>
                ยินดีต้อนรับคุณ <strong>{profile.displayName}</strong> เลือกบริการที่ต้องการ
              </p>

              {currentTicket && (
                <div style={styles.activeNotice}>
                  <span>คุณมีคิวที่รออยู่แล้ว: <strong>{currentTicket.ticket.number}</strong></span>
                  <button
                    style={styles.linkButton}
                    onClick={() => setActiveTab("ticket")}
                  >
                    ดูบัตรคิวสด →
                  </button>
                </div>
              )}

              {/* Service Cards Selection */}
              <div style={{ marginTop: 16 }}>
                <label style={styles.label}>เลือกประเภทบริการ:</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {services.map((svc) => {
                    const isSelected = svc.id === selectedServiceId;
                    const isVip = svc.ticketPrefix === "V";
                    return (
                      <div
                        key={svc.id}
                        onClick={() => setSelectedServiceId(svc.id)}
                        style={{
                          ...styles.serviceItem,
                          borderColor: isSelected ? "#06C755" : "#E2E8F0",
                          backgroundColor: isSelected ? "#F0FDF4" : "#FFFFFF",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span
                            style={{
                              ...styles.prefixBadge,
                              backgroundColor: isVip ? "#7C3AED" : "#06C755",
                            }}
                          >
                            {svc.ticketPrefix}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15, color: "#1E293B" }}>
                              {svc.name}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748B" }}>
                              เวลารอเฉลี่ย ~{svc.avgServiceMinutes} นาที/คิว
                            </div>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="service"
                          checked={isSelected}
                          onChange={() => setSelectedServiceId(svc.id)}
                          style={{ accentColor: "#06C755", width: 18, height: 18 }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Phone input */}
              <div style={{ marginTop: 16 }}>
                <label style={styles.label}>เบอร์โทรศัพท์ (สำหรับแจ้งเตือน SMS สำรอง):</label>
                <input
                  type="tel"
                  placeholder="เช่น 081-234-5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={styles.input}
                />
              </div>

              {/* PDPA Consent */}
              <div style={styles.consentBox}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={pdpaConsent}
                    onChange={(e) => setPdpaConsent(e.target.checked)}
                    style={{ marginTop: 3, accentColor: "#06C755" }}
                  />
                  <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                    ข้าพเจ้ายินยอมให้ระบบ BCCRM เก็บรวบรวมและใช้ข้อมูล (LINE Profile และเบอร์โทร) เพื่อวัตถุประสงค์ในการจัดลำดับคิวและแจ้งเตือนสถานะการรับบริการตามนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleBooking}
                disabled={isSubmitting || !selectedService}
                style={{
                  ...styles.primaryButton,
                  opacity: isSubmitting || !selectedService ? 0.6 : 1,
                }}
              >
                {isSubmitting ? "กำลังออกเลขคิว..." : `ยืนยันรับบัตรคิว ${selectedService ? `(${selectedService.name})` : ""}`}
              </button>
            </div>
          </section>
        )}

        {/* ================= TAB 2: LIVE TICKET ================= */}
        {activeTab === "ticket" && (
          <section>
            {loadingTicket && !currentTicket ? (
              <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
                <div style={styles.spinner}></div>
                <p style={{ marginTop: 12 }}>กำลังโหลดข้อมูลบัตรคิวสด...</p>
              </div>
            ) : !currentTicket ? (
              <div style={styles.emptyCard}>
                <div style={{ fontSize: 48 }}>🎫</div>
                <h3 style={{ marginTop: 12, fontSize: 18, color: "#1E293B" }}>ยังไม่มีคิวที่กำลังรออยู่</h3>
                <p style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>
                  คุณยังไม่ได้กดรับบัตรคิวสำหรับวันนี้
                </p>
                <button
                  style={{ ...styles.primaryButton, marginTop: 20, maxWidth: 200 }}
                  onClick={() => setActiveTab("book")}
                >
                  + รับบัตรคิวเลย
                </button>
              </div>
            ) : (
              <div>
                {/* Live Ticket Visual Card */}
                <div style={styles.ticketCard}>
                  {/* Top Bar of Ticket */}
                  <div style={styles.ticketCardHeader}>
                    <div>
                      <span style={styles.ticketBranchLabel}>BCCRM DEMO BRANCH</span>
                      <div style={styles.ticketServiceLabel}>
                        {currentTicket.service?.name ?? "บริการทั่วไป"}
                      </div>
                    </div>
                    <span
                      style={{
                        ...styles.statusPill,
                        backgroundColor:
                          currentTicket.ticket.state === "CALLED"
                            ? "#EF4444"
                            : currentTicket.ticket.state === "SERVING"
                            ? "#3B82F6"
                            : currentTicket.ticket.state === "DONE"
                            ? "#10B981"
                            : "#F59E0B",
                      }}
                    >
                      {currentTicket.ticket.state === "CALLED"
                        ? "📢 ถึงคิวแล้ว!"
                        : currentTicket.ticket.state === "SERVING"
                        ? "กำลังรับบริการ"
                        : currentTicket.ticket.state === "DONE"
                        ? "เสร็จสิ้น"
                        : "⏳ กำลังรอคิว"}
                    </span>
                  </div>

                  {/* Big Ticket Number */}
                  <div style={styles.ticketNumberSection}>
                    <div style={styles.ticketNumberText}>{currentTicket.ticket.number}</div>
                    <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                      เลขคิวของคุณ
                    </div>
                  </div>

                  {/* Ahead count & Estimated time metrics */}
                  <div style={styles.ticketMetricsRow}>
                    <div style={styles.metricBox}>
                      <div style={styles.metricVal}>{currentTicket.aheadCount}</div>
                      <div style={styles.metricLabel}>คิวข้างหน้า</div>
                    </div>
                    <div style={styles.metricDivider}></div>
                    <div style={styles.metricBox}>
                      <div style={styles.metricVal}>~{currentTicket.estimatedWaitMinutes}</div>
                      <div style={styles.metricLabel}>เวลารอประมาณ (นาที)</div>
                    </div>
                  </div>

                  {/* Counter Call Notice if CALLED */}
                  {currentTicket.ticket.state === "CALLED" && (
                    <div style={styles.calledNotificationBox}>
                      <div style={{ fontSize: 20 }}>📢</div>
                      <div>
                        <strong>กรุณาติดต่อที่เคาน์เตอร์บริการ</strong>
                        <div style={{ fontSize: 13, color: "#991B1B" }}>
                          {currentTicket.ticket.counterId || "เคาน์เตอร์ 1"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Realtime Live Indicator */}
                  <div style={styles.liveIndicatorRow}>
                    <span style={styles.liveDot}></span>
                    <span style={{ fontSize: 12, color: "#15803D", fontWeight: 500 }}>
                      เชื่อมต่อสดผ่าน Socket.io (อัปเดตอัตโนมัติ)
                    </span>
                  </div>

                  {/* Ticket Action Buttons */}
                  <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                    <button
                      onClick={() => profile && loadActiveTicket(profile.userId)}
                      style={styles.secondaryButton}
                    >
                      🔄 รีเฟรชสถานะ
                    </button>
                    {currentTicket.ticket.state === "WAITING" && (
                      <button
                        onClick={handleCancelTicket}
                        style={styles.cancelButton}
                      >
                        ยกเลิกคิวนี้
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================= TAB 3: CUSTOMER PROFILE ================= */}
        {activeTab === "profile" && (
          <section>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>👤 ข้อมูลสมาชิก & ประวัติ</h2>

              {/* Profile Card */}
              <div style={styles.profileHeaderBox}>
                <img
                  src={profile.pictureUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=user"}
                  alt="Profile"
                  style={styles.avatarImg}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: "#1E293B" }}>
                    {profile.displayName}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    LINE User ID: {profile.userId}
                  </div>
                  <span style={styles.consentBadge}>✓ ยินยอม PDPA แล้ว</span>
                </div>
              </div>

              {/* Dev mode profile switcher */}
              {profile.devMode && (
                <div style={styles.devBox}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#92400E", marginBottom: 8 }}>
                    🛠 ตัวสลับบัญชีทดสอบ (Dev Mode):
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={styles.devSwitchBtn}
                      onClick={() => switchDevUser("Udev001", "คุณสมชาย (ลูกค้าทั่วไป)")}
                    >
                      ลูกค้า 1 (ทั่วไป)
                    </button>
                    <button
                      style={styles.devSwitchBtn}
                      onClick={() => switchDevUser("Uvip888", "คุณหญิงวิไล (ลูกค้า VIP)")}
                    >
                      ลูกค้า 2 (VIP)
                    </button>
                    <button
                      style={styles.devSwitchBtn}
                      onClick={() => switchDevUser("Udev003", "คุณอนุชา (คิวใหม่)")}
                    >
                      ลูกค้า 3
                    </button>
                  </div>
                </div>
              )}

              {/* Info summary */}
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 14, color: "#334155", marginBottom: 8 }}>สิทธิประโยชน์และการใช้งาน</h4>
                <div style={styles.infoRow}>
                  <span>ระบบแจ้งเตือน LINE</span>
                  <strong style={{ color: "#06C755" }}>เปิดใช้งาน</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>สถานะความยินยอมข้อมูล</span>
                  <strong style={{ color: "#06C755" }}>PDPA Version 1.0</strong>
                </div>
                <div style={styles.infoRow}>
                  <span>สาขาที่ใช้บริการบ่อย</span>
                  <strong>สาขาหลัก (Demo)</strong>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* TAB: AI CHAT (DEEPSEEK) */}
        {activeTab === "chat" && (
          <section style={styles.chatSection}>
            {/* Assistant Info Banner */}
            <div style={styles.chatBotHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={styles.chatBotAvatar}>🤖</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 14, color: "#0F172A" }}>น้องบีซี AI Assistant</strong>
                    <span style={styles.aiOnlineDot}></span>
                  </div>
                  <span style={{ fontSize: 11, color: "#64748B" }}>
                    DeepSeek AI • ผู้ช่วยอัจฉริยะ 24 ชม.
                  </span>
                </div>
              </div>
              <span style={styles.deepseekBadge}>DeepSeek</span>
            </div>

            {/* Quick Prompt Chips */}
            <div style={styles.quickChipsContainer}>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("ตอนนี้มีคิวกี่คนและต้องรอนานไหม?")}
              >
                ⚡ เช็กคิวสด
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("ที่นี่มีบริการอะไรบ้างและราคาเท่าไหร่?")}
              >
                🩺 บริการที่มี
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("คลินิกเปิดบริการกี่โมงถึงกี่โมง?")}
              >
                ⏰ เวลาทำการ
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("จะจองคิวต้องทำอย่างไร?")}
              >
                📌 วิธีรับบัตรคิว
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div style={styles.chatMessageList}>
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
                    marginBottom: 12,
                    alignItems: "flex-end",
                    gap: 6,
                  }}
                >
                  {msg.sender === "ai" && <div style={styles.msgAvatar}>🤖</div>}
                  <div style={{ maxWidth: "78%" }}>
                    <div
                      style={{
                        ...(msg.sender === "user" ? styles.userBubble : styles.aiBubble),
                      }}
                    >
                      <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{msg.text}</p>
                      {msg.hasCard && currentTicket && (
                        <div style={styles.chatTicketCard}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontSize: 11, color: "#64748B" }}>บัตรคิวของคุณ</span>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#06C755",
                                backgroundColor: "#DCFCE7",
                                padding: "2px 6px",
                                borderRadius: 4,
                              }}
                            >
                              {currentTicket.ticket.state}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 26,
                              fontWeight: 900,
                              color: "#06C755",
                              margin: "4px 0",
                            }}
                          >
                            {currentTicket.ticket.number}
                          </div>
                          <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>
                            รออีก {currentTicket.aheadCount} คิว (~{currentTicket.estimatedWaitMinutes} นาที)
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("ticket")}
                            style={styles.viewTicketBtn}
                          >
                            เปิดดูบัตรคิวฉบับเต็ม →
                          </button>
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#94A3B8",
                        marginTop: 2,
                        textAlign: msg.sender === "user" ? "right" : "left",
                        paddingLeft: msg.sender === "ai" ? 4 : 0,
                        paddingRight: msg.sender === "user" ? 4 : 0,
                      }}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}

              {isAiTyping && (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 12 }}>
                  <div style={styles.msgAvatar}>🤖</div>
                  <div style={styles.typingBubble}>
                    <span style={styles.typingDot}></span>
                    <span style={{ ...styles.typingDot, animationDelay: "0.2s" }}></span>
                    <span style={{ ...styles.typingDot, animationDelay: "0.4s" }}></span>
                    <span style={{ fontSize: 11, color: "#64748B", marginLeft: 6 }}>
                      น้องบีซีกำลังพิมพ์...
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              style={styles.chatInputRow}
            >
              <input
                type="text"
                placeholder="พิมพ์คำถาม เช่น ตอนนี้ถึงคิวไหนแล้ว..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isAiTyping}
                style={styles.chatInput}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAiTyping}
                style={{
                  ...styles.chatSendBtn,
                  opacity: !chatInput.trim() || isAiTyping ? 0.5 : 1,
                }}
              >
                ส่ง
              </button>
            </form>
          </section>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav style={styles.bottomNav}>
        <button
          onClick={() => setActiveTab("book")}
          style={{
            ...styles.navBtn,
            color: activeTab === "book" ? "#06C755" : "#94A3B8",
          }}
        >
          <span style={{ fontSize: 20 }}>📋</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "book" ? 700 : 500 }}>จองคิว</span>
        </button>

        <button
          onClick={() => setActiveTab("ticket")}
          style={{
            ...styles.navBtn,
            color: activeTab === "ticket" ? "#06C755" : "#94A3B8",
            position: "relative",
          }}
        >
          <span style={{ fontSize: 20 }}>🎫</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "ticket" ? 700 : 500 }}>
            บัตรคิว
          </span>
          {currentTicket && <span style={styles.ticketBadgeDot}></span>}
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          style={{
            ...styles.navBtn,
            color: activeTab === "chat" ? "#06C755" : "#94A3B8",
          }}
        >
          <span style={{ fontSize: 20 }}>💬</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "chat" ? 700 : 500 }}>
            คุยกับ AI
          </span>
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          style={{
            ...styles.navBtn,
            color: activeTab === "profile" ? "#06C755" : "#94A3B8",
          }}
        >
          <span style={{ fontSize: 20 }}>👤</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "profile" ? 700 : 500 }}>
            ข้อมูล
          </span>
        </button>
      </nav>
    </div>
  );
}

// Inline Styles for clean, modern mobile web app presentation
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100vh",
    backgroundColor: "#F8FAFC",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Sarabun', Roboto, sans-serif",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    paddingBottom: 72,
  },
  header: {
    backgroundColor: "#FFFFFF",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "1px solid #E2E8F0",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  logoBadge: {
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 14,
    padding: "6px 10px",
    borderRadius: 8,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0F172A",
    margin: 0,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
  },
  devTag: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 12,
  },
  content: {
    padding: 16,
    flex: 1,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    border: "1px solid #F1F5F9",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 32,
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    border: "1px solid #F1F5F9",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#0F172A",
    margin: "0 0 4px 0",
  },
  textMuted: {
    fontSize: 13,
    color: "#64748B",
    margin: "0 0 16px 0",
  },
  activeNotice: {
    backgroundColor: "#EFF6FF",
    border: "1px solid #BFDBFE",
    padding: "10px 14px",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 13,
    color: "#1E40AF",
    marginBottom: 16,
  },
  linkButton: {
    background: "none",
    border: "none",
    color: "#2563EB",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    display: "block",
  },
  serviceItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1.5px solid #E2E8F0",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  prefixBadge: {
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 15,
    width: 34,
    height: 34,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    fontSize: 14,
    marginTop: 6,
    boxSizing: "border-box",
    outline: "none",
  },
  consentBox: {
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 700,
    padding: 14,
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    marginTop: 20,
    boxShadow: "0 2px 4px rgba(6,199,85,0.25)",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    color: "#334155",
    fontSize: 13,
    fontWeight: 600,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #CBD5E1",
    cursor: "pointer",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#FEF2F2",
    color: "#DC2626",
    fontSize: 13,
    fontWeight: 600,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #FECACA",
    cursor: "pointer",
  },
  ticketCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
    border: "1.5px solid #06C755",
    position: "relative",
    overflow: "hidden",
  },
  ticketCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "1px dashed #E2E8F0",
    paddingBottom: 14,
  },
  ticketBranchLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#94A3B8",
    letterSpacing: 1,
  },
  ticketServiceLabel: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0F172A",
    marginTop: 2,
  },
  statusPill: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 20,
  },
  ticketNumberSection: {
    textAlign: "center",
    padding: "24px 0 16px 0",
  },
  ticketNumberText: {
    fontSize: 54,
    fontWeight: 900,
    color: "#06C755",
    letterSpacing: 2,
    lineHeight: 1,
  },
  ticketMetricsRow: {
    display: "flex",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: "14px 10px",
    marginTop: 10,
  },
  metricBox: {
    flex: 1,
    textAlign: "center",
  },
  metricVal: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0F172A",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
  },
  calledNotificationBox: {
    marginTop: 16,
    backgroundColor: "#FEF2F2",
    border: "1.5px solid #F87171",
    borderRadius: 12,
    padding: 12,
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  liveIndicatorRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    marginTop: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    display: "inline-block",
  },
  callAlertBanner: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeAlertBtn: {
    backgroundColor: "#FFFFFF",
    color: "#DC2626",
    border: "none",
    fontWeight: 700,
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  profileHeaderBox: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 0",
    borderBottom: "1px solid #F1F5F9",
  },
  avatarImg: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    border: "2px solid #06C755",
  },
  consentBadge: {
    display: "inline-block",
    backgroundColor: "#DCFCE7",
    color: "#15803D",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 8,
    marginTop: 6,
  },
  devBox: {
    backgroundColor: "#FFFBEB",
    border: "1px solid #FDE68A",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  devSwitchBtn: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #D97706",
    color: "#92400E",
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    padding: "8px 0",
    borderBottom: "1px solid #F8FAFC",
    color: "#475569",
  },
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderTop: "1px solid #E2E8F0",
    display: "flex",
    height: 60,
    zIndex: 20,
  },
  navBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  ticketBadgeDot: {
    position: "absolute",
    top: 8,
    right: "32%",
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#EF4444",
  },
  centerContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
  },
  errorBox: {
    backgroundColor: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#B91C1C",
    padding: 16,
    borderRadius: 12,
    maxWidth: 360,
    textAlign: "center",
  },
  spinner: {
    width: 28,
    height: 28,
    border: "3px solid #E2E8F0",
    borderTop: "3px solid #06C755",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto",
  },
  chatSection: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 145px)",
  },
  chatBotHeader: {
    backgroundColor: "#FFFFFF",
    padding: "10px 14px",
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #E2E8F0",
    marginBottom: 10,
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  },
  chatBotAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    backgroundColor: "#EFF6FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    border: "1px solid #BFDBFE",
  },
  aiOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    display: "inline-block",
  },
  deepseekBadge: {
    backgroundColor: "#0EA5E9",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 7px",
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  quickChipsContainer: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 8,
    marginBottom: 8,
    WebkitOverflowScrolling: "touch",
  },
  quickChip: {
    whiteSpace: "nowrap",
    backgroundColor: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 20,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  chatMessageList: {
    flex: 1,
    overflowY: "auto",
    paddingRight: 4,
    display: "flex",
    flexDirection: "column",
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    backgroundColor: "#E2E8F0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
    marginBottom: 4,
  },
  userBubble: {
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    padding: "10px 14px",
    borderRadius: "16px 16px 4px 16px",
    fontSize: 14,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  },
  aiBubble: {
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    padding: "10px 14px",
    borderRadius: "16px 16px 16px 4px",
    fontSize: 14,
    border: "1px solid #E2E8F0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
  chatTicketCard: {
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  viewTicketBtn: {
    width: "100%",
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 6,
    padding: "6px 8px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  typingBubble: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#06C755",
    display: "inline-block",
    marginRight: 4,
  },
  chatInputRow: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    padding: "8px 10px",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
  },
  chatInput: {
    flex: 1,
    border: "none",
    outline: "none",
    fontSize: 14,
    padding: "6px 8px",
  },
  chatSendBtn: {
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "8px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
};
