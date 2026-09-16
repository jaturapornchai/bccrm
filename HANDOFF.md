# HANDOFF — BCCRM (ส่งต่อให้ Gemini Flash)

> เอกสารนี้เขียนโดย Kimi (Claude) วันที่ 2026-09-16 เพื่อส่งต่องานให้ AI ตัวถัดไปทำต่อได้โดยไม่ต้องไล่ context เก่า
> อ่านไฟล์นี้ก่อนเสมอ แล้วค่อยลงมือ — ทุกข้อมูลในนี้ verify แล้วว่าตรงกับของจริง ณ วันที่เขียน

---

## 1. โปรเจกต์คืออะไร

**BCCRM** = ระบบ CRM + คิว สำหรับธุรกิจบริการไทย (คลินิก/ร้านทำผม/ร้านอาหาร) เชื่อม LINE OA — **Open Source MIT ฟรีหมด**

- Monorepo: pnpm 9.15 + Turbo ที่ `D:\bccrm`
- GitHub: `https://github.com/jaturapornchai/bccrm` — branch หลักที่ push แล้วคือ **`dev`** (commit ล่าสุด `c7fede6`) · local `main` มี commit เดียวกันแต่ยังไม่ push
- Owner: jaturapornchai — สื่อสาร**ภาษาไทย**เสมอ, ชอบให้ "ทำเลย" ไม่ชอบรอ plan นาน

## 2. การตัดสินใจที่ล็อกแล้ว (ห้ามเปิดประเด็นใหม่)

| เรื่อง | ตัดสินใจ |
|---|---|
| License | MIT, ฟรีทุกอย่าง ทำการค้าได้ |
| Mobile app | **Flutter** (owner ยืนยันเอง) — อยู่ `apps/mobile` |
| Web admin | Next.js 15 — `apps/admin` |
| Backend | NestJS — `apps/api` พอร์ต 3001 |
| DB หลัก | **MongoDB** (owner มีใน Docker Desktop อยู่แล้ว) — ไม่ใช้ Postgres เป็นหลัก |
| Cache | Redis (มีอยู่แล้ว) · ไฟล์/รูป = MinIO (มีอยู่แล้ว) |
| DB mode | เลือกด้วย env `DB_MODE` = `mongo` (default) / `memory` / `prisma` |
| MCP | อยู่ใน backend ตัวเดียว `POST /mcp` — Flutter/AI เชื่อมที่เดียวกัน |
| LIFF | Vite + React — `apps/liff` (ยัง skeleton) |

## 3. สิ่งที่ทำเสร็จและ verify แล้ว (เชื่อได้)

- Backend API รันจริงกับ MongoDB จริง — health `{"status":"ok"}`, seed demo data ลง Mongo อัตโนมัติ
- Login จริงผ่าน REST ได้ JWT · **บัญชี demo: `owner@example.com` / `demo1234`** (hardcode ใน `apps/api/src/auth/auth.service.ts` เมื่อ DB_MODE != prisma)
- Flutter web ทดสอบ end-to-end ผ่าน browser automation แล้ว: login → เห็นคิวจริงจาก Mongo (A002, A004) → กดเรียกคิว → A002 เปลี่ยนสถานะ สถิติอัปเดต
- MCP server 5 tools: `bccrm_list_waiting`, `bccrm_create_ticket`, `bccrm_call_next`, `bccrm_change_state`, `bccrm_today_stats`
- Realtime socket.io (ห้อง `branch:<branchId>`) — gateway อยู่ `apps/api/src/realtime/queue.gateway.ts`, service ยิง event แล้ว
- Demo data ใน Mongo: สาขา `demo`, บริการ `svc-general` (prefix A), `svc-vip` (prefix V), counters `counter-1`/`counter-2`
- ภาพหน้าจอจริง: `docs/screenshots/admin-demo-mode.png`, `docs/screenshots/flutter-queue-console.jpg`
- `flutter analyze` ผ่าน 0 issues · README ฉบับ final ภาษาไทย push ขึ้น dev แล้ว

## 4. สิ่งที่ยังไม่เสร็จ (งานต่อไป เรียงความสำคัญ)

1. **LINE webhook + LIFF จองคิวเชื่อมจริง** — owner อยากได้ลูปครบ: ลูกค้าจองใน LINE → คิวเข้า Mongo → พนักงานเรียกจากแอป (เคยเสนอไว้ owner ยังไม่ตอบ)
2. `apps/liff` ยัง skeleton — ต้องทำ 3 หน้า: จองคิว / บัตรคิวของฉัน / โปรไฟล์
3. LINE notification เมื่อใกล้ถึงคิว (push message ผ่าน `packages/line-sdk` ที่มี Flex templates ไทยแล้ว)
4. RBAC จริง (ตอนนี้ auth เป็น demo hardcode) + role เจ้าของ/ผู้จัดการ/พนักงาน
5. Web admin หน้าจัดการคิวเชื่อม socket realtime (ตอนนี้ poll/โหมดสาธิต)
6. Kiosk mode + จอ TV display ใน Flutter (`apps/mobile/lib/features/kiosk`, `display` มีโครงแล้ว — ยังไม่ได้ e2e test)
7. CRM จริง: โปรไฟล์ลูกค้าจาก LINE userId, ประวัติการใช้บริการ, PDPA consent

