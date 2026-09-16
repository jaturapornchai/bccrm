import { useEffect, useState } from "react";
import { initLiff, type LiffProfile } from "./lib/liff";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * หน้าจองคิว (LIFF) — ลูกค้าเปิดจาก Rich Menu ใน LINE
 * TODO(phase-1): เลือกสาขา/บริการ/ช่วงเวลา, PDPA consent, สร้าง Booking
 */
export default function App() {
  const [profile, setProfile] = useState<LiffProfile>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initLiff()
      .then(setProfile)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <main style={{ padding: 24 }}>เปิด LIFF ไม่สำเร็จ: {error}</main>;
  }

  if (!profile) {
    return <main style={{ padding: 24 }}>กำลังโหลด…</main>;
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "system-ui, 'Sarabun', sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>จองคิว</h1>
      <p>สวัสดีคุณ {profile.displayName}</p>
      {profile.devMode && (
        <p style={{ color: "#B45309", fontSize: 13 }}>
          โหมดพัฒนา (ไม่ได้เปิดใน LINE) — กำหนด VITE_LIFF_ID เพื่อทดสอบจริง
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>เลือกบริการ</h2>
        <p style={{ color: "#888", fontSize: 14 }}>
          รายการบริการจะดึงจาก {API}/api/queues/... — ยังเป็น skeleton
        </p>
      </section>

      <button
        style={{
          marginTop: 24,
          width: "100%",
          padding: 14,
          borderRadius: 12,
          border: "none",
          backgroundColor: "#06C755",
          color: "#fff",
          fontSize: 16,
          fontWeight: 700,
        }}
        disabled
      >
        ยืนยันจองคิว (เร็ว ๆ นี้)
      </button>
    </main>
  );
}
