import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** login ฝั่งร้าน (เจ้าของ/ผู้จัดการ/พนักงาน) ด้วย email + password */
  async login(email: string, password: string) {
    // โหมด memory/mongo (dev/demo): ยังไม่มีตาราง users — อนุญาตบัญชีสาธิตบัญชีเดียว
    if (process.env.DB_MODE !== "prisma") {
      if (email === "owner@example.com" && password === "demo1234") {
        const token = await this.jwt.signAsync({
          sub: "staff-demo",
          tenantId: "tenant-demo",
          branchId: "demo",
          role: "OWNER",
        });
        return {
          accessToken: token,
          user: {
            id: "staff-demo",
            displayName: "เจ้าของร้าน (สาธิต)",
            role: "OWNER",
            tenantId: "tenant-demo",
            branchId: "demo",
          },
        };
      }
      throw new UnauthorizedException("โหมดสาธิต: ใช้ owner@example.com / demo1234");
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("อีเมลหรือรหัสผ่านไม่ถูกต้อง");

    const token = await this.jwt.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      role: user.role,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
      },
    };
  }

  /** สร้างผู้ใช้ใหม่ (ใช้ตอน seed/สมัครร้าน) */
  async createUser(data: {
    tenantId: string;
    branchId?: string;
    email: string;
    password: string;
    displayName: string;
    role?: "OWNER" | "MANAGER" | "STAFF" | "ADMIN";
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: { ...data, password: undefined, passwordHash } as never,
    });
  }
}