## 5. สภาพแวดล้อมเครื่องนี้ (สำคัญมาก อ่านก่อนรัน)

**เครื่อง Windows + Git Bash. ของหลายอย่างไม่ได้อยู่ใน PATH ปกติ:**

- **pnpm 9.15.0** ติดตั้งเองที่ `/d/bccrm/.tools/node_modules/.bin` → ต้อง `export PATH="/d/bccrm/.tools/node_modules/.bin:$PATH"` ทุก shell (`.tools/` ถูก gitignore แล้ว)
- **Flutter SDK 3.47.4 (Dart 3.13.3)** ติดตั้งเองที่ `/d/bccrm/.tools/flutter` → export PATH ต้องรวม `/c/Windows/System32/WindowsPowerShell/v1.0` ด้วย ไม่งั้น flutter ฟ้องหา PowerShell ไม่เจอ
- **docker.exe** อยู่ `/c/Program Files/Docker/Docker/resources/bin/docker.exe` (ไม่อยู่ใน PATH)
- **MongoDB container**: `bchr-mongodb-1` (mongo:8) ที่ `mongodb://127.0.0.1:27018/bccrm` ไม่มี auth — **ต้อง `directConnection: true`** (container โฆษณา hostname "mongodb" ที่ host resolve ไม่ได้) — แก้ไว้แล้วใน `apps/api/src/mongo/mongo.service.ts`
- Redis `127.0.0.1:6379` · MinIO `127.0.0.1:9100`
- **ห้ามเขียนไฟล์ `.env`** (tool block) — ใช้ default ในโค้ด หรือ inline env ระวัง MSYS แปลง path: `MONGODB_URL="mongodb://..."` อาจโดนมั่ง → อย่าใช้ inline, default ในโค้ดถูกอยู่แล้ว
- **Windows node heap พังตอน tsc build api**: ใช้ `NODE_OPTIONS="--max-old-space-size=8192"`
- Build order: `pnpm --filter @bccrm/queue-engine build && pnpm --filter @bccrm/line-sdk build` ก่อน `pnpm --filter @bccrm/api build` (ครั้งแรกเท่านั้น)
- **เครื่องนี้มีโปรเจกต์อื่นรันเยอะมาก** (พอร์ต 3000=MongoModel, 3100, ฯลฯ) — **ห้าม taskkill มั่วตามพอร์ต** หา PID ของตัวเองเท่านั้น (เคยพลาด kill โปรเจกต์อื่นมาแล้ว 1 ครั้ง)

## 6. คำสั่งที่ใช้บ่อย

```bash
export PATH="/d/bccrm/.tools/node_modules/.bin:$PATH"
cd /d/bccrm

# backend (Mongo จริง, default DB_MODE=mongo)
pnpm --filter @bccrm/api dev                      # พอร์ต 3001, MCP ที่ POST /mcp

# backend demo ไม่มี DB
DB_MODE=memory pnpm --filter @bccrm/api dev

# web admin
pnpm --filter @bccrm/admin dev                    # Next.js

# flutter (เพิ่ม PATH flutter + powershell ก่อน)
export PATH="/d/bccrm/.tools/flutter/bin:/c/Windows/System32/WindowsPowerShell/v1.0:$PATH"
cd apps/mobile && flutter pub get
flutter run -d web-server --web-port 4400         # ลองบน browser
flutter run --dart-define=BCCRM_API_URL=http://<IP>:3001   # มือถือจริง/emulator
```

## 7. โครงโค้ดสำคัญ

```
apps/api/src/
  mongo/mongo.service.ts          # MongoClient + directConnection
  queues/store/                   # queue-store (interface), mongo-queue-store,
                                  # memory-queue-store, prisma-queue-store
  queues/queues.service.ts        # ตรรกะคิว + ยิง socket events
  mcp/                            # mcp.controller (POST /mcp), mcp-server.factory
  auth/                           # demo login + JWT
  realtime/queue.gateway.ts       # socket.io
apps/mobile/lib/
  core/                           # config, api_client, socket_service
  features/auth/                  # auth_state, login_page
  features/staff/                 # queue_controller, queue_console_page (e2e ผ่านแล้ว)
  features/kiosk/, display/       # โครงพร้อม ยังไม่ e2e
packages/queue-engine/            # ตรรกะออกเลขคิว/state machine (shared)
packages/line-sdk/                # Flex message templates ภาษาไทย
```

## 8. วิธีคุยกับ owner

- ภาษาไทย 100%, กระชับ, ทำเลยไม่ต้องถามยิบย่อย
- owner มี viewer เปิดไฟล์ฝั่งขวาตลอด — ถ้าสร้าง/แก้ไฟล์ที่เขาดูอยู่จะเห็นทันที
- ชอบให้สรุปเป็นตาราง + มีภาพหน้าจอประกอบ
- ตอนส่งมอบ web app ต้องใส่ preview link รูปแบบ `[ชื่อ](http://localhost:7100/)` คั่นด้วย path root แบบ inline code

---
*ถ้าอ่านถึงตรงนี้แล้ว ให้เริ่มจากเช็ก `git status` + `curl http://localhost:3001/health` ว่า backend ยังอยู่ไหม แล้วทำงานข้อ 4.1 (LINE webhook + LIFF) ต่อได้เลย*
