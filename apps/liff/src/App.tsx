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

interface CallingInfo {
  currentNumber: string | null;
  currentCounter: string | null;
  currentState: string | null;
  waitingCount: number;
}

type TabType = "book" | "ticket" | "chat" | "profile";

// Gentle audio chime for queue call notifications
function playCallChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
    osc.frequency.setValueAtTime(1046.5, now + 0.36); // C6

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.2);
  } catch (e) {
    console.debug("Audio chime not supported or blocked", e);
  }
}

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

  // Live Calling Queue Info
  const [callingInfo, setCallingInfo] = useState<CallingInfo>({
    currentNumber: null,
    currentCounter: null,
    currentState: null,
    waitingCount: 0,
  });

  // Socket
  const socketRef = useRef<Socket | null>(null);
  const [callAlert, setCallAlert] = useState<string | null>(null);

  // AI Chat (DeepSeek)
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: "user" | "ai"; text: string; time: string; hasCard?: boolean }>
  >([
    {
      sender: "ai",
      text: "สวัสดีค่ะคุณลูกค้า น้องบีซียินดีต้อนรับนะคะ 🌿 วันนี้เหนื่อยไหมคะ มีเรื่องอะไรอยากคุยหรือให้บีซีช่วยดูแล ไม่ว่าจะเช็กคิว จองคิว หรืออยากคุยเล่นคลายเครียด บอกได้เลยน้า คุยได้ทุกเรื่องเลยค่ะ บีซีพร้อมรับฟังเสมอค่ะ ☺️✨",
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

  // 4. Load current calling queue
  const loadCallingInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/queues/current-calling?branchId=${BRANCH_ID}`);
      if (res.ok) {
        const data: CallingInfo = await res.json();
        setCallingInfo(data);
      }
    } catch (err) {
      console.debug("Failed to load calling info", err);
    }
  }, []);

  useEffect(() => {
    loadCallingInfo();
  }, [loadCallingInfo]);

  // 5. Realtime Socket connection
  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_branch", BRANCH_ID);
    });

    socket.on("call", (data: { number: string; counterName: string }) => {
      setCallingInfo((prev) => ({
        ...prev,
        currentNumber: data.number,
        currentCounter: data.counterName,
        currentState: "CALLED",
      }));

      if (currentTicket && currentTicket.ticket.number === data.number) {
        playCallChime();
        setCallAlert(`🔔 ถึงคิวของคุณแล้ว! (${data.number}) กรุณาติดต่อที่ ${data.counterName}`);
        if (profile?.userId) loadActiveTicket(profile.userId);
      }
    });

    socket.on("queue_update", () => {
      loadCallingInfo();
      if (profile?.userId) {
        loadActiveTicket(profile.userId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentTicket, profile?.userId, loadActiveTicket, loadCallingInfo]);

  // 6. Handle Booking
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

      // Reload calling info & active ticket
      loadCallingInfo();
      await loadActiveTicket(profile.userId);
      setActiveTab("ticket");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`เกิดข้อผิดพลาด: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Handle Cancel Ticket
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
        loadCallingInfo();
        setActiveTab("book");
      }
    } catch {
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
          text: data.reply || "น้องบีซีได้รับข้อความแล้วค่ะ มีข้อสงสัยสอบถามเพิ่มเติมได้เลยนะคะ",
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
          text: `ขออภัยค่ะ ระบบขัดข้องชั่วคราว: ${msg}`,
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
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700 }}>ไม่สามารถเปิด LIFF ได้</h3>
          <p style={{ margin: 0, fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{error}</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main style={styles.centerContainer}>
        <div style={{ textAlign: "center", color: "#64748B" }}>
          <div style={styles.spinner}></div>
          <p style={{ marginTop: 16, fontSize: 14, fontWeight: 500, letterSpacing: 0.5 }}>กำลังเชื่อมต่อ LINE Official Account...</p>
        </div>
      </main>
    );
  }

  const selectedService = services.find((s) => s.id === selectedServiceId);

  // Queue journey step computation
  const getQueueStep = (state?: string) => {
    if (!state) return 0;
    const s = state.toUpperCase();
    if (s === "WAITING") return 2;
    if (s === "CALLED" || s === "SERVING") return 3;
    if (s === "DONE") return 4;
    return 1;
  };

  const currentStep = getQueueStep(currentTicket?.ticket.state);

  return (
    <div style={styles.container}>
      {/* Top Luxury Gradient Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={styles.brandIconWrap}>
              <span style={{ fontSize: 18 }}>✦</span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={styles.headerTitle}>BCCRM ELITE</span>
                <span style={styles.verifiedBadge}>✓</span>
              </div>
              <div style={styles.headerSubtitle}>
                <span style={styles.onlineDot}></span>
                <span>สาขาหลัก (Demo) • พร้อมให้บริการ</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {profile.devMode && (
              <span style={styles.devTag}>Dev</span>
            )}
            <button
              onClick={() => setActiveTab("profile")}
              style={styles.avatarButton}
              title="ดูโปรไฟล์"
            >
              <img
                src={profile.pictureUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=user"}
                alt={profile.displayName}
                style={styles.headerAvatar}
              />
            </button>
          </div>
        </div>

        {/* Live Calling Ticker & Greeting Bar */}
        <div style={styles.greetingRow}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>ยินดีต้อนรับ</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{profile.displayName}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Header Calling Live Pill */}
            <div style={styles.liveCallingHeaderBadge}>
              <span style={styles.callingPulseDot}></span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>เรียกถึง:</span>
              <strong style={{ color: "#4ADE80", fontSize: 13, letterSpacing: 0.5 }}>
                {callingInfo.currentNumber || "—"}
              </strong>
            </div>

            {currentTicket && (
              <button
                style={styles.headerTicketPill}
                onClick={() => setActiveTab("ticket")}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#06C755", display: "inline-block" }}></span>
                <span>คิวของคุณ: <strong>{currentTicket.ticket.number}</strong></span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Realtime Call Alert Modal / Toast */}
      {callAlert && (
        <div style={styles.callAlertBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>แจ้งเตือนเรียกคิวสด!</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{callAlert}</div>
            </div>
          </div>
          <button style={styles.closeAlertBtn} onClick={() => setCallAlert(null)}>
            รับทราบ
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      <main style={styles.content}>
        {/* ================= TAB 1: BOOK QUEUE ================= */}
        {activeTab === "book" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Live Counter Monitor Card */}
            <div style={styles.liveMonitorCard}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={styles.speakerIconWrap}>📢</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#047857", letterSpacing: 0.5 }}>
                      สถานะเคาน์เตอร์สด • NOW SERVING
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 13, color: "#334155" }}>กำลังเรียกคิว:</span>
                      <span style={{ fontSize: 24, fontWeight: 900, color: "#059669", letterSpacing: 1.5 }}>
                        {callingInfo.currentNumber || "ยังไม่มีคิวเรียก"}
                      </span>
                      {callingInfo.currentCounter && (
                        <span style={styles.counterBadgePill}>{callingInfo.currentCounter}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={styles.waitingCountPill}>
                  <span>รอคิว {callingInfo.waitingCount} คน</span>
                </div>
              </div>
            </div>

            {/* Active Ticket Banner */}
            {currentTicket && (
              <div style={styles.activeNoticeCard} onClick={() => setActiveTab("ticket")}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={styles.activeNoticeIcon}>🎫</div>
                  <div>
                    <div style={{ fontSize: 12, color: "#047857", fontWeight: 600 }}>คุณมีคิวที่กำลังรออยู่</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#064E3B" }}>
                      หมายเลข {currentTicket.ticket.number}
                    </div>
                    <div style={{ fontSize: 12, color: "#059669" }}>
                      รออีก {currentTicket.aheadCount} คิว (~{currentTicket.estimatedWaitMinutes} นาที)
                    </div>
                  </div>
                </div>
                <div style={styles.activeNoticeArrow}>ดูบัตรคิวสด →</div>
              </div>
            )}

            {/* Clinic Info Hero Card */}
            <div style={styles.heroCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={styles.heroSubTag}>EXPRESS DIGITAL QUEUE</span>
                  <h2 style={styles.heroTitle}>จองและรับบัตรคิวออนไลน์</h2>
                  <p style={styles.heroDesc}>
                    เลือกบริการที่ต้องการ เพื่อรับบัตรคิวสดผ่านมือถือ ไม่ต้องยืนรอคิวหน้าร้าน
                  </p>
                </div>
                <div style={styles.heroDecoBadge}>
                  <span>⚡</span>
                </div>
              </div>

              <div style={styles.heroStatsGrid}>
                <div style={styles.heroStatItem}>
                  <div style={styles.heroStatValue}>~5-15</div>
                  <div style={styles.heroStatLabel}>นาที / คิว</div>
                </div>
                <div style={styles.heroStatDivider}></div>
                <div style={styles.heroStatItem}>
                  <div style={styles.heroStatValue}>3</div>
                  <div style={styles.heroStatLabel}>ช่องบริการเปิด</div>
                </div>
                <div style={styles.heroStatDivider}></div>
                <div style={styles.heroStatItem}>
                  <div style={styles.heroStatValue}>09:00-18:00</div>
                  <div style={styles.heroStatLabel}>เวลาทำการ</div>
                </div>
              </div>
            </div>

            {/* Service Selection List */}
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={styles.cardSectionTitle}>
                  <span style={styles.titleIcon}>🩺</span> เลือกประเภทบริการ
                </h3>
                <span style={{ fontSize: 12, color: "#64748B" }}>
                  {services.length} รายการพร้อมบริการ
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {services.map((svc) => {
                  const isSelected = svc.id === selectedServiceId;
                  const isVip = svc.ticketPrefix === "V";
                  return (
                    <div
                      key={svc.id}
                      onClick={() => setSelectedServiceId(svc.id)}
                      style={{
                        ...styles.serviceItem,
                        ...(isSelected ? styles.serviceItemSelected : {}),
                        ...(isVip ? styles.serviceItemVip : {}),
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div
                          style={{
                            ...styles.prefixBadge,
                            backgroundColor: isVip ? "#7C3AED" : isSelected ? "#06C755" : "#E2E8F0",
                            color: isSelected || isVip ? "#FFFFFF" : "#475569",
                          }}
                        >
                          {svc.ticketPrefix}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>
                              {svc.name}
                            </span>
                            {isVip && <span style={styles.vipBadge}>VIP Priority</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                            ⏱ เวลารอเฉลี่ย ~{svc.avgServiceMinutes} นาที/คิว
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center" }}>
                        <div
                          style={{
                            ...styles.radioIndicator,
                            borderColor: isSelected ? "#06C755" : "#CBD5E1",
                            backgroundColor: isSelected ? "#06C755" : "#FFFFFF",
                          }}
                        >
                          {isSelected && <div style={styles.radioInnerDot}></div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phone input */}
              <div style={{ marginTop: 20 }}>
                <label style={styles.fieldLabel}>
                  <span>เบอร์โทรศัพท์ (ทางเลือกสำหรับรับ SMS สำรอง)</span>
                </label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}>📞</span>
                  <input
                    type="tel"
                    placeholder="เช่น 081-234-5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={styles.cleanInput}
                  />
                </div>
              </div>

              {/* PDPA Consent Box */}
              <div style={styles.consentBox}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={pdpaConsent}
                    onChange={(e) => setPdpaConsent(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                    ข้าพเจ้ายินยอมให้ระบบ BCCRM จัดเก็บและประมวลผลข้อมูลส่วนบุคคล (LINE Profile และเบอร์ติดต่อ) เพื่อการจัดคิวและบริการตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)
                  </span>
                </label>
              </div>

              {/* Booking CTA Button */}
              <button
                onClick={handleBooking}
                disabled={isSubmitting || !selectedService}
                style={{
                  ...styles.primaryButton,
                  opacity: isSubmitting || !selectedService ? 0.6 : 1,
                }}
              >
                {isSubmitting ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={styles.miniSpinner}></span> กำลังออกบัตรคิว...
                  </span>
                ) : (
                  <span>
                    ยืนยันรับบัตรคิว {selectedService ? `• ${selectedService.name}` : ""}
                  </span>
                )}
              </button>
            </div>
          </section>
        )}

        {/* ================= TAB 2: LIVE TICKET ================= */}
        {activeTab === "ticket" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {loadingTicket && !currentTicket ? (
              <div style={styles.emptyCard}>
                <div style={styles.spinner}></div>
                <p style={{ marginTop: 16, fontSize: 14, color: "#64748B" }}>กำลังโหลดข้อมูลบัตรคิวสด...</p>
              </div>
            ) : !currentTicket ? (
              <div style={styles.emptyCard}>
                <div style={styles.emptyIconWrap}>🎫</div>
                <h3 style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: "#0F172A" }}>
                  ยังไม่มีคิวที่กำลังรออยู่
                </h3>
                <p style={{ color: "#64748B", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                  คุณยังไม่ได้กดรับบัตรคิวสำหรับวันนี้ สามารถเลือกบริการและรับคิวได้ทันที
                </p>
                <button
                  style={{ ...styles.primaryButton, marginTop: 20, maxWidth: 220, alignSelf: "center" }}
                  onClick={() => setActiveTab("book")}
                >
                  + รับบัตรคิวออนไลน์
                </button>
              </div>
            ) : (
              <div>
                {/* Luxury Boarding-Pass Ticket Visual Card */}
                <div style={styles.boardingPassTicket}>
                  {/* Top Section */}
                  <div style={styles.ticketTopSection}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={styles.ticketOrgName}>BCCRM ELITE CLINIC</div>
                        <div style={styles.ticketServiceName}>
                          {currentTicket.service?.name ?? "บริการทั่วไป"}
                        </div>
                      </div>

                      <div
                        style={{
                          ...styles.ticketStatusPill,
                          backgroundColor:
                            currentTicket.ticket.state === "CALLED"
                              ? "#EF4444"
                              : currentTicket.ticket.state === "SERVING"
                              ? "#2563EB"
                              : currentTicket.ticket.state === "DONE"
                              ? "#10B981"
                              : "#F59E0B",
                        }}
                      >
                        {currentTicket.ticket.state === "CALLED"
                          ? "📢 ถึงคิวแล้ว!"
                          : currentTicket.ticket.state === "SERVING"
                          ? "👨‍⚕️ กำลังรับบริการ"
                          : currentTicket.ticket.state === "DONE"
                          ? "✓ เสร็จสิ้น"
                          : "⏳ กำลังรอคิว"}
                      </div>
                    </div>

                    {/* Big Ticket Number */}
                    <div style={styles.ticketNumberSection}>
                      <div style={styles.ticketNumberSubLabel}>หมายเลขคิวของคุณ</div>
                      <div style={styles.ticketNumberDisplay}>{currentTicket.ticket.number}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
                        <span style={styles.livePulseDot}></span>
                        <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>
                          เชื่อมต่อระบบสด Realtime
                        </span>
                      </div>
                    </div>

                    {/* Live Called Comparison Bar */}
                    <div style={styles.compareQueueRow}>
                      <span style={styles.callingPulseDot}></span>
                      <span style={{ fontSize: 12, color: "#334155" }}>
                        ตอนนี้เคาน์เตอร์เรียกถึงคิว:{" "}
                        <strong style={{ color: "#059669", fontSize: 15, letterSpacing: 0.5 }}>
                          {callingInfo.currentNumber || "ยังไม่มีคิวเรียก"}
                        </strong>
                        {callingInfo.currentCounter ? ` (${callingInfo.currentCounter})` : ""}
                      </span>
                    </div>

                    {/* Twin Metrics Glass Box */}
                    <div style={styles.twinMetricsRow}>
                      <div style={styles.twinMetricItem}>
                        <div style={styles.twinMetricValue}>{currentTicket.aheadCount}</div>
                        <div style={styles.twinMetricLabel}>คิวข้างหน้า</div>
                      </div>
                      <div style={styles.twinMetricDivider}></div>
                      <div style={styles.twinMetricItem}>
                        <div style={styles.twinMetricValue}>~{currentTicket.estimatedWaitMinutes}</div>
                        <div style={styles.twinMetricLabel}>เวลารอประมาณ (นาที)</div>
                      </div>
                    </div>
                  </div>

                  {/* Perforated Divider with Left/Right Notches */}
                  <div style={styles.ticketPerforatedRow}>
                    <div style={styles.notchLeft}></div>
                    <div style={styles.perforatedLine}></div>
                    <div style={styles.notchRight}></div>
                  </div>

                  {/* Bottom Section */}
                  <div style={styles.ticketBottomSection}>
                    {/* Called Alert Box if Called */}
                    {currentTicket.ticket.state === "CALLED" && (
                      <div style={styles.calledBannerBox}>
                        <div style={{ fontSize: 24 }}>📢</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "#991B1B" }}>
                            ถึงคิวของคุณแล้ว!
                          </div>
                          <div style={{ fontSize: 13, color: "#B91C1C", marginTop: 2 }}>
                            กรุณาติดต่อที่: <strong>{currentTicket.ticket.counterId || "เคาน์เตอร์ 1"}</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4-Step Queue Journey Tracker */}
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 10 }}>
                        เส้นทางการรับบริการ (Queue Journey)
                      </div>
                      <div style={styles.journeyTrack}>
                        <div style={styles.journeyStep}>
                          <div style={{ ...styles.journeyDot, ...(currentStep >= 1 ? styles.journeyDotActive : {}) }}>
                            {currentStep > 1 ? "✓" : "1"}
                          </div>
                          <span style={styles.journeyLabel}>ออกบัตร</span>
                        </div>
                        <div style={{ ...styles.journeyLine, ...(currentStep >= 2 ? styles.journeyLineActive : {}) }}></div>
                        <div style={styles.journeyStep}>
                          <div style={{ ...styles.journeyDot, ...(currentStep >= 2 ? styles.journeyDotActive : {}) }}>
                            {currentStep > 2 ? "✓" : "2"}
                          </div>
                          <span style={styles.journeyLabel}>รอเรียก</span>
                        </div>
                        <div style={{ ...styles.journeyLine, ...(currentStep >= 3 ? styles.journeyLineActive : {}) }}></div>
                        <div style={styles.journeyStep}>
                          <div style={{ ...styles.journeyDot, ...(currentStep >= 3 ? styles.journeyDotActive : {}) }}>
                            {currentStep > 3 ? "✓" : "3"}
                          </div>
                          <span style={styles.journeyLabel}>รับบริการ</span>
                        </div>
                        <div style={{ ...styles.journeyLine, ...(currentStep >= 4 ? styles.journeyLineActive : {}) }}></div>
                        <div style={styles.journeyStep}>
                          <div style={{ ...styles.journeyDot, ...(currentStep >= 4 ? styles.journeyDotActive : {}) }}>
                            4
                          </div>
                          <span style={styles.journeyLabel}>เสร็จสิ้น</span>
                        </div>
                      </div>
                    </div>

                    {/* QR Code Scan Placeholder for Counter */}
                    <div style={styles.ticketMetaRow}>
                      <div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>รหัสตั๋วระบบ</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", fontFamily: "monospace" }}>
                          {currentTicket.ticket.id.slice(0, 8)}...
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>เวลาออกคิว</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
                          {new Date(currentTicket.ticket.createdAt).toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })} น.
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                      <button
                        onClick={() => {
                          loadCallingInfo();
                          if (profile) loadActiveTicket(profile.userId);
                        }}
                        style={styles.refreshBtn}
                      >
                        🔄 อัปเดตสถานะสด
                      </button>
                      {currentTicket.ticket.state === "WAITING" && (
                        <button
                          onClick={handleCancelTicket}
                          style={styles.cancelTicketBtn}
                        >
                          ยกเลิกคิว
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================= TAB 3: CUSTOMER PROFILE ================= */}
        {activeTab === "profile" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Digital Membership Card */}
            <div style={styles.membershipCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={styles.cardBrandBadge}>BCCRM ELITE MEMBER</span>
                  <div style={styles.cardMemberTier}>PREMIUM CLIENT</div>
                </div>
                <div style={styles.chipIcon}>💳</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "20px 0 16px 0" }}>
                <img
                  src={profile.pictureUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=user"}
                  alt={profile.displayName}
                  style={styles.memberAvatar}
                />
                <div>
                  <div style={styles.memberName}>{profile.displayName}</div>
                  <div style={styles.memberUid}>ID: {profile.userId}</div>
                  <div style={styles.memberStatusBadge}>✓ ยืนยันตัวตนผ่าน LINE แล้ว</div>
                </div>
              </div>

              <div style={styles.memberCardFooter}>
                <div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>สาขาประจำ</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>สาขาหลัก (Demo)</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>ความยินยอม PDPA</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#10B981" }}>ยินยอมแล้ว (Active)</div>
                </div>
              </div>
            </div>

            {/* Dev Switcher if in Dev Mode */}
            {profile.devMode && (
              <div style={styles.devCard}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#B45309", marginBottom: 8 }}>
                  🛠 ตัวสลับบัญชีทดสอบ (Dev Mode):
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    style={styles.devSwitchBtn}
                    onClick={() => switchDevUser("Udev001", "คุณสมชาย (ทั่วไป)")}
                  >
                    ลูกค้า 1 (ทั่วไป)
                  </button>
                  <button
                    style={styles.devSwitchBtn}
                    onClick={() => switchDevUser("Uvip888", "คุณหญิงวิไล (VIP)")}
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

            {/* Quick Actions / Preferences */}
            <div style={styles.card}>
              <h3 style={styles.cardSectionTitle}>⚙️ การตั้งค่าและสิทธิ์ของฉัน</h3>
              <div style={styles.settingsRow}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>การแจ้งเตือนเสียงเรียกคิว</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>เล่นเสียง Chime อัตโนมัติเมื่อถึงคิว</div>
                </div>
                <button
                  style={styles.testSoundBtn}
                  onClick={() => playCallChime()}
                >
                  🔊 ทดสอบเสียง
                </button>
              </div>

              <div style={styles.settingsRow}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>นโยบายคุ้มครองข้อมูล (PDPA)</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>ยินยอมการเก็บข้อมูลเพื่อจัดคิว</div>
                </div>
                <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>เวอร์ชัน 1.0</span>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 4: AI CHAT (DEEPSEEK) ================= */}
        {activeTab === "chat" && (
          <section style={styles.chatSection}>
            {/* Assistant Banner */}
            <div style={styles.chatBotHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={styles.chatBotAvatar}>🤖</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 14, color: "#0F172A" }}>น้องบีซี (ผู้ช่วยต้อนรับ)</strong>
                    <span style={styles.onlineDot}></span>
                  </div>
                  <div style={{ fontSize: 11, color: "#059669", fontWeight: 500 }}>
                    พร้อมคุยเป็นเพื่อน & ดูแลคิวให้คุณ 24 ชม. 🌿
                  </div>
                </div>
              </div>
              <span style={{ ...styles.aiBadge, backgroundColor: "#10B981" }}>พร้อมดูแล</span>
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
                onClick={() => handleSendChatMessage("ตอนนี้เรียกถึงคิวไหนแล้วคะ?")}
              >
                📢 เรียกถึงคิวไหนแล้ว
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("วันนี้เหนื่อยมากเลย ชวนคุยหน่อยได้ไหม?")}
              >
                🌿 คุยคลายเครียด
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("ที่นี่มีบริการอะไรบ้างและมีคุณหมอตรวจไหม?")}
              >
                🩺 ข้อมูลบริการ
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("จะจองคิวต้องทำอย่างไรบ้างคะ?")}
              >
                📌 จองคิวออนไลน์
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
                    gap: 8,
                  }}
                >
                  {msg.sender === "ai" && <div style={styles.msgAvatar}>🤖</div>}
                  <div style={{ maxWidth: "80%" }}>
                    <div
                      style={{
                        ...(msg.sender === "user" ? styles.userBubble : styles.aiBubble),
                      }}
                    >
                      <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.text}</p>
                      {msg.hasCard && currentTicket && (
                        <div style={styles.chatTicketCard}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#64748B" }}>บัตรคิวของคุณ</span>
                            <span style={styles.chatTicketBadge}>{currentTicket.ticket.state}</span>
                          </div>
                          <div style={styles.chatTicketNumber}>{currentTicket.ticket.number}</div>
                          <div style={{ fontSize: 12, color: "#334155", marginBottom: 8 }}>
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
                        marginTop: 3,
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
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
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

            {/* Chat Input Row */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              style={styles.chatInputRow}
            >
              <input
                type="text"
                placeholder="พิมพ์คุยกับน้องบีซีได้ทุกเรื่องเลยนะคะ..."
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

      {/* Floating Frosted Glass Bottom Navigation */}
      <nav style={styles.floatingBottomNav}>
        <button
          onClick={() => setActiveTab("book")}
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "book" ? styles.navPillBtnActive : {}),
          }}
        >
          <span style={{ fontSize: 18 }}>📋</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "book" ? 700 : 500 }}>จองคิว</span>
        </button>

        <button
          onClick={() => setActiveTab("ticket")}
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "ticket" ? styles.navPillBtnActive : {}),
            position: "relative",
          }}
        >
          <span style={{ fontSize: 18 }}>🎫</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "ticket" ? 700 : 500 }}>
            บัตรคิว
          </span>
          {currentTicket && <span style={styles.ticketBadgeDot}></span>}
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "chat" ? styles.navPillBtnActive : {}),
          }}
        >
          <span style={{ fontSize: 18 }}>💬</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "chat" ? 700 : 500 }}>
            คุยกับ AI
          </span>
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "profile" ? styles.navPillBtnActive : {}),
          }}
        >
          <span style={{ fontSize: 18 }}>👤</span>
          <span style={{ fontSize: 11, fontWeight: activeTab === "profile" ? 700 : 500 }}>
            ข้อมูล
          </span>
        </button>
      </nav>
    </div>
  );
}

