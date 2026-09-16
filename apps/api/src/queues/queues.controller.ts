import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { QueuesService } from "./queues.service";
import { CallNextDto, CreateTicketDto, ListQueueQuery } from "./dto/queue.dto";

// TODO(phase-2): ใส่ AuthGuard + RBAC ทุก endpoint (ยกเว้น LIFF ที่ใช้ LINE token)
@Controller("queues")
export class QueuesController {
  constructor(private readonly queues: QueuesService) {}

  /** ออกคิวใหม่ (kiosk / staff / LIFF booking) */
  @Post("tickets")
  create(@Body() dto: CreateTicketDto) {
    return this.queues.createTicket(dto);
  }

  /** รายการคิวที่รออยู่ (เรียงตามนโยบาย) */
  @Get("waiting")
  waiting(@Query() query: ListQueueQuery) {
    return this.queues.waitingList(query.branchId);
  }

  /** เรียกคิวถัดไป */
  @Post("call-next")
  callNext(@Body() dto: CallNextDto) {
    return this.queues.callNext(dto.branchId, dto.counterId, dto.staffId);
  }

  /** เปลี่ยนสถานะคิว: serving / done / no_show / cancelled */
  @Patch("tickets/:id/state/:state")
  changeState(@Param("id") id: string, @Param("state") state: string) {
    return this.queues.changeState(id, state as never);
  }

  /** รายการบริการของสาขา */
  @Get("services")
  services(@Query("branchId") branchId: string) {
    return this.queues.listServices(branchId || "demo");
  }

  /** ดึงข้อมูลตั๋วคิวรายบุคคลพร้อมเวลารอและจำนวนคิวข้างหน้า */
  @Get("tickets/:id")
  ticketDetails(@Param("id") id: string) {
    return this.queues.getTicketDetails(id);
  }

  /** ค้นหาตั๋วคิวที่ยัง active อยู่ของลูกค้า */
  @Get("customer/active")
  customerActive(
    @Query("branchId") branchId: string,
    @Query("customerId") customerId: string,
  ) {
    return this.queues.getActiveCustomerTicket(branchId || "demo", customerId);
  }

  /** ยกเลิกตั๋วคิว */
  @Post("tickets/:id/cancel")
  cancelTicket(@Param("id") id: string) {
    return this.queues.cancelTicket(id);
  }

  /** สถิติวันนี้ */
  @Get("stats/today")
  stats(@Query("branchId") branchId: string) {
    return this.queues.todayStats(branchId);
  }

  /** คิวที่กำลังเรียก/รับบริการอยู่ในขณะนี้ */
  @Get("current-calling")
  currentCalling(@Query("branchId") branchId: string) {
    return this.queues.getCurrentCalling(branchId || "demo");
  }
}
