import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MongoClient, type Db } from "mongodb";

/**
 * เชื่อม MongoDB กลางของแอป — ใช้เมื่อ DB_MODE=mongo (ค่าเริ่มต้น)
 * ค่าเริ่มต้นชี้ไป container บนเครื่อง (ไม่มี auth)
 * ทุกคนเรียกผ่าน db() ซึ่ง await การเชื่อมต่อให้เสร็จก่อนเสมอ (กันลำดับ init เพี้ยน)
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client: MongoClient | null = null;
  private dbInstance: Db | null = null;
  private readyPromise: Promise<void> | null = null;

  get enabled(): boolean {
    return process.env.DB_MODE !== "memory" && process.env.DB_MODE !== "prisma";
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log(`DB_MODE=${process.env.DB_MODE} — ไม่ใช้ MongoDB`);
      return;
    }
    this.readyPromise = this.connect();
  }

  private async connect(): Promise<void> {
    const url = process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27018/bccrm";
    this.client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      // container Mongo โฆษณา hostname ภายในของมันเอง ("mongodb") ซึ่ง host เรา resolve ไม่ได้
      // directConnection บังคับคุยกับ URL ที่ให้ตรง ๆ (เหมาะกับ standalone container)
      directConnection: true,
    });
    await this.client.connect();
    // ชื่อ database อยู่ใน URL path (เช่น /bccrm) — ถ้าไม่มีใช้ bccrm
    const dbName = new URL(url).pathname.replace("/", "") || "bccrm";
    this.dbInstance = this.client.db(dbName);
    this.logger.log(`เชื่อม MongoDB สำเร็จ: ${url}`);
  }

  async onModuleDestroy() {
    await this.client?.close();
  }

  /** คืน Db หลังเชื่อมต่อเสร็จแน่ ๆ — เรียกจากที่ไหนก็ปลอดภัย */
  async db(): Promise<Db> {
    if (!this.enabled) throw new Error("MongoDB ไม่ได้เปิดใช้ (DB_MODE ไม่ใช่ mongo)");
    await this.readyPromise;
    if (!this.dbInstance) throw new Error("เชื่อม MongoDB ไม่สำเร็จ");
    return this.dbInstance;
  }
}