// Inline Luxury Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100vh",
    backgroundColor: "#F8FAFC",
    fontFamily: "'Prompt', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    paddingBottom: 90,
  },
  header: {
    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
    padding: "16px 20px 20px 20px",
    color: "#FFFFFF",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.2)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  brandIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: "linear-gradient(135deg, #06C755 0%, #059669 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#FFFFFF",
    boxShadow: "0 4px 10px rgba(6, 199, 85, 0.3)",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    fontSize: 11,
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    borderRadius: "50%",
    width: 15,
    height: 15,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#94A3B8",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#10B981",
    display: "inline-block",
  },
  devTag: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    border: "1px solid rgba(245, 158, 11, 0.4)",
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 12,
  },
  avatarButton: {
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "2px solid rgba(255, 255, 255, 0.2)",
    objectFit: "cover",
  },
  greetingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  },
  liveCallingHeaderBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    padding: "5px 10px",
    borderRadius: 16,
  },
  callingPulseDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    display: "inline-block",
    boxShadow: "0 0 6px #22C55E",
  },
  headerTicketPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(6, 199, 85, 0.15)",
    border: "1px solid rgba(6, 199, 85, 0.4)",
    color: "#4ADE80",
    padding: "6px 12px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  content: {
    padding: 16,
    flex: 1,
  },
  liveMonitorCard: {
    background: "linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)",
    border: "1.5px solid #86EFAC",
    borderRadius: 18,
    padding: "14px 18px",
    boxShadow: "0 4px 14px rgba(6, 199, 85, 0.1)",
  },
  speakerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    boxShadow: "0 2px 6px rgba(6, 199, 85, 0.15)",
  },
  counterBadgePill: {
    backgroundColor: "#DCFCE7",
    color: "#15803D",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 12,
    border: "1px solid #BBF7D0",
  },
  waitingCountPill: {
    backgroundColor: "#FFFFFF",
    color: "#047857",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 12px",
    borderRadius: 14,
    border: "1px solid #A7F3D0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
  },
  activeNoticeCard: {
    background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    border: "1px solid #BFDBFE",
    borderRadius: 18,
    padding: "14px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.08)",
  },
  activeNoticeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    boxShadow: "0 2px 6px rgba(37, 99, 235, 0.15)",
  },
  activeNoticeArrow: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1D4ED8",
  },
  heroCard: {
    background: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)",
    borderRadius: 20,
    padding: 20,
    border: "1px solid #E2E8F0",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
  },
  heroSubTag: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    color: "#059669",
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
    margin: "4px 0 6px 0",
  },
  heroDesc: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 1.5,
    margin: 0,
  },
  heroDecoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F0FDF4",
    border: "1px solid #DCFCE7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },
  heroStatsGrid: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: "10px 12px",
    marginTop: 14,
    border: "1px solid #F1F5F9",
  },
  heroStatItem: {
    flex: 1,
    textAlign: "center",
  },
  heroStatValue: {
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
  },
  heroStatLabel: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    border: "1px solid #E2E8F0",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.03)",
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0F172A",
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  titleIcon: {
    fontSize: 16,
  },
  serviceItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1.5px solid #E2E8F0",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  serviceItemSelected: {
    borderColor: "#06C755",
    backgroundColor: "#F0FDF4",
    boxShadow: "0 4px 12px rgba(6, 199, 85, 0.12)",
  },
  serviceItemVip: {
    borderLeft: "4px solid #7C3AED",
  },
  prefixBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    fontWeight: 800,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  vipBadge: {
    backgroundColor: "#F5F3FF",
    color: "#7C3AED",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 6,
    border: "1px solid #DDD6FE",
  },
  radioIndicator: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "2px solid #CBD5E1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radioInnerDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#FFFFFF",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    display: "block",
    marginBottom: 6,
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    border: "1.5px solid #E2E8F0",
    borderRadius: 14,
    padding: "4px 14px",
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 8,
    color: "#64748B",
  },
  cleanInput: {
    flex: 1,
    border: "none",
    background: "none",
    outline: "none",
    fontSize: 14,
    fontFamily: "inherit",
    padding: "10px 0",
    color: "#0F172A",
  },
  consentBox: {
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  checkbox: {
    marginTop: 3,
    accentColor: "#06C755",
    width: 16,
    height: 16,
  },
  primaryButton: {
    width: "100%",
    background: "linear-gradient(135deg, #06C755 0%, #059669 100%)",
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "inherit",
    padding: 15,
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    marginTop: 18,
    boxShadow: "0 6px 16px rgba(6, 199, 85, 0.28)",
    transition: "all 0.15s ease",
  },
  miniSpinner: {
    width: 14,
    height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid #FFFFFF",
    borderRadius: "50%",
    display: "inline-block",
    animation: "spin 0.8s linear infinite",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 40,
    textAlign: "center",
    border: "1px solid #E2E8F0",
    boxShadow: "0 4px 14px rgba(15, 23, 42, 0.03)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 32,
  },
  // Luxury Boarding-Pass Ticket
  boardingPassTicket: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.08)",
    border: "1px solid #E2E8F0",
    overflow: "hidden",
  },
  ticketTopSection: {
    padding: "24px 24px 16px 24px",
    background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%)",
  },
  ticketOrgName: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#059669",
    textTransform: "uppercase",
  },
  ticketServiceName: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0F172A",
    marginTop: 2,
  },
  ticketStatusPill: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: 20,
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  },
  ticketNumberSection: {
    textAlign: "center",
    padding: "20px 0 10px 0",
  },
  ticketNumberSubLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#64748B",
    letterSpacing: 0.5,
  },
  ticketNumberDisplay: {
    fontSize: 60,
    fontWeight: 900,
    letterSpacing: 2,
    lineHeight: 1.1,
    color: "#06C755",
    textShadow: "0 2px 10px rgba(6, 199, 85, 0.2)",
    margin: "4px 0",
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#06C755",
    display: "inline-block",
    animation: "ripple 2s infinite ease-in-out",
  },
  compareQueueRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    border: "1px solid #BBF7D0",
    borderRadius: 12,
    padding: "8px 14px",
    margin: "8px 0 12px 0",
  },
  twinMetricsRow: {
    display: "flex",
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: "14px 12px",
    marginTop: 6,
  },
  twinMetricItem: {
    flex: 1,
    textAlign: "center",
  },
  twinMetricValue: {
    fontSize: 24,
    fontWeight: 800,
    color: "#0F172A",
  },
  twinMetricLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  twinMetricDivider: {
    width: 1,
    backgroundColor: "#E2E8F0",
  },
  ticketPerforatedRow: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    height: 24,
    backgroundColor: "#FAFAFA",
  },
  notchLeft: {
    position: "absolute",
    left: -12,
    width: 24,
    height: 24,
    borderRadius: "50%",
    backgroundColor: "#F8FAFC",
    borderRight: "1px solid #E2E8F0",
  },
  notchRight: {
    position: "absolute",
    right: -12,
    width: 24,
    height: 24,
    borderRadius: "50%",
    backgroundColor: "#F8FAFC",
    borderLeft: "1px solid #E2E8F0",
  },
  perforatedLine: {
    width: "100%",
    margin: "0 20px",
    borderTop: "2px dashed #CBD5E1",
  },
  ticketBottomSection: {
    padding: "16px 24px 24px 24px",
    backgroundColor: "#FAFAFA",
  },
  calledBannerBox: {
    backgroundColor: "#FEF2F2",
    border: "1.5px solid #F87171",
    borderRadius: 16,
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    animation: "pulseSlow 2s infinite",
  },
  journeyTrack: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: "14px 16px",
    border: "1px solid #E2E8F0",
  },
  journeyStep: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  journeyDot: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    backgroundColor: "#E2E8F0",
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  journeyDotActive: {
    backgroundColor: "#06C755",
    color: "#FFFFFF",
    boxShadow: "0 2px 6px rgba(6, 199, 85, 0.4)",
  },
  journeyLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8F0",
    margin: "0 6px",
    marginBottom: 16,
  },
  journeyLineActive: {
    backgroundColor: "#06C755",
  },
  journeyLabel: {
    fontSize: 10,
    color: "#64748B",
    fontWeight: 500,
  },
  ticketMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    marginTop: 14,
  },
  refreshBtn: {
    flex: 2,
    backgroundColor: "#F1F5F9",
    color: "#1E293B",
    border: "1px solid #CBD5E1",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  cancelTicketBtn: {
    flex: 1,
    backgroundColor: "#FEF2F2",
    color: "#DC2626",
    border: "1px solid #FECACA",
    padding: "12px 14px",
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  // Profile Tab
  membershipCard: {
    background: "linear-gradient(135deg, #059669 0%, #0F172A 100%)",
    color: "#FFFFFF",
    borderRadius: 22,
    padding: "22px 20px",
    boxShadow: "0 10px 25px -5px rgba(5, 150, 105, 0.3)",
  },
  cardBrandBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#6EE7B7",
  },
  cardMemberTier: {
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 1,
    marginTop: 2,
  },
  chipIcon: {
    fontSize: 28,
  },
  memberAvatar: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    border: "2px solid #34D399",
  },
  memberName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#FFFFFF",
  },
  memberUid: {
    fontSize: 11,
    color: "#94A3B8",
    fontFamily: "monospace",
    marginTop: 2,
  },
  memberStatusBadge: {
    display: "inline-block",
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    border: "1px solid rgba(16, 185, 129, 0.4)",
    color: "#A7F3D0",
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 6,
    marginTop: 4,
  },
  memberCardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    paddingTop: 12,
  },
  devCard: {
    backgroundColor: "#FFFBEB",
    border: "1px solid #FDE68A",
    borderRadius: 16,
    padding: 14,
  },
  devSwitchBtn: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #D97706",
    color: "#B45309",
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  settingsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #F1F5F9",
  },
  testSoundBtn: {
    backgroundColor: "#F1F5F9",
    border: "1px solid #CBD5E1",
    color: "#334155",
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  // AI Chat Section
  chatSection: {
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 190px)",
  },
  chatBotHeader: {
    backgroundColor: "#FFFFFF",
    padding: "12px 16px",
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    border: "1px solid #E2E8F0",
    marginBottom: 10,
    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
  },
  chatBotAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
    border: "1px solid #BFDBFE",
  },
  aiBadge: {
    backgroundColor: "#0284C7",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  quickChipsContainer: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 8,
    marginBottom: 6,
    WebkitOverflowScrolling: "touch",
  },
  quickChip: {
    whiteSpace: "nowrap",
    backgroundColor: "#FFFFFF",
    border: "1px solid #CBD5E1",
    borderRadius: 20,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
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
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    flexShrink: 0,
    marginBottom: 4,
  },
  userBubble: {
    background: "linear-gradient(135deg, #06C755 0%, #059669 100%)",
    color: "#FFFFFF",
    padding: "11px 16px",
    borderRadius: "18px 18px 4px 18px",
    fontSize: 14,
    boxShadow: "0 2px 8px rgba(6, 199, 85, 0.15)",
  },
  aiBubble: {
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    padding: "11px 16px",
    borderRadius: "18px 18px 18px 4px",
    fontSize: 14,
    border: "1px solid #E2E8F0",
    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
  },
  chatTicketCard: {
    backgroundColor: "#F8FAFC",
    border: "1.5px solid #E2E8F0",
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  chatTicketBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "#06C755",
    backgroundColor: "#DCFCE7",
    padding: "2px 8px",
    borderRadius: 6,
  },
  chatTicketNumber: {
    fontSize: 30,
    fontWeight: 900,
    color: "#06C755",
    margin: "4px 0",
  },
  viewTicketBtn: {
    width: "100%",
    background: "linear-gradient(135deg, #06C755 0%, #059669 100%)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  typingBubble: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: "18px 18px 18px 4px",
    padding: "10px 16px",
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
    padding: "8px 12px",
    borderRadius: 16,
    border: "1.5px solid #E2E8F0",
    boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
  },
  chatInput: {
    flex: 1,
    border: "none",
    background: "none",
    outline: "none",
    fontSize: 14,
    fontFamily: "inherit",
    padding: "6px 4px",
  },
  chatSendBtn: {
    background: "linear-gradient(135deg, #06C755 0%, #059669 100%)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "8px 16px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  // Floating Frosted Glass Navigation
  floatingBottomNav: {
    position: "fixed",
    bottom: 14,
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 28px)",
    maxWidth: 440,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: 24,
    border: "1px solid rgba(255, 255, 255, 0.8)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
    display: "flex",
    padding: 6,
    zIndex: 30,
  },
  navPillBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    borderRadius: 18,
    padding: "8px 0",
    cursor: "pointer",
    color: "#94A3B8",
    transition: "all 0.15s ease",
  },
  navPillBtnActive: {
    backgroundColor: "#F0FDF4",
    color: "#06C755",
    boxShadow: "0 2px 6px rgba(6, 199, 85, 0.15)",
  },
  ticketBadgeDot: {
    position: "absolute",
    top: 6,
    right: "26%",
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#EF4444",
    border: "2px solid #FFFFFF",
  },
  callAlertBanner: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    padding: "12px 18px",
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
    padding: "5px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },
  centerContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0F172A",
    fontFamily: "'Prompt', sans-serif",
  },
  errorBox: {
    backgroundColor: "#1E293B",
    border: "1px solid #334155",
    color: "#F8FAFC",
    padding: 24,
    borderRadius: 20,
    maxWidth: 360,
    textAlign: "center",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
  },
  spinner: {
    width: 36,
    height: 36,
    border: "3px solid #334155",
    borderTop: "3px solid #06C755",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto",
  },
};
