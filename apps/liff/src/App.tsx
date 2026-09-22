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

export interface MenuItem {
  id: string;
  name: string;
  category: "chicken" | "korean_dish" | "snack" | "bingsu" | "drink" | "combo";
  categoryName: string;
  price: number;
  description: string;
  spiceLevel?: number;
  hasSauceOption?: boolean;
  hasSweetnessOption?: boolean;
  isSignature?: boolean;
  isBestSeller?: boolean;
  emoji: string;
  tags: string[];
}

export interface CartItem {
  id: string;
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  spiciness?: string;
  sauce?: string;
  sweetness?: string;
  note: string;
  category: string;
  emoji: string;
}

const TICKET_STATE_LABELS: Record<string, string> = {
  WAITING: "รอเรียกคิว",
  CALLED: "ถึงคิวแล้ว เชิญที่เคาน์เตอร์",
  SERVING: "กำลังรับบริการ",
  DONE: "เสร็จสิ้น",
  CANCELLED: "ยกเลิกแล้ว",
  NO_SHOW: "ไม่มาตามคิว",
};

const OPTION_LABELS: Record<string, string> = {
  "non-spicy": "ไม่เผ็ด",
  mild: "เผ็ดน้อย",
  normal: "ปกติ",
  "extra-spicy": "เผ็ดเกาหลี x2",
  spicy: "ซอสเกาหลีเผ็ดหวาน",
  garlic: "ซอสการ์ลิคซอย",
  snow: "ซอสสโนว์ออเนียน",
  original: "ออริจินัล",
  "less-sweet": "หวานน้อย 50%",
};

export interface JevRecommendation {
  recommendations: Array<{ dish: MenuItem; reason: string; probability: number | null }>;
  source: "jev" | "fallback";
  latencyMs: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  tableNumber?: string;
  ticketId?: string;
  items: Array<{
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    spiciness?: string;
    sauce?: string;
    sweetness?: string;
    note?: string;
    subtotal: number;
  }>;
  totalAmount: number;
  status: "PENDING" | "COOKING" | "SERVED" | "CANCELLED";
  note?: string;
  createdAt: string;
}

type TabType = "book" | "order" | "ticket" | "chat" | "profile";

