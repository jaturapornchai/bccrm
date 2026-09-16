# BCCRM — ระบบ CRM + คิว + ผู้ช่วย AI สำหรับธุรกิจไทย 🇹🇭

<p>
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white">
  <img alt="DeepSeek AI" src="https://img.shields.io/badge/AI-DeepSeek-0EA5E9?logo=openai&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/mongodb-7%2F8-47A248?logo=mongodb&logoColor=white">
  <img alt="LINE OA" src="https://img.shields.io/badge/LINE-OA%20%2B%20LIFF-06C755?logo=line&logoColor=white">
  <img alt="Flutter" src="https://img.shields.io/badge/flutter-3.x-02569B?logo=flutter&logoColor=white">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-Server-8A2BE2">
</p>

ระบบบริหารคิว ลูกค้าสัมพันธ์ (CRM) และ **ผู้ช่วย AI อัจฉริยะ ("น้องบีซี") ขับเคลื่อนด้วย DeepSeek** แบบโอเพนซอร์ส สำหรับธุรกิจบริการไทย — คลินิก, ร้านเสริมสวย, ร้านอาหาร, ศูนย์บริการลูกค้า และจุดรับบริการต่างๆ

ลูกค้า **จองคิว เช็กบัตรคิวสด และคุยกับ AI ผ่าน LINE OA & LIFF** ได้ทันทีโดยไม่ต้องโหลดแอปเพิ่ม ส่วนร้านค้ามี **Web Admin + แอปมือถือ/แท็บเล็ต (Flutter) + Kiosk หน้าร้าน + จอแสดงคิว TV + MCP Server สำหรับ AI ภายนอก** ครบจบในที่เดียว

> **License: MIT — ใช้ฟรี ดัดแปลงได้ ทำการค้าได้ ไม่มีเงื่อนไขซ่อน**

---

## 🌟 จุดเด่นสำคัญ (Key Features)

1. **LINE OA + LIFF ครบวงจร (ไม่ต้องลงแอป)**:
   - **จองคิวออนไลน์ (Online Booking)**: เลือกลำดับบริการ (ทั่วไป / VIP), กรอกเบอร์ติดต่อ, ยินยอมเงื่อนไข PDPA
   - **บัตรคิวสด (Live Ticket)**: แสดงหมายเลขคิว, จำนวนคิวข้างหน้า, เวลาที่ต้องรอโดยประมาณ, แจ้งเตือนเมื่อใกล้ถึงคิวผ่าน Socket.io
   - **ห้องแชท AI ("น้องบีซี")**: คุยถามตอบบริการ เวลาเปิด-ปิด และเช็กคิวสดได้โดยตรง
   - **ข้อมูลสมาชิก & PDPA**: ดึงชื่อและรูปโปรไฟล์จาก LINE Account อัตโนมัติ พร้อมบันทึกความยินยอมข้อมูลส่วนบุคคล
2. **AI ผู้ช่วยอัจฉริยะ "น้องบีซี" (DeepSeek API)**:
   - ตอบคำถามลูกค้าใน LINE OA อัตโนมัติ 24 ชั่วโมง ผ่าน LINE Reply API (ไม่เปลืองโควต้าข้อความบรอดแคสต์)
   - มี **Live Queue Context**: ดึงสถานะคิวจริงของลูกค้าและรายการบริการปัจจุบันไปประมวลผลก่อนตอบ
   - **Smart Navigation**: เมื่อลูกค้าสนใจจองคิว AI จะแนบลิงก์ LINE LIFF และการ์ด Flex Message พร้อมปุ่ม Quick Reply ให้แตะเปิดแอปได้ทันที 1 คลิก
3. **Queue Engine ทรงพลัง (MongoDB Atomic)**:
   - ออกบัตรคิวด้วย `findOneAndUpdate` + `$inc` ระดับมิลลิวินาที หลายเครื่องออกพร้อมกันเลขไม่ชน
   - รองรับหลายเคาน์เตอร์, สลับคิว, เรียกซ้ำ, ข้ามคิว และสรุปสถิติประจำวัน
4. **Backend-First & MCP Server (Model Context Protocol)**:
   - ประมวลผลทุกตรรกะที่ Backend เป็นหลัก รองรับ API และเปิด **`POST /mcp`** ให้ AI Agent ภายนอกเข้าสั่งงานระบบคิวได้โดยตรง
5. **Multi-Platform Support**:
   - **Web Admin (Next.js 15)**: สำหรับผู้จัดการร้านดูภาพรวมและรายงาน
   - **Mobile App & Kiosk (Flutter)**: สำหรับพนักงานกดเรียกคิว และตั้งเป็น Kiosk ให้ลูกค้ากดบัตรคิวหน้าร้าน

