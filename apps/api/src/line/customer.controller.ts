import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { MongoCustomerStore } from "../mongo/mongo-customer-store";
import { PrismaService } from "../prisma/prisma.service";

import { IsBoolean, IsOptional, IsString } from "class-validator";

export class SyncCustomerDto {
  @IsString()
  lineUserId!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  pictureUrl?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  pdpaConsent?: boolean;
}

@Controller("customers")
export class CustomerController {
  constructor(
    private readonly mongoCustomer: MongoCustomerStore,
    private readonly prisma: PrismaService,
  ) {}

  @Post("sync")
  async sync(@Body() dto: SyncCustomerDto) {
    if (!dto.lineUserId) throw new NotFoundException("ต้องระบุ lineUserId");

    const consentAt = dto.pdpaConsent ? new Date() : undefined;
    const consentVersion = dto.pdpaConsent ? "1.0" : undefined;

    if (process.env.DB_MODE !== "prisma") {
      return this.mongoCustomer.upsertByLineUserId(dto.lineUserId, {
        displayName: dto.displayName,
        pictureUrl: dto.pictureUrl,
        phone: dto.phone,
        consentAt,
        consentVersion,
      });
    }

    return this.prisma.customer.upsert({
      where: { lineUserId: dto.lineUserId },
      create: {
        lineUserId: dto.lineUserId,
        displayName: dto.displayName,
        phone: dto.phone,
        consentAt,
        consentVersion,
      },
      update: {
        displayName: dto.displayName,
        phone: dto.phone,
        ...(dto.pdpaConsent ? { consentAt, consentVersion } : {}),
      },
    });
  }

  @Get(":lineUserId")
  async getProfile(@Param("lineUserId") lineUserId: string) {
    if (process.env.DB_MODE !== "prisma") {
      const customer = await this.mongoCustomer.findByLineUserId(lineUserId);
      if (!customer) throw new NotFoundException("ไม่พบข้อมูลลูกค้า");
      return customer;
    }

    const customer = await this.prisma.customer.findUnique({
      where: { lineUserId },
    });
    if (!customer) throw new NotFoundException("ไม่พบข้อมูลลูกค้า");
    return customer;
  }
}
