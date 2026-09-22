import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { MenuService } from "./menu.service";
import { CreateOrderDto, RecommendNextDto } from "./dto/menu.dto";

@Controller("menu")
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  /** ดึงรายการอาหารและเครื่องดื่มของร้านโซมายด์ (Seoulmind) ทั้งหมดหรือตามหมวดหมู่ */
  @Get("items")
  list(@Query("category") category?: string) {
    return this.menu.listMenu(category);
  }

  /** ดึงรายละเอียดอาหารรายเมนู */
  @Get("items/:id")
  getItem(@Param("id") id: string) {
    return this.menu.getMenuItem(id);
  }

  /**
   * JEV AI Next-Action Recommender:
   * ให้ JEV Cloud วิเคราะห์ตะกร้าอาหาร แล้วตัดสินใจเลือกเมนูต่อเนื่องที่จับคู่ดีที่สุด
   */
  @Post("recommend-next")
  recommendNext(@Body() dto: RecommendNextDto) {
    return this.menu.recommendNextWithJev(dto);
  }

  /** สั่งอาหารจาก LINE LIFF เข้าสู่ระบบร้านโซมายด์ (Seoulmind) */
  @Post("orders")
  createOrder(@Body() dto: CreateOrderDto) {
    return this.menu.createOrder(dto);
  }

  /** ออเดอร์ล่วงหน้าวันนี้ของสาขา (หน้าจอพนักงาน) */
  @Get("orders/today")
  todayOrders(@Query("branchId") branchId?: string) {
    return this.menu.getTodayOrders(branchId || "demo");
  }

  /** ดูประวัติออเดอร์ของลูกค้า */
  @Get("orders/my")
  myOrders(
    @Query("lineUserId") lineUserId?: string,
    @Query("ticketId") ticketId?: string,
  ) {
    return this.menu.getMyOrders(lineUserId, ticketId);
  }
}
