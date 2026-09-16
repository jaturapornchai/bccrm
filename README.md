# BCCRM — ระบบ CRM + Queue สำหรับธุรกิจไทย (Open Source)

ระบบบริหารคิวและลูกค้าสัมพันธ์สำหรับธุรกิจบริการไทย (คลินิก / ร้านทำผม / ร้านอาหาร / ศูนย์บริการ)
เชื่อมต่อ **LINE OA** เต็มรูปแบบ — ลูกค้าจองคิว เช็กคิว และรับแจ้งเตือนผ่าน LINE โดยไม่ต้องโหลดแอป

**License: MIT — ใช้ฟรี ดัดแปลงได้ ทำการค้าได้ ไม่มีเงื่อนไขซ่อน**

## สถาปัตยกรรม

```
ลูกค้า (LINE OA + LIFF) ──► Backend API (NestJS) ◄── Kiosk หน้าร้าน (Android/iPad)
                                     │
Web Admin (Next.js) ────────────────┤── PostgreSQL + Redis
                                     │
Mobile App (Flutter) ───────────────┘   เจ้าของร้าน / ผู้จัดการ / พนักงาน
```

## โครงสร้าง Monorepo

| Path | คำอธิบาย |
|---|---|
| `apps/api` | Backend API (NestJS) — Queue engine, LINE webhook, CRM, Auth |
| `apps/admin` | Web Admin (Next.js) — ตั้งค่าร้าน/สาขา/บริการ, รายงาน, จัดการคิว |
| `apps/liff` | LIFF apps (Vite + React) — จองคิว, บัตรคิวของฉัน, โปรไฟล์สมาชิก |
| `apps/mobile` | Mobile App + Kiosk (Flutter) — พนักงานเรียกคิว, kiosk กดบัตรคิว, จอแสดงคิว |
| `packages/queue-engine` | ตรรกะคิวแกนกลาง (ออกเลข, จัดลำดับ, state machine) — ใช้ซ้ำได้ |
| `packages/line-sdk` | Flex Message templates ภาษาไทย, webhook helpers |
| `packages/database` | Prisma schema + migrations |
| `packages/ui` | Shared UI components |

## เริ่มใช้งาน (Self-Host)

ความต้องการ: Node.js ≥ 20, pnpm ≥ 9 (ต้องมี Docker เฉพาะตอนใช้ PostgreSQL จริง)

### ทางลัด: รันแบบไม่ต้องมีฐานข้อมูล (Demo)

```bash
pnpm install
pnpm db:generate        # ครั้งแรกครั้งเดียว
DB_MODE=memory pnpm --filter @bccrm/api dev   # API + MCP ที่พอร์ต 3001 (ข้อมูลตัวอย่างใน RAM)
pnpm --filter @bccrm/admin dev                # Web Admin ที่พอร์ต 3000
```

- สาขาตัวอย่าง: `demo` · บริการ: `svc-general` (A), `svc-vip` (V) · เคาน์เตอร์: `counter-1`, `counter-2`
- Web Admin ถ้าเชื่อม API ไม่ได้จะตกเข้า **โหมดสาธิต** (ข้อมูลจำลองฝั่ง browser) โดยอัตโนมัติ
- บน Windows (cmd): `set DB_MODE=memory && pnpm --filter @bccrm/api dev`

### รันเต็มรูปแบบ (PostgreSQL + Redis)

```bash
cp .env.example .env    # ตั้ง DB_MODE=prisma + แก้ค่า LINE channel และ JWT_SECRET
docker compose up -d postgres redis
pnpm db:generate && pnpm db:migrate
pnpm dev
```

หรือยกทั้งระบบด้วย Docker คำสั่งเดียว: `docker compose up -d`

## API & MCP (endpoint เดียวกัน ทุก client เชื่อมที่เดียว)

| ทางเข้า | URL | ใช้โดย |
|---|---|---|
| REST API | `http://localhost:3001/api/...` | Web Admin, Flutter app, Kiosk, LIFF |
| **MCP** | `POST http://localhost:3001/mcp` | AI agent / automation (JSON-RPC, stateless) |
| Realtime | `ws://localhost:3001` (socket.io, ห้อง `branch:<branchId>`) | จอ TV, แอปพนักงาน, Kiosk |
| LINE webhook | `POST /webhooks/line` | LINE Platform |

**MCP tools** (wrap ตรรกะคิวตัวเดียวกับ REST ทุกประการ): `bccrm_list_waiting`, `bccrm_create_ticket`, `bccrm_call_next`, `bccrm_change_state`, `bccrm_today_stats` — Flutter/agent เชื่อม backend ตัวเดียวได้ทั้ง REST และ MCP

## ตั้งค่า LINE OA (คร่าว)

1. สมัคร LINE Official Account + เปิดใช้ Messaging API ที่ [LINE Developers](https://developers.line.biz/)
2. สร้าง channel → นำ `Channel ID / Secret / Access Token` ใส่ `.env`
3. ตั้ง Webhook URL ชี้มาที่ `https://<โดเมนของคุณ>/webhooks/line`
4. สร้าง LIFF app 3 ตัว (จองคิว / บัตรคิว / โปรไฟล์) แล้วใส่ LIFF ID ใน `.env`

## เอกสาร

- [แผนออกแบบระบบฉบับเต็ม](PLAN-CRM-LINE-QUEUE.md)
- [วิธีมีส่วนร่วมพัฒนา (CONTRIBUTING)](CONTRIBUTING.md)

## Roadmap ย่อ

- **Phase 1 (MVP):** คิวจองล่วงหน้า + walk-in, LIFF, Kiosk Android, แจ้งเตือน LINE, Web Admin พื้นฐาน
- **Phase 2:** CRM เต็มรูปแบบ, PDPA consent, RBAC, iOS, รายงาน
- **Phase 3:** สมาชิก/แต้ม/คูปอง, Smart Queue, plugin marketplace

ยินดีรับทุก contribution — ดู issues ที่ติดป้าย `good first issue` ได้เลยครับ