---

## 🏗️ สถาปัตยกรรมระบบ

```
ลูกค้า (LINE OA แชท / ริชเมนู) ──► LINE Platform ──► Webhook (POST /webhooks/line)
                                                          │
ลูกค้า (LINE LIFF Web App) ───────────────────────────────┤
                                                          ▼
Kiosk หน้าร้าน / จอแสดงผล TV ────────────────────► Backend API (NestJS)
                                                          │
Web Admin (Next.js 15) ───────────────────────────────────┼──► MongoDB 7.0 (ข้อมูลหลัก & คิว)
                                                          ├──► Redis 7 (Cache / Pub-Sub)
พนักงาน (Flutter App) ───────────────────────────────────┼──► DeepSeek API (LLM Engine)
                                                          │
AI Agent ภายนอก ──[MCP Protocol]──► POST /mcp ────────────┘
```

---

## 📦 โครงสร้าง Monorepo (pnpm + Turbo)

| Path | คำอธิบาย |
|---|---|
| `apps/api` | Backend API (NestJS) — Queue Engine, LINE Webhook, DeepSeek AI, Customer Store, Auth, **MCP Server** |
| `apps/liff` | LIFF Web App (Vite + React + Tailwind) — จองคิว, บัตรคิวสด, แชท AI, ข้อมูล PDPA |
| `apps/admin` | Web Admin (Next.js 15) — ตั้งค่าร้าน, จัดการคิว, รายงานสถิติ |
| `apps/mobile` | แอปมือถือ + Kiosk (Flutter) — คอนโซลเรียกคิว realtime, ตู้ออกบัตรคิว, จอแสดงผล |
| `packages/queue-engine` | ตรรกะคิวแกนกลาง (ออกเลข, จัดลำดับ, State Machine) |
| `packages/line-sdk` | ฟังก์ชันเชื่อมต่อ LINE Platform, Flex Message Templates และ Webhook Signature Verifier |
| `packages/database` | Schema ฐานข้อมูล Prisma (รองรับทั้ง MongoDB และ PostgreSQL) |

---

## 🔌 API & MCP Endpoints

| ทางเข้า | Method & Path | ผู้ใช้งาน |
|---|---|---|
| **Health Check** | `GET /health` | ระบบ Monitoring / Load Balancer |
| **LIFF Web App** | `GET /` | ลูกค้าใช้งานผ่าน LINE หรือเบราว์เซอร์มือถือ |
| **LINE Webhook** | `POST /webhooks/line` | LINE Platform (รับข้อความ/ติดตาม/Postback) |
| **AI Chat API** | `POST /api/chat` | LIFF Web App คุยกับ DeepSeek AI โดยตรง |
| **Queue Operations** | `/api/queues/*` | จองคิว, เรียกคิว, ดูคิวรอ, ข้ามคิว, ยกเลิกคิว |
| **Customer Store** | `/api/customers/*` | ซิงค์ข้อมูลลูกค้าจาก LINE และบันทึก PDPA Consent |
| **MCP Server** | `POST /mcp` | AI Agent ภายนอก (JSON-RPC Stateless Protocol) |
| **Realtime Gateway** | `ws://.../socket.io` | จอแสดงคิว TV, แอปพนักงาน (ห้อง `branch:<branchId>`) |

### เครื่องมือใน MCP Server (5 Tools):
1. `bccrm_list_waiting`: ดูรายการคิวที่กำลังรอรับบริการ
2. `bccrm_create_ticket`: สั่งออกบัตรคิวใหม่
3. `bccrm_call_next`: สั่งเรียกคิวถัดไปเข้าประจำเคาน์เตอร์
4. `bccrm_change_state`: เปลี่ยนสถานะคิว (`CALLING`, `SERVING`, `DONE`, `CANCELLED`)
5. `bccrm_today_stats`: ดูสถิติคิวประจำวัน (ยอดรวม, รอ, กำลังบริการ, สำเร็จ)

---

## 🚀 การติดตั้งและเริ่มใช้งาน

### 1. ความต้องการของระบบ
- **Node.js ≥ 20**, **pnpm ≥ 9**
- **Docker & Docker Compose** (สำหรับฐานข้อมูลและรันบนเซิร์ฟเวอร์)
- **DeepSeek API Key** (สำหรับระบบ AI Assistant)
- **LINE Official Account + LIFF** (สำหรับเชื่อมต่อ LINE)

### 2. รันโหมดทดสอบในเครื่อง (Local Dev)

