import React from "react";

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  booked: { label: "จองไว้", color: "#3B82F6" },
  checked_in: { label: "เช็กอินแล้ว", color: "#06C755" },
  waiting: { label: "รอเรียก", color: "#F59E0B" },
  called: { label: "กำลังเรียก", color: "#E02020" },
  serving: { label: "กำลังบริการ", color: "#8B5CF6" },
  done: { label: "เสร็จสิ้น", color: "#6B7280" },
  no_show: { label: "ไม่มาตามนัด", color: "#9CA3AF" },
  cancelled: { label: "ยกเลิก", color: "#9CA3AF" },
  transferred: { label: "ย้ายคิว", color: "#0EA5E9" },
};

export function QueueStatusBadge({ state }: { state: string }) {
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
