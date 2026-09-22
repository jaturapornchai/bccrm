import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateOrderDto } from "./dto/menu.dto";
import { MenuService, pickDiverse, type MenuItem } from "./menu.service";

// ponytail: fake Mongo แค่ method ที่ MenuService ใช้จริง
function fakeMongo() {
  const cols: Record<string, any[]> = {};
  const col = (name: string) => {
    const rows = (cols[name] ??= []);
    return {
      createIndex: async () => "ok",
      deleteMany: async () => rows.splice(0),
      insertMany: async (docs: any[]) => rows.push(...docs.map((d) => ({ ...d }))),
      insertOne: async (doc: any) => rows.push(doc),
      find: () => ({ toArray: async () => [...rows] }),
      findOneAndUpdate: async (q: any, u: any) => {
        let doc = rows.find((r) => r._id === q._id);
        if (!doc) rows.push((doc = { _id: q._id, seq: 0 }));
        doc.seq += u.$inc.seq;
        return doc;
      },
    };
  };
  return { db: async () => ({ collection: col }) } as any;
}

const item = (itemId: string, quantity: number, price = 1) => ({ itemId, name: "x", price, quantity });

describe("createOrder", () => {
  const svc = new MenuService(fakeMongo());

  it("ใช้ราคาจากเมนู server ไม่ใช่ราคาที่ client ส่งมา", async () => {
    const order = await svc.createOrder({ items: [item("dish-chick-spicy", 2, 1)] } as CreateOrderDto);
    expect(order.totalAmount).toBe(258);
    expect(order.items[0].name).not.toBe("x");
  });

  it("ปฏิเสธเมนูที่ไม่มีในระบบ", async () => {
    await expect(svc.createOrder({ items: [item("free-food", 1, -500)] } as CreateOrderDto)).rejects.toThrow();
  });

  it("เลขออเดอร์เรียงต่อกัน ไม่ซ้ำ และไม่ชนเลข 4 หลักเดิม", async () => {
    const a = await svc.createOrder({ items: [item("dish-gimmari", 1)] } as CreateOrderDto);
    const b = await svc.createOrder({ items: [item("dish-gimmari", 1)] } as CreateOrderDto);
    expect(a.orderNumber).toMatch(/^SM-1\d{4}$/);
    expect(a.orderNumber).not.toBe(b.orderNumber);
  });
});

describe("CreateOrderDto", () => {
  const errors = async (items: unknown[]) => validate(plainToInstance(CreateOrderDto, { items }));

  it.each([[-3], [0], [0.5], [100]])("ปฏิเสธ quantity %p", async (q) => {
    expect((await errors([item("dish-chick-spicy", q)])).length).toBeGreaterThan(0);
  });
  it("ปฏิเสธออเดอร์ว่าง", async () => expect((await errors([])).length).toBeGreaterThan(0));
  it("รับออเดอร์ปกติ", async () => expect(await errors([item("dish-chick-spicy", 2)])).toHaveLength(0));
});

describe("pickDiverse", () => {
  const d = (id: string, category: MenuItem["category"]) => ({ dish: { id, category } as MenuItem });

  it("เลือกไม่ซ้ำหมวดก่อน แล้วค่อยเติม", () => {
    const ranked = [d("b1", "bingsu"), d("b2", "bingsu"), d("dr", "drink"), d("s", "snack")];
    expect(pickDiverse(ranked, 3).map((r) => r.dish.id)).toEqual(["b1", "dr", "s"]);
    expect(pickDiverse([d("b1", "bingsu"), d("b2", "bingsu")], 3).map((r) => r.dish.id)).toEqual(["b1", "b2"]);
  });
});
