/**
 * QueueStore — ชั้นเก็บข้อมูลคิว แยกจากตรรกะคิว
 * มี 2  implementation:
 *  - PrismaQueueStore  → ใช้ PostgreSQL จริง (production / self-host)
 *  - MemoryQueueStore  → เก็บใน RAM พร้อมข้อมูลตัวอย่าง (dev/demo ไม่ต้องมี DB)
 * เลือกด้วย env DB_MODE=prisma (ค่าเริ่มต้น) หรือ DB_MODE=memory
 */

export const QUEUE_STORE = Symbol("QUEUE_STORE");

export interface ServiceRecord {
  id: string;
  branchId: string;
  name: string;
  ticketPrefix: string;
  avgServiceMinutes: number;
  isActive: boolean;
}

export interface TicketRecord {
  id: string;
  branchId: string;
  serviceId: string;
  counterId: string | null;
  customerId: string | null;
  servedById: string | null;
  number: string;
  queueDate: Date;
  sequence: number;
  source: string;
  state: string;
  isVip: boolean;
  createdAt: Date;
  checkedInAt: Date | null;
  calledAt: Date | null;
  servedAt: Date | null;
  doneAt: Date | null;
  cancelledAt: Date | null;
}

export interface CreateTicketData {
  branchId: string;
  serviceId: string;
  counterId?: string;
  customerId?: string;
  number: string;
  queueDate: Date;
  sequence: number;
  source: string;
  state: string;
  isVip: boolean;
}

export interface QueueStore {
  getService(serviceId: string): Promise<ServiceRecord | null>;
  listServices(branchId: string): Promise<ServiceRecord[]>;
  /** เลขรันถัดไปของบริการในวันนั้น — ต้อง atomic (memory: ล็อกใน process, prisma: upsert increment) */
  nextSequence(branchId: string, serviceId: string, queueDate: Date): Promise<number>;
  createTicket(data: CreateTicketData): Promise<TicketRecord>;
  findWaiting(branchId: string, queueDate: Date): Promise<TicketRecord[]>;
  findCurrentCalling(branchId: string, queueDate: Date): Promise<TicketRecord[]>;
  findTicket(id: string): Promise<TicketRecord | null>;
  findActiveCustomerTicket(branchId: string, customerId: string, queueDate: Date): Promise<TicketRecord | null>;
  /** expectedState = compare-and-set: คืน null ถ้าสถานะถูกเปลี่ยนไปก่อนแล้ว (พนักงานหลายเครื่องกดพร้อมกัน) */
  updateTicket(id: string, data: Partial<TicketRecord>, expectedState?: string): Promise<TicketRecord | null>;
  statsByState(branchId: string, queueDate: Date): Promise<Record<string, number>>;
}