// Gentle audio chime for queue & order events
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
  const [activeTab, setActiveTab] = useState<TabType>("order");

  // Table Services & Queue Booking
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [pdpaConsent, setPdpaConsent] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active Ticket
  const [currentTicket, setCurrentTicket] = useState<TicketDetails | null>(null);
  const [loadingTicket, setLoadingTicket] = useState<boolean>(false);

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

  // Menu & Ordering
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [menuSearch, setMenuSearch] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Dish Customizer Modal
  const [customizingDish, setCustomizingDish] = useState<MenuItem | null>(null);
  const [customSpiciness, setCustomSpiciness] = useState<string>("normal");
  const [customSauce, setCustomSauce] = useState<string>("spicy");
  const [customSweetness, setCustomSweetness] = useState<string>("normal");
  const [customWithPlaRa, setCustomWithPlaRa] = useState<boolean>(false);
  const [customNote, setCustomNote] = useState<string>("");
  const [customQty, setCustomQty] = useState<number>(1);

  // JEV Cloud AI Next-Action Recommender
  const [jevRec, setJevRec] = useState<JevRecommendation | null>(null);
  const [isJevLoading, setIsJevLoading] = useState<boolean>(false);

  // Orders placed
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([]);
  const [isOrdering, setIsOrdering] = useState<boolean>(false);
  const [orderSuccessBanner, setOrderSuccessBanner] = useState<string | null>(null);

  // AI Chat (DeepSeek)
  const [chatMessages, setChatMessages] = useState<
    Array<{ sender: "user" | "ai"; text: string; time: string; hasCard?: boolean }>
  >([
    {
      sender: "ai",
      text: "สวัสดีค่ะคุณพี่ น้องบีซี โฮสเตสร้าน โซมายด์ (Seoulmind) เชียงใหม่ ยินดีต้อนรับค่ะ ✨🍗 วันนี้รับไก่ทอดเกาหลีซอสฉ่ำๆ หม้อไฟบูเดชิเกะ หรือบิงซูสตรอว์เบอร์รี่สดชีสเค้กปุยหิมะเย็นฉ่ำดีคะ ชวนคุยหรือสั่งอาหารได้เลยนะคะ 🍧☺️",
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

  // 2. Fetch available table services
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

  // 5. Load Menu Items
  const loadMenu = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/menu/items`);
      if (res.ok) {
        const data: MenuItem[] = await res.json();
        setMenuItems(data);
      }
    } catch (err) {
      console.error("Load menu error:", err);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  // 6. Load My Orders
  const loadMyOrders = useCallback(async () => {
    if (!profile?.userId && !currentTicket?.ticket?.id) return;
    try {
      const params = profile?.userId
        ? `lineUserId=${profile.userId}`
        : `ticketId=${currentTicket?.ticket?.id}`;
      const res = await fetch(`${API}/api/menu/orders/my?${params}`);
      if (res.ok) {
        const data: OrderRecord[] = await res.json();
        setMyOrders(data);
      }
    } catch (err) {
      console.error("Load orders error:", err);
    }
  }, [profile?.userId, currentTicket?.ticket?.id]);

  useEffect(() => {
    loadMyOrders();
  }, [loadMyOrders]);

  // 7. Realtime Socket connection
  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-branch", BRANCH_ID);
    });

    socket.on("queue:call", (data: { number: string; counterName: string }) => {
      setCallingInfo((prev) => ({
        ...prev,
        currentNumber: data.number,
        currentCounter: data.counterName,
        currentState: "CALLED",
      }));

      if (currentTicket && currentTicket.ticket.number === data.number) {
        playCallChime();
        setCallAlert(`🔔 ถึงคิวโต๊ะของคุณแล้ว! (${data.number}) เชิญที่ ${data.counterName} ได้เลยค่ะ`);
        if (profile?.userId) loadActiveTicket(profile.userId);
      }
    });

    socket.on("queue:update", () => {
      loadCallingInfo();
      if (profile?.userId) {
        loadActiveTicket(profile.userId);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentTicket, profile?.userId, loadActiveTicket, loadCallingInfo]);

  // 8. Trigger JEV AI Recommendation
  const triggerJevRecommendation = async (currentCart: CartItem[], lastViewedId?: string) => {
    if (currentCart.length === 0 && !lastViewedId) {
      setJevRec(null);
      return;
    }
    setIsJevLoading(true);
    try {
      const res = await fetch(`${API}/api/menu/recommend-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: currentCart.map((c) => ({
            id: c.dishId,
            name: c.name,
            category: c.category,
            price: c.price,
            spiciness: c.spiciness,
          })),
          lastViewedItemId: lastViewedId,
          tableType: currentTicket?.service?.name,
        }),
      });
      if (res.ok) {
        const data: JevRecommendation = await res.json();
        setJevRec(data);
      }
    } catch (err) {
      console.error("JEV recommendation error:", err);
    } finally {
      setIsJevLoading(false);
    }
  };

  // 9. Open Dish Customizer Modal
  const openCustomizer = (dish: MenuItem) => {
    setCustomizingDish(dish);
    setCustomSpiciness(dish.spiceLevel === 0 ? "non-spicy" : "normal");
    setCustomSauce("spicy");
    setCustomSweetness("normal");
    setCustomNote("");
    setCustomQty(1);
    // Also ask JEV what pairs with this dish
    triggerJevRecommendation(cart, dish.id);
  };

  // 10. Add Custom Dish to Cart
  const handleAddToCart = () => {
    if (!customizingDish) return;
    const newItem: CartItem = {
      id: `${customizingDish.id}-${Date.now()}`,
      dishId: customizingDish.id,
      name: customizingDish.name,
      price: customizingDish.price,
      quantity: customQty,
      spiciness: customizingDish.spiceLevel ? customSpiciness : undefined,
      sauce: customizingDish.hasSauceOption ? customSauce : undefined,
      sweetness: customizingDish.hasSweetnessOption ? customSweetness : undefined,
      note: customNote.trim(),
      category: customizingDish.category,
      emoji: customizingDish.emoji,
    };

    const newCart = [...cart, newItem];
    setCart(newCart);
    setCustomizingDish(null);
    playCallChime();

    // Trigger JEV Cloud AI Next Recommendation for the updated cart!
    triggerJevRecommendation(newCart, customizingDish.id);
  };

  // 11. Quick 1-Tap Add JEV Recommended Dish
  const handleAddJevRecommendation = (dish: MenuItem) => {
    const newItem: CartItem = {
      id: `${dish.id}-${Date.now()}`,
      dishId: dish.id,
      name: dish.name,
      price: dish.price,
      quantity: 1,
      spiciness: dish.spiceLevel ? "normal" : undefined,
      sauce: dish.hasSauceOption ? "spicy" : undefined,
      sweetness: dish.hasSweetnessOption ? "normal" : undefined,
      note: "",
      category: dish.category,
      emoji: dish.emoji,
    };
    const newCart = [...cart, newItem];
    setCart(newCart);
    playCallChime();
    triggerJevRecommendation(newCart, dish.id);
  };

  // 12. Adjust cart item quantity
  const updateCartQty = (id: string, delta: number) => {
    const newCart = cart
      .map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      })
      .filter((i): i is CartItem => i !== null);
    setCart(newCart);
    triggerJevRecommendation(newCart);
  };

  // 13. Submit Food Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isOrdering) return;
    setIsOrdering(true);

    try {
      // preorder: ยังไม่มีคิว → ออกบัตรคิวตามขนาดโต๊ะที่เลือกให้ก่อน แล้วผูกออเดอร์กับคิวนั้น
      let ticketId = currentTicket?.ticket.id;
      let ticketNumber = currentTicket?.ticket.number;
      if (!ticketId) {
        if (!profile) throw new Error("กรุณาเข้าสู่ระบบ LINE ก่อนสั่งอาหาร");
        const ticketRes = await fetch(`${API}/api/queues/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId: BRANCH_ID,
            serviceId: selectedServiceId,
            source: "LINE_BOOKING",
            customerId: profile.userId,
          }),
        });
        if (!ticketRes.ok) throw new Error("รับบัตรคิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        const ticket: TicketRecord = await ticketRes.json();
        ticketId = ticket.id;
        ticketNumber = ticket.number;
        loadActiveTicket(profile.userId);
        loadCallingInfo();
      }
      const tableNumber = `คิว ${ticketNumber}`;

      const res = await fetch(`${API}/api/menu/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: BRANCH_ID,
          items: cart.map((c) => ({
            itemId: c.dishId,
            name: c.name,
            price: c.price,
            quantity: c.quantity,
            spiciness: c.spiciness,
            sauce: c.sauce,
            sweetness: c.sweetness,
            note: c.note,
          })),
          tableNumber,
          ticketId,
          lineUserId: profile?.userId,
          customerName: profile?.displayName || "ลูกค้าโซมายด์",
          phone: phone || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("ไม่สามารถส่งออเดอร์ได้ กรุณาลองใหม่อีกครั้ง");
      }

      const orderData: OrderRecord = await res.json();
      playCallChime();
      setCart([]);
      setIsCartOpen(false);
      setOrderSuccessBanner(
        `🎉 สั่งล่วงหน้าสำเร็จ! ออเดอร์ ${orderData.orderNumber} • คิว ${ticketNumber} ร้านได้รับออเดอร์แล้วค่ะ`,
      );
      loadMyOrders();
      setActiveTab("ticket");
    } catch (err) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสั่งอาหาร");
    } finally {
      setIsOrdering(false);
    }
  };

  // 14. Handle Booking Table Queue
  const handleBooking = async () => {
    if (!profile) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`${API}/api/queues/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: BRANCH_ID,
          serviceId: selectedServiceId,
          source: "LINE_BOOKING",
          lineUserId: profile.userId,
          customerId: profile.userId,
        }),
      });

      if (res.ok) {
        playCallChime();
        await loadActiveTicket(profile.userId);
        loadCallingInfo();
        setActiveTab("ticket");
      } else {
        alert("ไม่สามารถรับบัตรคิวได้ กรุณาลองใหม่");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 15. Cancel Queue Ticket
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

  // 16. Chat with DeepSeek AI
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

      if (!res.ok) throw new Error("ระบบ AI ไม่ตอบสนองในขณะนี้");

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

  // Filtered menu items
  // มีคำค้น → ค้นทั้งเมนูไม่สนหมวด (ลูกค้าไม่ต้องรู้ว่าจานอยู่หมวดไหน)
  const searchQuery = menuSearch.trim().toLowerCase();
  const filteredMenu = searchQuery
    ? menuItems.filter((m) =>
        [m.name, m.description, m.categoryName, ...m.tags].some((t) => t.toLowerCase().includes(searchQuery)),
      )
    : selectedCategory === "all"
      ? menuItems
      : menuItems.filter((m) => m.category === selectedCategory);

  const cartTotalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
          <p style={{ marginTop: 16, fontSize: 14, fontWeight: 500, letterSpacing: 0.5 }}>กำลังเชื่อมต่อร้านอาหารโซมายด์ เชียงใหม่...</p>
        </div>
      </main>
    );
  }

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={styles.brandIconWrap}>
              <span style={{ fontSize: 20 }}>🍗</span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={styles.headerTitle}>โซมายด์ (Seoulmind)</span>
                <span style={styles.verifiedBadge}>✓</span>
              </div>
              <div style={styles.headerSubtitle}>
                <span style={styles.onlineDot}></span>
                <span>ไก่ทอดเกาหลี & บิงซู • เชียงใหม่ หลังวัดอุโมงค์</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={styles.cartQuickHeaderBtn}
              onClick={() => setIsCartOpen(true)}
            >
              <span>🛒</span>
              {cartTotalCount > 0 && (
                <span style={styles.cartHeaderBadge}>{cartTotalCount}</span>
              )}
            </div>
          </div>
        </div>

        {/* Live Calling Ticker Bar */}
        <div style={styles.liveCallingTickerBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={styles.pulseDot}></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.5 }}>
              คิวโต๊ะสดหน้าร้าน:
            </span>
            <span style={styles.callingNumberHighlight}>
              {callingInfo.currentNumber || "ว่าง (เข้าร้านได้ทันที)"}
            </span>
          </div>
          <span style={styles.callingCounterLabel}>
            {callingInfo.currentCounter || "เคาน์เตอร์ต้อนรับ"} • รอ {callingInfo.waitingCount} คิว
          </span>
        </div>
      </header>

      {/* Global Call Alert Notification */}
      {callAlert && (
        <div style={styles.callAlertBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>แจ้งเตือนเรียกโต๊ะสด!</div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>{callAlert}</div>
            </div>
          </div>
          <button style={styles.closeAlertBtn} onClick={() => setCallAlert(null)}>
            รับทราบ
          </button>
        </div>
      )}

      {/* Order Success Banner */}
      {orderSuccessBanner && (
        <div style={styles.orderSuccessBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>✨</span>
            <span>{orderSuccessBanner}</span>
          </div>
          <button
            style={styles.closeBannerBtn}
            onClick={() => setOrderSuccessBanner(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      <main style={styles.content}>
        {/* ================= TAB 1: MENU & FOOD ORDERING ================= */}
        {activeTab === "order" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Hero Card */}
            <div style={styles.menuHeroCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={styles.heroSubTag}>AUTHENTIC KOREAN DINING</span>
                  <h2 style={styles.heroTitle}>สั่งอาหารออนไลน์ สดใหม่จากเตา</h2>
                  <p style={styles.heroDesc}>
                    สั่งล่วงหน้าก่อนถึงร้าน พร้อมรับบัตรคิวในขั้นตอนเดียว ถึงร้านได้ทานเลย ไม่ต้องรอนาน
                  </p>
                </div>
                <div style={styles.heroDecoBadge}>
                  <span>🔥</span>
                </div>
              </div>
            </div>

            {/* ⚡ JEV CLOUD AI NEXT-ACTION RECOMMENDER FLOW ⚡ */}
            {jevRec && (
              <div style={styles.jevAiCard}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={styles.aiGlowDot}></span>
                    <span style={styles.jevAiTitle}>⚡ JEV AI SMART DINING FLOW</span>
                    <span style={styles.jevConfidenceBadge}>
                      {jevRec.source === "jev" ? "AI" : "แนะนำ"}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "#64748B" }}>{jevRec.latencyMs}ms</span>
                </div>

                <div style={styles.jevPunchline}>🛒 สั่งเพิ่มไว้เลย ถึงร้านทานได้ครบมื้อ</div>

                {jevRec.recommendations.map(({ dish, reason }) => (
                  <div key={dish.id} style={styles.jevDishRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={styles.jevDishEmoji}>{dish.emoji}</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "#0F172A" }}>{dish.name}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{reason}</div>
                        <div style={{ fontSize: 12, color: "#E11D48", fontWeight: 700 }}>฿{dish.price}</div>
                      </div>
                    </div>

                    <button style={styles.jevQuickAddBtn} onClick={() => handleAddJevRecommendation(dish)}>
                      + เพิ่ม
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              type="search"
              placeholder="🔍 ค้นหาเมนู เช่น ไก่ บิงซู ชีส กิมจิ"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              style={{ ...styles.textInput, fontSize: 16, marginBottom: 10 }}
            />

            {/* Category Filter Pills */}
            <div style={styles.categoryScroller}>
              {[
                { id: "all", label: "ทั้งหมด", emoji: "🍽️" },
                { id: "chicken", label: "ไก่ทอดเกาหลี", emoji: "🍗" },
                { id: "korean_dish", label: "อาหารเกาหลี", emoji: "🍲" },
                { id: "snack", label: "ของทานเล่น", emoji: "🥢" },
                { id: "bingsu", label: "บิงซู", emoji: "🍧" },
                { id: "drink", label: "เครื่องดื่ม & สลัชชี่", emoji: "🧋" },
                { id: "combo", label: "เซ็ตสุดคุ้ม", emoji: "🍱" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  style={{
                    ...styles.categoryPill,
                    ...(selectedCategory === cat.id ? styles.categoryPillActive : {}),
                  }}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setMenuSearch("");
                  }}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Dishes Grid */}
            {searchQuery && filteredMenu.length === 0 && (
              <div style={{ textAlign: "center", color: "#64748B", fontSize: 13, padding: 24 }}>
                ไม่พบเมนู "{menuSearch.trim()}" ลองคำอื่นดูนะคะ
              </div>
            )}
            <div style={styles.dishGrid}>
              {filteredMenu.map((dish) => (
                <div key={dish.id} style={styles.dishCard}>
                  <div style={styles.dishCardHeader}>
                    <div style={styles.dishEmojiWrap}>{dish.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={styles.dishName}>{dish.name}</span>
                        {dish.isSignature && (
                          <span style={styles.signatureBadge}>ซิกเนเจอร์</span>
                        )}
                        {dish.isBestSeller && (
                          <span style={styles.bestsellerBadge}>ขายดี</span>
                        )}
                      </div>
                      <div style={styles.dishCategoryTag}>{dish.categoryName}</div>
                    </div>
                  </div>

                  <p style={styles.dishDescription}>{dish.description}</p>

                  {dish.spiceLevel !== undefined && dish.spiceLevel > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#64748B" }}>ระดับความเผ็ด:</span>
                      <span>{"🌶️".repeat(dish.spiceLevel)}</span>
                    </div>
                  )}

                  <div style={styles.dishCardFooter}>
                    <div style={styles.dishPrice}>฿{dish.price}</div>
                    <button
                      style={styles.orderDishBtn}
                      onClick={() => openCustomizer(dish)}
                    >
                      + สั่งจานนี้
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ================= TAB 2: BOOK TABLE QUEUE ================= */}
        {activeTab === "book" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Live Counter Monitor Card */}
            <div style={styles.liveMonitorCard}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={styles.speakerIconWrap}>📢</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#E11D48", letterSpacing: 0.5 }}>
                      สถานะคิวโต๊ะสดหน้าร้าน • NOW CALLING
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 13, color: "#334155" }}>กำลังเรียกคิว:</span>
                      <span style={{ fontSize: 24, fontWeight: 900, color: "#E11D48", letterSpacing: 1.5 }}>
                        {callingInfo.currentNumber || "ว่าง (เข้าร้านได้)"}
                      </span>
                      {callingInfo.currentCounter && (
                        <span style={styles.counterBadgePill}>{callingInfo.currentCounter}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={styles.waitingCountPill}>
                  <span>รอโต๊ะ {callingInfo.waitingCount} คิว</span>
                </div>
              </div>
            </div>

            {/* Active Ticket Banner */}
            {currentTicket && (
              <div style={styles.activeNoticeCard} onClick={() => setActiveTab("ticket")}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={styles.activeNoticeIcon}>🎫</div>
                  <div>
                    <div style={{ fontSize: 12, color: "#047857", fontWeight: 600 }}>คุณมีคิวโต๊ะที่กำลังรออยู่</div>
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

            {/* Restaurant Info Hero Card */}
            <div style={styles.heroCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={styles.heroSubTag}>EXPRESS TABLE QUEUE</span>
                  <h2 style={styles.heroTitle}>รับบัตรคิวโต๊ะอาหารออนไลน์</h2>
                  <p style={styles.heroDesc}>
                    เลือกขนาดโต๊ะเพื่อรับบัตรคิวทันที ไม่ต้องยืนรอด้านนอก พร้อมสั่งอาหารล่วงหน้า
                  </p>
                </div>
                <div style={styles.heroDecoBadge}>
                  <span>⚡</span>
                </div>
              </div>

              <div style={styles.heroStatsGrid}>
                <div style={styles.heroStatItem}>
                  <div style={styles.heroStatValue}>~15-30</div>
                  <div style={styles.heroStatLabel}>นาที / โต๊ะ</div>
                </div>
                <div style={styles.heroStatDivider}></div>
                <div style={styles.heroStatItem}>
                  <div style={styles.heroStatValue}>35</div>
                  <div style={styles.heroStatLabel}>โต๊ะรองรับ</div>
                </div>
                <div style={styles.heroStatDivider}></div>
                <div style={styles.heroStatItem}>
                  <div style={styles.heroStatValue}>11:30-21:00</div>
                  <div style={styles.heroStatLabel}>เวลาทำการ</div>
                </div>
              </div>
            </div>

            {/* Service / Table Selection List */}
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={styles.cardSectionTitle}>
                  <span style={styles.titleIcon}>🪑</span> เลือกประเภทโต๊ะอาหาร
                </h3>
                <span style={{ fontSize: 11, color: "#64748B" }}>เลือกขนาดที่ต้องการ</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {services.map((svc) => {
                  const isSelected = selectedServiceId === svc.id;
                  return (
                    <div
                      key={svc.id}
                      onClick={() => setSelectedServiceId(svc.id)}
                      style={{
                        ...styles.serviceItem,
                        ...(isSelected ? styles.serviceItemActive : {}),
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            ...styles.servicePrefixBadge,
                            ...(isSelected ? styles.servicePrefixActive : {}),
                          }}
                        >
                          {svc.ticketPrefix}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: isSelected ? "#991B1B" : "#0F172A" }}>
                            {svc.name}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                            เวลารอเฉลี่ย ~{svc.avgServiceMinutes} นาที
                          </div>
                        </div>
                      </div>
                      <div style={isSelected ? styles.radioChecked : styles.radioUnchecked}>
                        {isSelected && <div style={styles.radioDot} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Booking Form */}
            <div style={styles.card}>
              <h3 style={styles.cardSectionTitle}>
                <span style={styles.titleIcon}>👤</span> ข้อมูลผู้จอง
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
                <div>
                  <label style={styles.inputLabel}>ชื่อลูกค้า (ดึงจาก LINE อัตโนมัติ)</label>
                  <input
                    type="text"
                    disabled
                    value={profile.displayName}
                    style={styles.disabledInput}
                  />
                </div>

                <div>
                  <label style={styles.inputLabel}>เบอร์โทรศัพท์ (ทางเลือก สำหรับ SMS เตือนโต๊ะ)</label>
                  <input
                    type="tel"
                    placeholder="เช่น 0812345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={styles.textInput}
                  />
                </div>

                <div style={styles.consentRow}>
                  <input
                    type="checkbox"
                    id="pdpa-consent"
                    checked={pdpaConsent}
                    onChange={(e) => setPdpaConsent(e.target.checked)}
                    style={{ accentColor: "#EA580C", width: 16, height: 16 }}
                  />
                  <label htmlFor="pdpa-consent" style={{ fontSize: 12, color: "#64748B", lineHeight: 1.4 }}>
                    ยินยอมให้ร้านอาหารโซมายด์ เชียงใหม่ จัดเก็บข้อมูลเพื่อการให้บริการคิวและสั่งอาหาร
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleBooking}
                  disabled={isSubmitting || !pdpaConsent || !selectedServiceId}
                  style={{
                    ...styles.primaryButton,
                    opacity: isSubmitting || !pdpaConsent ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? "กำลังออกบัตรคิว..." : "กดรับบัตรคิวโต๊ะอาหารทันที 🎟️"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 3: MY TICKET & ORDERS ================= */}
        {activeTab === "ticket" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Active Ticket Card */}
            {loadingTicket ? (
              <div style={styles.loadingTicketCard}>
                <div style={styles.spinner}></div>
                <p style={{ marginTop: 12, fontSize: 13, color: "#64748B" }}>กำลังโหลดสถานะคิวของคุณ...</p>
              </div>
            ) : currentTicket ? (
              <div style={styles.ticketBoardingPass}>
                <div style={styles.ticketHeader}>
                  <div>
                    <span style={styles.ticketBrandTag}>SEOULMIND CHIANG MAI</span>
                    <h3 style={styles.ticketBranchName}>ร้านอาหารเกาหลี & บิงซู โซมายด์</h3>
                  </div>
                  <span style={styles.ticketStateBadge}>
                    {TICKET_STATE_LABELS[currentTicket.ticket.state] ?? currentTicket.ticket.state}
                  </span>
                </div>

                <div style={styles.ticketBody}>
                  <div style={{ textAlign: "center", margin: "16px 0" }}>
                    <div style={{ fontSize: 12, color: "#64748B", letterSpacing: 1 }}>หมายเลขคิวของคุณ</div>
                    <div style={styles.ticketBigNumber}>{currentTicket.ticket.number}</div>
                    <div style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
                      {currentTicket.service?.name ?? "โต๊ะอาหาร"}
                    </div>
                  </div>

                  <div style={styles.ticketDashDivider}></div>

                  <div style={styles.ticketStatsRow}>
                    <div style={{ textAlign: "center" }}>
                      <div style={styles.ticketStatValue}>{currentTicket.aheadCount}</div>
                      <div style={styles.ticketStatLabel}>คิวข้างหน้า</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={styles.ticketStatValue}>~{currentTicket.estimatedWaitMinutes}</div>
                      <div style={styles.ticketStatLabel}>นาทีโดยประมาณ</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={styles.ticketStatValue}>
                        {callingInfo.currentNumber || "-"}
                      </div>
                      <div style={styles.ticketStatLabel}>เรียกถึงคิวนี้</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button
                      onClick={() => profile?.userId && loadActiveTicket(profile.userId)}
                      style={styles.refreshBtn}
                    >
                      🔄 รีเฟรชคิวสด
                    </button>
                    {currentTicket.ticket.state === "WAITING" && (
                      <button onClick={handleCancelTicket} style={styles.cancelTicketBtn}>
                        ยกเลิกคิว
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.noTicketCard}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🪑</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>ยังไม่มีคิวโต๊ะอาหารในขณะนี้</div>
                <p style={{ fontSize: 12, color: "#64748B", margin: "4px 0 16px 0" }}>
                  คุณสามารถกดรับบัตรคิว หรือสั่งอาหารล่วงหน้าได้ทันทีค่ะ
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button style={styles.miniActionBtn} onClick={() => setActiveTab("book")}>
                    📋 รับบัตรคิวโต๊ะ
                  </button>
                  <button style={styles.miniActionBtnActive} onClick={() => setActiveTab("order")}>
                    🍽️ สั่งอาหารเลย
                  </button>
                </div>
              </div>
            )}

            {/* Orders Placed Status */}
            <div style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={styles.cardSectionTitle}>
                  <span style={styles.titleIcon}>🍳</span> ออเดอร์ล่วงหน้าของฉัน ({myOrders.length})
                </h3>
                <button
                  onClick={loadMyOrders}
                  style={{ background: "none", border: "none", color: "#E11D48", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                >
                  🔄 อัปเดต
                </button>
              </div>

              {myOrders.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: "#64748B", fontSize: 13 }}>
                  ยังไม่มีรายการอาหารที่สั่งในวันนี้ค่ะ
                  <div style={{ marginTop: 10 }}>
                    <button style={styles.miniActionBtnActive} onClick={() => setActiveTab("order")}>
                      🍽️ เปิดดูเมนูโซมายด์ & สั่งเลย
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {myOrders.map((order) => (
                    <div key={order.id} style={styles.orderHistoryCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A" }}>
                            {order.orderNumber}
                          </span>
                          <span style={styles.tableTagPill}>{order.tableNumber}</span>
                        </div>
                        <span style={styles.cookingBadge}>
                          {order.status === "COOKING" ? "🔥 ครัวกำลังปรุง" : order.status}
                        </span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "8px 0" }}>
                        {order.items.map((item, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ color: "#334155" }}>
                              {item.name} x {item.quantity}
                              <span style={{ fontSize: 11, color: "#EF4444", marginLeft: 4 }}>
                                {[item.spiciness, item.sauce, item.sweetness]
                                  .map((v) => (v ? OPTION_LABELS[v] : undefined))
                                  .filter(Boolean)
                                  .join(" • ")}
                              </span>
                            </span>
                            <span style={{ fontWeight: 600, color: "#0F172A" }}>
                              ฿{item.subtotal}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div style={styles.orderFooter}>
                        <span style={{ fontSize: 11, color: "#64748B" }}>
                          สั่งเมื่อ: {new Date(order.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: 15, color: "#E11D48" }}>
                          รวม ฿{order.totalAmount}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ================= TAB 4: AI CHAT (น้องบีซี กูรูอาหารโซมายด์) ================= */}
        {activeTab === "chat" && (
          <section style={styles.chatSection}>
            {/* Assistant Header */}
            <div style={styles.chatBotHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={styles.chatBotAvatar}>👩‍🍳</div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong style={{ fontSize: 14, color: "#0F172A" }}>น้องบีซี (กูรูอาหารโซมายด์ เชียงใหม่)</strong>
                    <span style={styles.onlineDot}></span>
                  </div>
                  <div style={{ fontSize: 11, color: "#EA580C", fontWeight: 500 }}>
                    พร้อมแนะนำไก่ทอดเกาหลี บิงซู & ดูแลโต๊ะอาหาร 24 ชม. ✨
                  </div>
                </div>
              </div>
              <span style={{ ...styles.aiBadge, backgroundColor: "#EA580C" }}>พร้อมดูแล</span>
            </div>

            {/* Quick Prompt Chips */}
            <div style={styles.quickChipsContainer}>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("วันนี้มีเมนูซิกเนเจอร์อะไรเด็ดๆ บ้างคะ แนะนำหน่อย")}
              >
                🍗 เมนูเด็ดโซมายด์
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("ตอนนี้คิวโต๊ะรอนานไหม เรียกถึงคิวไหนแล้ว")}
              >
                📢 คิวโต๊ะหน้าร้าน
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("ทานไก่ทอดเกาหลี ควรสั่งคู่กับบิงซูหรือของทานเล่นอะไรดี")}
              >
                🍧 บิงซูซิกเนเจอร์
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("วันนี้ทำงานเหนื่อยมากเลย หิวข้าวสุดๆ ชวนคุยหน่อย")}
              >
                🌿 คุยคลายเครียด
              </button>
              <button
                type="button"
                style={styles.quickChip}
                onClick={() => handleSendChatMessage("มา 3-4 คน สั่งเซ็ตไหนคุ้มสุดคะ")}
              >
                🌟 เซ็ตสุดคุ้ม
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
                  {msg.sender === "ai" && <div style={styles.msgAvatar}>👩‍🍳</div>}
                  <div style={{ maxWidth: "80%" }}>
                    <div
                      style={{
                        ...(msg.sender === "user" ? styles.userBubble : styles.aiBubble),
                      }}
                    >
                      <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.text}</p>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#94A3B8",
                        marginTop: 4,
                        textAlign: msg.sender === "user" ? "right" : "left",
                      }}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              {isAiTyping && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={styles.msgAvatar}>👩‍🍳</div>
                  <div style={styles.typingBubble}>
                    <span style={styles.typingDot}></span>
                    <span style={styles.typingDot}></span>
                    <span style={styles.typingDot}></span>
                  </div>
                </div>
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            {/* Chat Input */}
            <div style={styles.chatInputRow}>
              <input
                type="text"
                placeholder="คุยเรื่องอาหาร เมนูแนะนำ หรือถามคิวโต๊ะ..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                style={styles.chatInput}
              />
              <button
                type="button"
                onClick={() => handleSendChatMessage()}
                disabled={isAiTyping || !chatInput.trim()}
                style={{
                  ...styles.chatSendBtn,
                  opacity: !chatInput.trim() ? 0.5 : 1,
                }}
              >
                ส่ง
              </button>
            </div>
          </section>
        )}

        {/* ================= TAB 5: PROFILE ================= */}
        {activeTab === "profile" && (
          <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={styles.membershipCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={styles.cardBrandBadge}>SEOULMIND VIP MEMBER</span>
                  <div style={styles.cardMemberTier}>สมาชิกโซมายด์ เชียงใหม่</div>
                </div>
                <div style={styles.chipIcon}>🍗</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "20px 0 16px 0" }}>
                <img
                  src={profile.pictureUrl || "https://api.dicebear.com/7.x/bottts/svg?seed=user"}
                  alt={profile.displayName}
                  style={styles.memberAvatar}
                />
                <div>
                  <div style={styles.memberName}>{profile.displayName}</div>
                  <div style={styles.memberUid}>LINE ID: {profile.userId}</div>
                  <div style={styles.memberStatusBadge}>✓ เชื่อมต่อบัญชีแล้ว</div>
                </div>
              </div>

              <div style={styles.memberCardFooter}>
                <div>
                  <div style={{ fontSize: 10, color: "#FCA5A5" }}>สาขาประจำ</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#FFFFFF" }}>โซมายด์ หลังวัดอุโมงค์ เชียงใหม่</div>
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardSectionTitle}>📍 ข้อมูลร้านโซมายด์ (Seoulmind) เชียงใหม่</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#334155" }}>
                <div>⏰ <strong>เวลาเปิด-ปิด:</strong> ทุกวัน 11:30 – 21:00 น.</div>
                <div>📍 <strong>ที่ตั้ง:</strong> 207 ซอยกาแล 1 หลังวัดอุโมงค์ ต.สุเทพ อ.เมือง จ.เชียงใหม่</div>
                <div>🚗 <strong>ที่จอดรถ:</strong> มีที่จอดรถยนต์และมอเตอร์ไซค์สะดวกสบาย</div>
                <div>💳 <strong>การชำระเงิน:</strong> สแกน QR PromptPay, เงินสด, บัตรเครดิต</div>
                <div>💬 <strong>ติดต่อร้าน:</strong> แชทผ่าน LINE OA นี้ได้เลย</div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Floating Bottom Cart Bar (Shows if items in cart and on order tab) */}
      {cart.length > 0 && activeTab === "order" && (
        <div style={styles.floatingCartBar} onClick={() => setIsCartOpen(true)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛒</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#FFFFFF" }}>
                {cartTotalCount} รายการ • ฿{cartTotalAmount}
              </div>
              <div style={{ fontSize: 11, color: "#FECDD3" }}>
                แตะเพื่อตรวจสอบและยืนยันออเดอร์
              </div>
            </div>
          </div>
          <button style={styles.viewCartBtn}>ดูตะกร้า →</button>
        </div>
      )}

      {/* Dish Customizer Modal */}
      {customizingDish && (
        <div style={styles.modalOverlay} onClick={() => setCustomizingDish(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 28 }}>{customizingDish.emoji}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                    {customizingDish.name}
                  </h3>
                  <div style={{ fontSize: 13, color: "#E11D48", fontWeight: 700 }}>
                    ฿{customizingDish.price}
                  </div>
                </div>
              </div>
              <button style={styles.modalCloseBtn} onClick={() => setCustomizingDish(null)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#64748B", margin: "0 0 16px 0", lineHeight: 1.4 }}>
              {customizingDish.description}
            </p>

            {/* Spiciness Level Selection */}
            {customizingDish.spiceLevel !== undefined && customizingDish.spiceLevel > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={styles.modalFieldLabel}>🌶️ เลือกระดับความเผ็ด</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  {[
                    { id: "non-spicy", label: "ไม่เผ็ด", icon: "🟢" },
                    { id: "mild", label: "เผ็ดน้อย", icon: "🟡" },
                    { id: "normal", label: "เผ็ดมาตรฐาน", icon: "🟠" },
                    { id: "extra-spicy", label: "เผ็ดเกาหลี x2", icon: "🔴" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      style={{
                        ...styles.spicyOptionBtn,
                        ...(customSpiciness === s.id ? styles.spicyOptionActive : {}),
                      }}
                      onClick={() => setCustomSpiciness(s.id)}
                    >
                      <span>{s.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Korean Fried Chicken Sauce Option */}
            {customizingDish.hasSauceOption && (
              <div style={{ marginBottom: 16 }}>
                <label style={styles.modalFieldLabel}>🍗 เลือกซอสเคลือบไก่ทอด</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  {[
                    { id: "spicy", label: "ซอสเกาหลีเผ็ดหวาน", icon: "🌶️" },
                    { id: "garlic", label: "ซอสการ์ลิคซอยหวานเค็ม", icon: "🧄" },
                    { id: "snow", label: "ซอสสโนว์ออเนียน", icon: "🧅" },
                    { id: "original", label: "ออริจินัลกรอบกรุบ", icon: "🍗" },
                  ].map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      style={{
                        ...styles.spicyOptionBtn,
                        ...(customSauce === sc.id ? styles.spicyOptionActive : {}),
                      }}
                      onClick={() => setCustomSauce(sc.id)}
                    >
                      <span>{sc.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{sc.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bingsu & Drink Sweetness Option */}
            {customizingDish.hasSweetnessOption && (
              <div style={{ marginBottom: 16 }}>
                <label style={styles.modalFieldLabel}>🍧 ระดับความหวาน</label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    style={{
                      ...styles.spicyOptionBtn,
                      flex: 1,
                      ...(customSweetness === "normal" ? styles.spicyOptionActive : {}),
                    }}
                    onClick={() => setCustomSweetness("normal")}
                  >
                    <span>🍧</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>หวานปกติ 100%</span>
                  </button>
                  <button
                    type="button"
                    style={{
                      ...styles.spicyOptionBtn,
                      flex: 1,
                      ...(customSweetness === "less-sweet" ? styles.spicyOptionActive : {}),
                    }}
                    onClick={() => setCustomSweetness("less-sweet")}
                  >
                    <span>🍃</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>หวานน้อย 50%</span>
                  </button>
                </div>
              </div>
            )}

            {/* Note to Chef */}
            <div style={{ marginBottom: 16 }}>
              <label style={styles.modalFieldLabel}>📝 หมายเหตุถึงกุ๊ก (ถ้ามี)</label>
              <input
                type="text"
                placeholder="เช่น แยกซอส, ขอหัวไชเท้าดองเพิ่ม, ไม่ใส่ต้นหอม"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                style={styles.textInput}
              />
            </div>

            {/* Quantity Counter */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>จำนวน</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  style={styles.qtyBtn}
                  onClick={() => setCustomQty(Math.max(1, customQty - 1))}
                >
                  -
                </button>
                <span style={{ fontWeight: 800, fontSize: 16, minWidth: 20, textAlign: "center" }}>
                  {customQty}
                </span>
                <button
                  style={styles.qtyBtn}
                  onClick={() => setCustomQty(customQty + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <button style={styles.primaryButton} onClick={handleAddToCart}>
              ใส่ตะกร้า • ฿{customizingDish.price * customQty}
            </button>
          </div>
        </div>
      )}

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsCartOpen(false)}>
          <div style={styles.cartDrawerContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>🛒</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                  ตะกร้าสั่งอาหาร ({cartTotalCount} รายการ)
                </h3>
              </div>
              <button style={styles.modalCloseBtn} onClick={() => setIsCartOpen(false)}>
                ✕
              </button>
            </div>

            {/* Table / Queue Assignment */}
            <div style={styles.tableAssignCard}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B", marginBottom: 4 }}>
                {currentTicket ? "📍 ออเดอร์นี้ผูกกับคิวของคุณ" : "📍 มากี่ท่าน? (ออกบัตรคิวให้พร้อมออเดอร์)"}
              </div>
              {currentTicket ? (
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                  คิว <strong>{currentTicket.ticket.number}</strong> ({currentTicket.service?.name})
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {services.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      style={{
                        ...styles.categoryPill,
                        ...(selectedServiceId === svc.id ? styles.categoryPillActive : {}),
                      }}
                      onClick={() => setSelectedServiceId(svc.id)}
                    >
                      {svc.name.replace(/\s*\(.*\)/, "")}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B" }}>
                ตะกร้าว่างเปล่า ลองเลือกจานอร่อยดูนะคะ
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {cart.map((item) => (
                  <div key={item.id} style={styles.cartItemRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{item.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>
                          {[item.spiciness, item.sauce, item.sweetness]
                            .map((v) => (v ? OPTION_LABELS[v] : undefined))
                            .filter(Boolean)
                            .join(" • ")}
                          {item.note && <div style={{ color: "#E11D48" }}>Note: {item.note}</div>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button style={styles.cartQtyBtn} onClick={() => updateCartQty(item.id, -1)}>
                          -
                        </button>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{item.quantity}</span>
                        <button style={styles.cartQtyBtn} onClick={() => updateCartQty(item.id, 1)}>
                          +
                        </button>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#0F172A", minWidth: 50, textAlign: "right" }}>
                        ฿{item.price * item.quantity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total & Checkout */}
            <div style={styles.cartSummaryFooter}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <span style={{ fontSize: 14, color: "#64748B" }}>ยอดรวมทั้งหมด:</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: "#E11D48" }}>
                  ฿{cartTotalAmount}
                </span>
              </div>

              <button
                style={{
                  ...styles.primaryButton,
                  opacity: cart.length === 0 || isOrdering ? 0.6 : 1,
                }}
                disabled={cart.length === 0 || isOrdering}
                onClick={handlePlaceOrder}
              >
                {isOrdering
                  ? "กำลังส่งออเดอร์..."
                  : currentTicket
                    ? `✅ ยืนยันสั่งล่วงหน้า • ฿${cartTotalAmount}`
                    : `✅ ยืนยันสั่ง + รับบัตรคิว • ฿${cartTotalAmount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Frosted Glass Bottom Navigation */}
      <nav style={styles.floatingBottomNav}>
        <button
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "order" ? styles.navPillBtnActive : {}),
            position: "relative",
          }}
          onClick={() => setActiveTab("order")}
        >
          <span style={{ fontSize: 18 }}>🍽️</span>
          <span style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>สั่งอาหาร</span>
          {cartTotalCount > 0 && <span style={styles.navBadgeDot}>{cartTotalCount}</span>}
        </button>

        <button
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "book" ? styles.navPillBtnActive : {}),
          }}
          onClick={() => setActiveTab("book")}
        >
          <span style={{ fontSize: 18 }}>📋</span>
          <span style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>จองโต๊ะ</span>
        </button>

        <button
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "ticket" ? styles.navPillBtnActive : {}),
            position: "relative",
          }}
          onClick={() => setActiveTab("ticket")}
        >
          <span style={{ fontSize: 18 }}>🎫</span>
          <span style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>คิว & ออเดอร์</span>
          {currentTicket && currentTicket.ticket.state === "WAITING" && (
            <span style={styles.ticketBadgeDot}></span>
          )}
        </button>

        <button
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "chat" ? styles.navPillBtnActive : {}),
          }}
          onClick={() => setActiveTab("chat")}
        >
          <span style={{ fontSize: 18 }}>💬</span>
          <span style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>ถาม AI</span>
        </button>

        <button
          style={{
            ...styles.navPillBtn,
            ...(activeTab === "profile" ? styles.navPillBtnActive : {}),
          }}
          onClick={() => setActiveTab("profile")}
        >
          <span style={{ fontSize: 18 }}>👤</span>
          <span style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>โปรไฟล์</span>
        </button>
      </nav>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#F8FAFC",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Prompt', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    paddingBottom: 90,
    position: "relative",
  },
  header: {
    background: "linear-gradient(135deg, #881337 0%, #E11D48 100%)",
    color: "#FFFFFF",
    padding: "16px 18px 12px 18px",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    boxShadow: "0 10px 25px rgba(225, 29, 72, 0.25)",
  },
  brandIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontWeight: 900,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    backgroundColor: "#FEF08A",
    color: "#854D0E",
    fontSize: 10,
    fontWeight: 800,
    borderRadius: "50%",
    width: 14,
    height: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.9)",
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    boxShadow: "0 0 8px #22C55E",
  },
  cartQuickHeaderBtn: {
    position: "relative",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 12,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 16,
  },
  cartHeaderBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FEF08A",
    color: "#881337",
    fontWeight: 800,
    fontSize: 10,
    borderRadius: 10,
    padding: "1px 6px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
  liveCallingTickerBar: {
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    backdropFilter: "blur(8px)",
    marginTop: 10,
    borderRadius: 12,
    padding: "6px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#22C55E",
    animation: "pulse 1.5s infinite",
  },
  callingNumberHighlight: {
    fontSize: 13,
    fontWeight: 900,
    color: "#FEF08A",
  },
  callingCounterLabel: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.8)",
  },
  content: {
    padding: "14px 14px",
    maxWidth: 480,
    margin: "0 auto",
  },
  // Menu Hero
  menuHeroCard: {
    background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)",
    color: "#FFFFFF",
    padding: "18px 20px",
    borderRadius: 20,
    boxShadow: "0 6px 20px rgba(49, 46, 129, 0.2)",
  },
  heroSubTag: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    color: "#F43F5E",
  },
  heroTitle: {
    margin: "4px 0",
    fontSize: 18,
    fontWeight: 800,
  },
  heroDesc: {
    margin: 0,
    fontSize: 12,
    color: "#CBD5E1",
    lineHeight: 1.4,
  },
  heroDecoBadge: {
    fontSize: 28,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 8,
  },
  // JEV Cloud AI Smart Recommender Card
  jevAiCard: {
    background: "linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%)",
    border: "1.5px solid #FDA4AF",
    borderRadius: 18,
    padding: "14px 16px",
    boxShadow: "0 8px 25px rgba(225, 29, 72, 0.12)",
  },
  aiGlowDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#E11D48",
    boxShadow: "0 0 10px #E11D48",
  },
  jevAiTitle: {
    fontSize: 11,
    fontWeight: 900,
    color: "#9F1239",
    letterSpacing: 0.8,
  },
  jevConfidenceBadge: {
    fontSize: 10,
    fontWeight: 800,
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    padding: "2px 6px",
    borderRadius: 8,
  },
  jevPunchline: {
    fontSize: 13,
    fontWeight: 800,
    color: "#881337",
    marginTop: 4,
    lineHeight: 1.4,
  },
  jevDishRow: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: "10px 12px",
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },
  jevDishEmoji: {
    fontSize: 26,
  },
  jevQuickAddBtn: {
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 4px 12px rgba(225, 29, 72, 0.25)",
  },
  // Category Scroller
  categoryScroller: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    scrollbarWidth: "none",
  },
  categoryPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 18,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
  },
  categoryPillActive: {
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    borderColor: "#E11D48",
    boxShadow: "0 4px 12px rgba(225, 29, 72, 0.25)",
  },
  // Dish Grid
  dishGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  dishCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    border: "1px solid #F1F5F9",
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
  },
  dishCardHeader: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  dishEmojiWrap: {
    fontSize: 32,
    backgroundColor: "#FFF1F2",
    borderRadius: 14,
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dishName: {
    fontWeight: 800,
    fontSize: 15,
    color: "#0F172A",
  },
  signatureBadge: {
    backgroundColor: "#FEF08A",
    color: "#854D0E",
    fontWeight: 800,
    fontSize: 9,
    padding: "2px 6px",
    borderRadius: 6,
  },
  bestsellerBadge: {
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
    fontWeight: 800,
    fontSize: 9,
    padding: "2px 6px",
    borderRadius: 6,
  },
  dishCategoryTag: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  dishDescription: {
    fontSize: 12,
    color: "#64748B",
    margin: "8px 0 10px 0",
    lineHeight: 1.4,
  },
  dishCardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTop: "1px solid #F8FAFC",
  },
  dishPrice: {
    fontSize: 18,
    fontWeight: 900,
    color: "#E11D48",
  },
  orderDishBtn: {
    backgroundColor: "#FFF1F2",
    color: "#E11D48",
    border: "1px solid #FDA4AF",
    borderRadius: 10,
    padding: "7px 14px",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
  },
  // Floating Cart Bar
  floatingCartBar: {
    position: "fixed",
    bottom: 84,
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 28px)",
    maxWidth: 440,
    background: "linear-gradient(135deg, #BE123C 0%, #E11D48 100%)",
    borderRadius: 20,
    padding: "12px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 10px 25px rgba(190, 18, 60, 0.4)",
    zIndex: 25,
    cursor: "pointer",
  },
  viewCartBtn: {
    backgroundColor: "#FFFFFF",
    color: "#BE123C",
    border: "none",
    borderRadius: 10,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 800,
  },
  // Modal Styles
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 50,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    width: "100%",
    maxWidth: 480,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: "20px 20px 30px 20px",
    maxHeight: "85vh",
    overflowY: "auto",
  },
  modalCloseBtn: {
    background: "none",
    border: "none",
    fontSize: 16,
    color: "#94A3B8",
    cursor: "pointer",
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
  },
  spicyOptionBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 10px",
    borderRadius: 10,
    border: "1px solid #E2E8F0",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
  },
  spicyOptionActive: {
    borderColor: "#E11D48",
    backgroundColor: "#FFF1F2",
    color: "#991B1B",
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    border: "1px solid #CBD5E1",
    backgroundColor: "#F8FAFC",
    fontWeight: 800,
    fontSize: 16,
    cursor: "pointer",
  },
  primaryButton: {
    width: "100%",
    background: "linear-gradient(135deg, #E11D48 0%, #BE123C 100%)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 14,
    padding: "12px 0",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(225, 29, 72, 0.3)",
  },
  // Cart Drawer
  cartDrawerContent: {
    backgroundColor: "#FFFFFF",
    width: "100%",
    maxWidth: 480,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: "20px 20px 30px 20px",
    maxHeight: "85vh",
    overflowY: "auto",
  },
  tableAssignCard: {
    backgroundColor: "#FFF1F2",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  cartItemRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #F1F5F9",
  },
  cartQtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    border: "1px solid #CBD5E1",
    backgroundColor: "#FFFFFF",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 700,
  },
  cartSummaryFooter: {
    marginTop: 16,
    paddingTop: 12,
    borderTop: "2px solid #F1F5F9",
  },
  // Book Tab styles
  heroCard: {
    background: "linear-gradient(135deg, #881337 0%, #E11D48 100%)",
    color: "#FFFFFF",
    padding: "18px 20px",
    borderRadius: 20,
    boxShadow: "0 8px 25px rgba(225, 29, 72, 0.2)",
  },
  heroStatsGrid: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid rgba(255, 255, 255, 0.15)",
  },
  heroStatItem: {
    textAlign: "center",
    flex: 1,
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: 900,
    color: "#FEF08A",
  },
  heroStatLabel: {
    fontSize: 10,
    color: "#FECDD3",
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  liveMonitorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: "12px 16px",
    border: "1.5px solid #FEE2E2",
    boxShadow: "0 4px 15px rgba(225, 29, 72, 0.06)",
  },
  speakerIconWrap: {
    fontSize: 22,
    backgroundColor: "#FFF1F2",
    borderRadius: 12,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  counterBadgePill: {
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: "#FFF1F2",
    color: "#991B1B",
    padding: "2px 8px",
    borderRadius: 8,
  },
  waitingCountPill: {
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
  },
  activeNoticeCard: {
    backgroundColor: "#F0FDF4",
    border: "1px solid #86EFAC",
    borderRadius: 16,
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
  },
  activeNoticeIcon: {
    fontSize: 24,
  },
  activeNoticeArrow: {
    fontSize: 12,
    fontWeight: 700,
    color: "#047857",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
    border: "1px solid #F1F5F9",
  },
  cardSectionTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    color: "#0F172A",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  titleIcon: {
    fontSize: 16,
  },
  serviceItem: {
    border: "1.5px solid #F1F5F9",
    borderRadius: 14,
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  serviceItemActive: {
    borderColor: "#E11D48",
    backgroundColor: "#FFF1F2",
  },
  servicePrefixBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    color: "#475569",
    fontWeight: 900,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  servicePrefixActive: {
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
  },
  radioChecked: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "2px solid #E11D48",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radioUnchecked: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "2px solid #CBD5E1",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    backgroundColor: "#E11D48",
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#475569",
    marginBottom: 4,
    display: "block",
  },
  textInput: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #CBD5E1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    outline: "none",
  },
  disabledInput: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #E2E8F0",
    backgroundColor: "#F8FAFC",
    color: "#64748B",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
  },
  consentRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  // Ticket Tab Styles
  ticketBoardingPass: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    border: "1px solid #F1F5F9",
    overflow: "hidden",
  },
  ticketHeader: {
    background: "linear-gradient(135deg, #881337 0%, #BE123C 100%)",
    color: "#FFFFFF",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ticketBrandTag: {
    fontSize: 10,
    letterSpacing: 1,
    color: "#FECDD3",
    fontWeight: 800,
  },
  ticketBranchName: {
    margin: "2px 0 0 0",
    fontSize: 16,
    fontWeight: 900,
  },
  ticketStateBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: 800,
    padding: "4px 10px",
    borderRadius: 12,
  },
  ticketBody: {
    padding: 20,
  },
  ticketBigNumber: {
    fontSize: 52,
    fontWeight: 900,
    color: "#E11D48",
    letterSpacing: 2,
    lineHeight: 1.1,
    margin: "6px 0",
  },
  ticketDashDivider: {
    borderTop: "2px dashed #E2E8F0",
    margin: "16px 0",
  },
  ticketStatsRow: {
    display: "flex",
    justifyContent: "space-around",
  },
  ticketStatValue: {
    fontSize: 20,
    fontWeight: 900,
    color: "#0F172A",
  },
  ticketStatLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  refreshBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    color: "#334155",
    border: "none",
    borderRadius: 10,
    padding: "10px 0",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  cancelTicketBtn: {
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
    border: "none",
    borderRadius: 10,
    padding: "10px 16px",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  noTicketCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    textAlign: "center",
    border: "1px dashed #CBD5E1",
  },
  miniActionBtn: {
    backgroundColor: "#F1F5F9",
    color: "#334155",
    border: "none",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  miniActionBtnActive: {
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  loadingTicketCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 40,
    textAlign: "center",
  },
  // Orders in Kitchen
  orderHistoryCard: {
    backgroundColor: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 14,
    padding: 12,
  },
  tableTagPill: {
    backgroundColor: "#E2E8F0",
    color: "#334155",
    fontSize: 11,
    padding: "2px 6px",
    borderRadius: 6,
  },
  cookingBadge: {
    backgroundColor: "#FEF08A",
    color: "#854D0E",
    fontSize: 11,
    fontWeight: 800,
    padding: "3px 8px",
    borderRadius: 8,
  },
  orderFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 6,
    borderTop: "1px solid #E2E8F0",
  },
  // Chat styles
  chatSection: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  chatBotHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: "10px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },
  chatBotAvatar: {
    fontSize: 24,
  },
  aiBadge: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: 800,
    padding: "2px 8px",
    borderRadius: 8,
  },
  quickChipsContainer: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    paddingBottom: 2,
    scrollbarWidth: "none",
  },
  quickChip: {
    backgroundColor: "#FFFFFF",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: "6px 10px",
    fontSize: 11,
    color: "#334155",
    whiteSpace: "nowrap",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.02)",
  },
  chatMessageList: {
    backgroundColor: "#F1F5F9",
    borderRadius: 18,
    padding: 14,
    height: 380,
    overflowY: "auto",
  },
  msgAvatar: {
    fontSize: 20,
  },
  userBubble: {
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    borderRadius: "16px 16px 4px 16px",
    padding: "10px 14px",
    fontSize: 13,
    boxShadow: "0 2px 6px rgba(225, 29, 72, 0.2)",
  },
  aiBubble: {
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 14px",
    fontSize: 13,
    border: "1px solid #E2E8F0",
    boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
  },
  typingBubble: {
    backgroundColor: "#FFFFFF",
    borderRadius: "16px 16px 16px 4px",
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "#E11D48",
  },
  chatInputRow: {
    display: "flex",
    gap: 8,
    backgroundColor: "#FFFFFF",
    padding: "8px 12px",
    borderRadius: 16,
    border: "1.5px solid #E2E8F0",
  },
  chatInput: {
    flex: 1,
    border: "none",
    background: "none",
    outline: "none",
    fontSize: 13,
  },
  chatSendBtn: {
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "6px 14px",
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
  },
  // Profile
  membershipCard: {
    background: "linear-gradient(135deg, #4C0519 0%, #881337 100%)",
    borderRadius: 20,
    color: "#FFFFFF",
    padding: 20,
    boxShadow: "0 10px 25px rgba(136, 19, 55, 0.3)",
  },
  cardBrandBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    color: "#FCA5A5",
  },
  cardMemberTier: {
    fontSize: 16,
    fontWeight: 900,
    marginTop: 2,
  },
  chipIcon: {
    fontSize: 24,
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    border: "2px solid #FFFFFF",
  },
  memberName: {
    fontSize: 16,
    fontWeight: 800,
  },
  memberUid: {
    fontSize: 10,
    color: "#FECDD3",
  },
  memberStatusBadge: {
    fontSize: 10,
    color: "#86EFAC",
    marginTop: 2,
  },
  memberCardFooter: {
    display: "flex",
    justifyContent: "space-between",
    borderTop: "1px solid rgba(255, 255, 255, 0.15)",
    paddingTop: 12,
  },
  // Floating Nav
  floatingBottomNav: {
    position: "fixed",
    bottom: 14,
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 28px)",
    maxWidth: 440,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    backdropFilter: "blur(20px)",
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
  },
  navPillBtnActive: {
    backgroundColor: "#FFF1F2",
    color: "#E11D48",
    boxShadow: "0 2px 6px rgba(225, 29, 72, 0.15)",
  },
  navBadgeDot: {
    position: "absolute",
    top: 4,
    right: "20%",
    backgroundColor: "#E11D48",
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: 800,
    borderRadius: "50%",
    width: 16,
    height: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ticketBadgeDot: {
    position: "absolute",
    top: 6,
    right: "24%",
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#EF4444",
  },
  callAlertBanner: {
    backgroundColor: "#EF4444",
    color: "#FFFFFF",
    padding: "12px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeAlertBtn: {
    backgroundColor: "#FFFFFF",
    color: "#EF4444",
    border: "none",
    borderRadius: 8,
    padding: "4px 10px",
    fontWeight: 700,
    fontSize: 11,
    cursor: "pointer",
  },
  orderSuccessBanner: {
    backgroundColor: "#10B981",
    color: "#FFFFFF",
    padding: "10px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    fontWeight: 700,
  },
  closeBannerBtn: {
    background: "none",
    border: "none",
    color: "#FFFFFF",
    fontSize: 14,
    cursor: "pointer",
  },
  centerContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
    fontFamily: "'Prompt', sans-serif",
  },
  errorBox: {
    backgroundColor: "#1E293B",
    color: "#F8FAFC",
    padding: 24,
    borderRadius: 20,
    maxWidth: 360,
    textAlign: "center",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #E2E8F0",
    borderTop: "3px solid #E11D48",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto",
  },
};
