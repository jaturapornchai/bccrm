import { BadRequestException, ConflictException } from "@nestjs/common";
import { QueuesService } from "./queues.service";
import { MemoryQueueStore } from "./store/memory-queue-store";

// พนักงานหลายเครื่องกดพร้อมกัน — ต้องเรียกคิวละครั้งเดียว (ไม่ส่ง LINE push ซ้ำ)
describe("QueuesService multi-device", () => {
  const make = () => {
    const alerts: string[] = [];
    const calls: string[] = [];
    const store = new MemoryQueueStore();
    const svc = new QueuesService(
      store,
      { emitQueueUpdate: () => undefined, emitCall: (_b: string, p: { number: string }) => void calls.push(p.number) } as never,
      { sendCalledAlert: async (_u: string, n: string) => void alerts.push(n) } as never,
    );
    return { svc, store, alerts, calls };
  };

  it("same ticket called from two devices → one wins, other gets 409", async () => {
    const { svc } = make();
    const [first] = await svc.waitingList("demo");
    const results = await Promise.allSettled([svc.changeState(first.id, "called"), svc.changeState(first.id, "called")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
  });

  it("call-next from two devices → two different tickets", async () => {
    const { svc } = make();
    const [a, b] = await Promise.all([svc.callNext("demo", "c1", "s1"), svc.callNext("demo", "c2", "s2")]);
    expect(a.id).not.toBe(b.id);
    expect([a.state, b.state]).toEqual(["CALLED", "CALLED"]);
  });

  it("recall: blocked within cooldown, re-announces after, only for CALLED", async () => {
    const { svc, store, calls } = make();
    const [first, second] = await svc.waitingList("demo");
    await svc.changeState(first.id, "called");
    await expect(svc.recall(first.id)).rejects.toBeInstanceOf(ConflictException);
    await store.updateTicket(first.id, { calledAt: new Date(Date.now() - 60_000) });
    const recalled = await svc.recall(first.id);
    expect(recalled.state).toBe("CALLED");
    expect(calls).toEqual([first.number, first.number]);
    await expect(svc.recall(second.id)).rejects.toBeInstanceOf(BadRequestException);
  });
});