```bash
# โคลนโปรเจกต์และติดตั้ง dependencies
git clone https://github.com/jaturapornchai/bccrm.git
cd bccrm
pnpm install

# คัดลอก Environment Variables
cp .env.example .env

# รัน Backend API (พอร์ต 3001)
pnpm --filter @bccrm/api dev

# รัน LIFF Frontend (พอร์ต 3002)
pnpm --filter @bccrm/liff dev

# รัน Web Admin (พอร์ต 3000)
pnpm --filter @bccrm/admin dev
```

### 3. รันบนเซิร์ฟเวอร์จริง (Production Deployment)

โปรเจกต์มีไฟล์ `docker-compose.server.yml` สำหรับ Deploy ขึ้นเซิร์ฟเวอร์จริงได้ทันที:

```bash
# สั่งบิวด์และรันคอนเทนเนอร์บนเซิร์ฟเวอร์
docker compose -f docker-compose.server.yml up -d --build
```

---

## 💬 การตั้งค่าเชื่อมต่อกับ LINE Platform

1. **สร้าง LINE Developers Channel**:
   - สร้าง **Messaging API Channel** เพื่อรับ Webhook
   - สร้าง **LINE Login Channel** และเปิดใช้งาน **LIFF**
2. **ตั้งค่า Webhook**:
   - Webhook URL: `https://<โดเมนของคุณ>/webhooks/line`
   - เปิดสวิตช์ **Use Webhook: ON**
3. **ตั้งค่า LIFF App**:
   - Size: `Full`
   - Endpoint URL: `https://<โดเมนของคุณ>`
   - Scopes: `openid, profile, chat_message.write`
   - **สำคัญ**: ปรับสถานะจาก `Developing` เป็น `Published` เพื่อให้ลูกค้าทุกคนเปิดใช้งานได้
4. **ใส่ Keys ใน Environment Variables**:
   ```env
   LINE_CHANNEL_SECRET=<your-channel-secret>
   LINE_CHANNEL_ACCESS_TOKEN=<your-channel-access-token>
   LIFF_URL=https://liff.line.me/<your-liff-id>
   AI_BASE_URL=https://api.deepseek.com
   AI_API_KEY=<your-deepseek-api-key>
   AI_MODEL=deepseek-chat
   ```

---

## 🎨 ริชเมนู (Rich Menu) แนะนำ

ระบบมีภาพริชเมนูขนาดมาตรฐาน LINE **2500 x 843 px** (Compact 3 Buttons) ออกแบบพร้อมใช้งาน:
- **ปุ่มที่ 1 (ซ้าย)**: 📋 **จองคิวออนไลน์** → ประเภทแอ็กชัน: ลิงก์ (URL: `https://liff.line.me/<LIFF_ID>`)
- **ปุ่มที่ 2 (กลาง)**: 🎫 **บัตรคิวของฉัน** → ประเภทแอ็กชัน: ลิงก์ (URL: `https://liff.line.me/<LIFF_ID>`)
- **ปุ่มที่ 3 (ขวา)**: 🤖 **คุยกับ AI น้องบีซี** → ประเภทแอ็กชัน: ข้อความ (พิมพ์: `คุยกับ AI`)

---

## 🗺️ Roadmap การพัฒนา

- [x] **Phase 1 (MVP & Production):** 
  - ระบบคิว จองล่วงหน้า + Walk-in
  - บัตรคิวสดพร้อม Realtime WebSocket แจ้งเตือน
  - LINE LIFF App ครบ 4 หน้าจอ (จองคิว, บัตรคิว, คุยกับ AI, ข้อมูล PDPA)
  - ระบบ AI Assistant ("น้องบีซี") ขับเคลื่อนด้วย DeepSeek
  - จัดการข้อมูลด้วย MongoDB 7.0 Production ReplicaSet
  - MCP Server 5 เครื่องมือ สำหรับ AI Agent
- [ ] **Phase 2 (CRM & Advanced Features):**
  - ระบบสะสมแต้ม สมาชิก และคูปองโปรโมชั่น
  - ระบบแจ้งเตือนหลายสาขาและการจัดการสิทธิ์พนักงาน (RBAC)
  - Smart Queue Engine (ระบบคาดการณ์เวลารออัจฉริยะตามความหนาแน่น)
  - รองรับการออกสลิปผ่านเครื่องพิมพ์ความร้อน (Thermal Printer)

---

## 🤝 ร่วมพัฒนา (Contributing) & License

ยินดีต้อนรับทุกการสนับสนุน สามารถส่ง Pull Request หรือเปิด Issue ได้ที่ GitHub Repository  
โปรเจกต์นี้เผยแพร่ภายใต้สัญญาอนุญาต **[MIT License](LICENSE)** — นำไปใช้งานเชิงพาณิชย์และดัดแปลงได้โดยอิสระ

สร้างด้วย ❤️ เพื่อยกระดับธุรกิจบริการไทย
