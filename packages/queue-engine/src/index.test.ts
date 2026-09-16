import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TicketState,
  canTransition,
  formatTicketNumber,
  sortWaitingQueue,
  TicketSource,
} from "./index.ts";

describe("state machine", () => {
  it("อนุญาต flow ปกติ: waiting → called → serving → done", () => {
    assert.ok(canTransition(TicketState.Waiting, TicketState.Called));
    assert.ok(canTransition(TicketState.Called, TicketState.Serving));
    assert.ok(canTransition(TicketState.Serving, TicketState.Done));
  });

  it("ห้ามกระโดดข้ามสถานะ", () => {
    assert.equal(canTransition(TicketState.Waiting, TicketState.Done), false);
    assert.equal(canTransition(TicketState.Done, TicketState.Waiting), false);
  });

  it("no-show กลับมารอใหม่ได้", () => {
    assert.ok(canTransition(TicketState.NoShow, TicketState.Waiting));
  });
});

describe("formatTicketNumber", () => {
  it("ออกเลขรูปแบบ A042", () => {
    assert.equal(formatTicketNumber("A", 42), "A042");
  });

  it("ปฏิเสธ prefix/เลขผิดรูปแบบ", () => {
    assert.throws(() => formatTicketNumber("abc", 1));
    assert.throws(() => formatTicketNumber("A", 0));
  });
});

describe("sortWaitingQueue", () => {
  it("VIP มาก่อน และคิวที่รอนานถูกดันขึ้น", () => {
    const now = new Date("2026-09-16T10:00:00Z");
    const walkIn = {
      ticketId: "1",
      ticketNumber: "A001",
      source: TicketSource.WalkInKiosk,
      isVip: false,
      waitingSince: new Date("2026-09-16T09:00:00Z"), // รอ 60 นาที
    };
    const vip = {
      ticketId: "2",
      ticketNumber: "V001",
      source: TicketSource.WalkInKiosk,
      isVip: true,
      waitingSince: new Date("2026-09-16T09:59:00Z"), // เพิ่งมา
    };
    const sorted = sortWaitingQueue([walkIn, vip], undefined, now);
    assert.equal(sorted[0].ticketNumber, "V001");
  });
});
