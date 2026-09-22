import { ConflictException } from "@nestjs/common";
import { QueuesService } from "./queues.service";
import { MemoryQueueStore } from "./store/memory-queue-store";

// พนักงานหลายเครื่องกดพร้อมกัน — ต้องเรียกคิวละครั้งเดียว (ไม่ส่ง LINE push ซ้ำ)
describe("QueuesService multi-device", () => {
  const make = () => {
    const alerts: string[] = [];
    const svc = new QueuesService(
      new MemoryQueueStore(),
      { emitQueueUpdate: () => undefined, emitCall: () => undefined } as never,
      { sendCalledAlert: async (_u: string, n: string) => void alerts.push(n) } as never,
    );
    return { svc, alerts };
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
});
