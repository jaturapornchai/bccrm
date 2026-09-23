# BCCRM — ระบบสั่งอาหารล่วงหน้า + คิว + ผู้ช่วย AI ผ่าน LINE 🇹🇭

<p>
  <a href="LICENSE"><img alt="License MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white">
  <img alt="LINE OA" src="https://img.shields.io/badge/LINE-OA%20%2B%20LIFF-06C755?logo=line&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/mongodb-7-47A248?logo=mongodb&logoColor=white">
  <img alt="DeepSeek" src="https://img.shields.io/badge/AI%20Chat-DeepSeek-0EA5E9">
  <img alt="TypeSafe Jev" src="https://img.shields.io/badge/Recommend-TypeSafe%20Jev-F59E0B">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-Server-8A2BE2">
</p>

ระบบโอเพนซอร์สสำหรับร้านอาหาร: ลูกค้า **สั่งอาหารล่วงหน้าและรับบัตรคิวผ่าน LINE** โดยไม่ต้องโหลดแอป ส่วนร้านใช้ **หน้าจอพนักงาน (Dashboard)** เรียกคิวและดูว่าครัวต้องเตรียมอะไร ใช้พร้อมกันได้หลายเครื่องแบบเรียลไทม์

ตัวอย่างที่ใช้งานจริงในโปรเจกต์นี้คือร้าน **โซมายด์ (Seoulmind)** ร้านอาหารเกาหลีและบิงซูที่เชียงใหม่

> **License: MIT** ใช้ฟรี แก้ไขได้ และนำไปใช้เชิงพาณิชย์ได้

---

## 🔗 ลองใช้งานได้ทันที (Demo)

| ใครใช้ | ลิงก์ | หมายเหตุ |
|---|---|---|
| 👤 ลูกค้า (เปิดใน LINE) | https://liff.line.me/2009920675-GqteXbxD | สั่งอาหาร จองคิว ดูบัตรคิว คุยกับ AI |
| 🧑‍🍳 พนักงานร้าน | https://admin.bcaicloud.com | **ไม่ต้อง login** เปิดได้ทุกเครื่อง กดได้ทุกปุ่ม |
| ⚙️ API | https://lineoahook.bcaicloud.com/health | ตรวจว่าเซิร์ฟเวอร์ทำงานอยู่ |

> ⚠️ ข้อมูล demo เป็นชุดเดียวกันทุกคน ใครกดปุ่มอะไรจะเห็นผลเหมือนกันทุกเครื่อง
> ถ้ากด **"เรียก"** คิวของลูกค้าที่จองผ่าน LINE ระบบจะส่งข้อความ LINE ถึงลูกค้าคนนั้นจริง

---

## 🧭 ระบบทำงานอย่างไร (อ่านจบใน 1 นาที)

ทั้งระบบเป็นแบบ **สั่งล่วงหน้า (Preorder)**: ลูกค้าสั่งก่อนมาถึงร้าน ครัวจะได้เตรียมไว้ พอลูกค้ามาถึงก็ได้ทานเลย

**ฝั่งลูกค้า**
1. เปิด LINE OA ของร้าน แล้วกดริชเมนู → หน้าเว็บ LIFF จะเปิดขึ้นใน LINE
2. เลือกเมนู (ค้นหาได้) เลือกความเผ็ด/ซอส/ความหวาน แล้วใส่ตะกร้า
3. ระบบ **Jev แนะนำ 3 เมนู** ที่ลูกค้าน่าจะสั่งเพิ่ม กด "+ เพิ่ม" ได้ทันที
4. เลือกขนาดโต๊ะ แล้วกดยืนยัน → ได้ **บัตรคิว + เลขออเดอร์** ในครั้งเดียว
5. บัตรคิวอัปเดตสด เห็นว่ามีกี่คิวข้างหน้า เมื่อถึงคิวจะขึ้นแจ้งเตือนบนบัตรคิว และได้ **ข้อความ LINE แจ้งว่าถึงคิวแล้ว**

**ฝั่งร้าน (หน้าจอพนักงาน)**
1. เปิด https://admin.bcaicloud.com บนคอม แท็บเล็ต หรือมือถือ กี่เครื่องก็ได้
2. ดูภาพรวมวันนี้: คิวรอ / เรียกแล้ว / กำลังทาน / เสร็จ, ยอดสั่งล่วงหน้า, คิวที่รอนานเกิน 30 นาที
3. ช่อง **"ครัว — ต้องเตรียม"** รวมจำนวนจานของทุกคิวที่ยังไม่เสร็จ พร้อมตัวเลือกเผ็ด/ซอส/หวาน
4. กด **"เรียก"** → **"นั่งแล้ว"** → **"เสร็จ / เช็คบิล"** (หรือ "ไม่มา" / "ยกเลิก") ทุกเครื่องเห็นผลพร้อมกันทันที

---

## 🌟 ฟีเจอร์หลัก

### 📱 LIFF สำหรับลูกค้า (5 แท็บ)
| แท็บ | ทำอะไรได้ |
|---|---|
| 🍽️ สั่งอาหาร | ดูเมนู ค้นหา เลือกตัวเลือก ตะกร้า เมนูแนะนำจาก Jev และสั่งล่วงหน้าพร้อมรับคิว |
| 📋 จองโต๊ะ | จองคิวอย่างเดียวโดยไม่สั่งอาหาร |
| 🎫 คิว & ออเดอร์ | บัตรคิวสด จำนวนคิวข้างหน้า และรายการที่สั่งไว้ |
| 💬 ถาม AI | คุยกับ "น้องบีซี" |
| 👤 โปรไฟล์ | ข้อมูลจากบัญชี LINE |

### 🧑‍🍳 หน้าจอพนักงาน (Staff Dashboard)
- **ใช้หลายเครื่องพร้อมกัน:** อัปเดตเรียลไทม์ผ่าน Socket.io และดึงข้อมูลซ้ำทุก 10 วินาทีเผื่อเน็ตหลุด แสดงว่ามีพนักงานออนไลน์กี่เครื่อง
- **กดชนกันไม่พัง:** ถ้าสองเครื่องกดเรียกคิวเดียวกันพร้อมกัน ระบบยอมแค่ครั้งเดียว เครื่องที่กดทีหลังจะได้ข้อความแจ้ง จึงไม่ส่ง LINE ซ้ำ
- ตัวเลขสรุป, แถบสีสถานะคิวทั้งวัน, สรุปแยกตามขนาดโต๊ะ, เมนูขายดีวันนี้, ความเคลื่อนไหวล่าสุดจากทุกเครื่อง
- รองรับมือถือ/แท็บเล็ต และถ้าเชื่อม API ไม่ได้จะเปลี่ยนเป็นโหมดสาธิตให้อัตโนมัติ

### 🤖 AI สองตัว ทำคนละหน้าที่
| AI | หน้าที่ | ถ้าไม่มี API key |
|---|---|---|
| **น้องบีซี** (DeepSeek) | ตอบแชทลูกค้าใน LINE OA และใน LIFF โดยรู้สถานะคิวจริงของลูกค้า | แชท AI ใช้ไม่ได้ |
| **Jev** (TypeSafe System One) | จัดอันดับเมนูที่ลูกค้าน่าจะสั่งต่อ 3 อย่าง จากตะกร้า ขนาดโต๊ะ และเมนูที่กำลังดู | ใช้กฎสำรองแทน (บอกผลว่า `source: "fallback"`) |

### 💬 LINE แบบประหยัดค่าใช้จ่าย
- ตอบแชทด้วย **Reply API** ซึ่งไม่เสียโควต้า
- ใช้ **Push** (เสียโควต้า) เฉพาะตอน **เรียกคิว** เท่านั้น เปิด/ปิดได้ทีละจุดด้วย env (ดูหัวข้อ Environment)

### 🔢 ระบบคิว
- ออกเลขคิวแบบ atomic หลายเครื่องออกพร้อมกันเลขก็ไม่ชน ตัวอักษรนำหน้าตามขนาดโต๊ะ (A = 1-2 ท่าน, B = 3-4, C = 5-8, T = กลับบ้าน)
- เลขออเดอร์เรียงต่อกัน (`SM-10001`, `SM-10002`, …) ราคาคิดจากฝั่งเซิร์ฟเวอร์เท่านั้น ลูกค้าแก้ราคาเองไม่ได้
- สถานะคิวเปลี่ยนตามกฎที่กำหนดไว้เท่านั้น:

```
WAITING (รอเรียก) ──► CALLED (เรียกแล้ว) ──► SERVING (นั่งทาน) ──► DONE (เสร็จ)
   │                      │
   └──► CANCELLED         └──► NO_SHOW (ไม่มา) ──► กลับไปต่อคิวได้
```

### 🔌 MCP Server
เปิด `POST /mcp` ให้ AI Agent ภายนอกสั่งงานระบบคิวได้ มี 5 เครื่องมือ:
`bccrm_list_waiting` · `bccrm_create_ticket` · `bccrm_call_next` · `bccrm_change_state` · `bccrm_today_stats`

---

## 🏗️ สถาปัตยกรรม

```
ลูกค้า (LINE OA แชท) ──► LINE Platform ──► POST /webhooks/line ─┐
ลูกค้า (LIFF ใน LINE) ─────────────────────────────────────────┤
พนักงาน (admin.bcaicloud.com, หลายเครื่อง) ──── /api + Socket.io ─┤
AI Agent ภายนอก ──[MCP]──► POST /mcp ──────────────────────────┤
                                                                ▼
                                                  Backend API (NestJS)
                                                   ├──► MongoDB 7 (คิว, ออเดอร์, เมนู, ลูกค้า)
                                                   ├──► DeepSeek API (แชท "น้องบีซี")
                                                   ├──► TypeSafe Jev (แนะนำเมนู)
                                                   └──► LINE Messaging API (Reply / Push)
```

บน production ใช้ **Caddy** เป็นตัวกลาง (HTTPS อัตโนมัติ):
- `lineoahook.bcaicloud.com` → LIFF (ไฟล์ static) + API
- `admin.bcaicloud.com` → หน้าจอพนักงาน (ไฟล์ static) + ส่ง `/api` และ `/socket.io` ต่อไปที่ API ตัวเดียวกัน

---

## 📦 โครงสร้างโปรเจกต์ (pnpm + Turbo monorepo)

| Path | คืออะไร |
|---|---|
| `apps/api` | Backend (NestJS): คิว, เมนู/ออเดอร์, Jev, LINE Webhook + AI, ลูกค้า, Realtime, MCP |
| `apps/liff` | หน้าเว็บลูกค้าใน LINE (Vite + React) |
| `apps/admin` | หน้าจอพนักงาน (Next.js 15) — build เป็นไฟล์ static สำหรับ production |
| `packages/queue-engine` | ตรรกะคิว: กฎการเปลี่ยนสถานะ, การจัดลำดับ, การคำนวณเวลารอ |
| `packages/line-sdk` | ตัวช่วยเชื่อม LINE: Flex Message และตรวจลายเซ็น Webhook |
| `packages/database` | Prisma schema (ทางเลือกสำหรับ PostgreSQL) |
| `packages/ui` | คอมโพเนนต์ UI ที่ใช้ร่วมกัน |

---

## 🔌 API Endpoints

| Method & Path | ใช้ทำอะไร |
|---|---|
| `GET /health` | ตรวจสถานะเซิร์ฟเวอร์ |
| `POST /webhooks/line` | รับข้อความจาก LINE |
| `GET /api/menu/items` · `GET /api/menu/items/:id` | รายการเมนู |
| `POST /api/menu/recommend-next` | Jev แนะนำ 3 เมนูถัดไป |
| `POST /api/menu/orders` · `GET /api/menu/orders/today` · `GET /api/menu/orders/my` | สร้างออเดอร์, ออเดอร์วันนี้ (พนักงาน), ออเดอร์ของลูกค้า |
| `POST /api/queues/tickets` · `GET /api/queues/tickets/:id` · `POST /api/queues/tickets/:id/cancel` | ออกบัตรคิว, ดูบัตรคิว, ยกเลิก |
| `GET /api/queues/waiting` · `GET /api/queues/current-calling` · `GET /api/queues/stats/today` | คิวรอ, คิวที่เรียกอยู่, สถิติวันนี้ |
| `POST /api/queues/call-next` · `PATCH /api/queues/tickets/:id/state/:state` | เรียกคิวถัดไป, เปลี่ยนสถานะคิว |
| `GET /api/queues/services` · `GET /api/queues/customer/active` | ขนาดโต๊ะ/บริการ, คิวที่ลูกค้าถืออยู่ |
| `POST /api/chat` | แชทกับ AI จาก LIFF |
| `POST /api/customers/sync` · `GET /api/customers/:lineUserId` | ซิงค์ข้อมูลลูกค้าจาก LINE |
| `POST /mcp` | MCP Server (JSON-RPC) |

**Socket.io events** (ห้อง `branch:<branchId>` สำหรับทุกหน้าจอ, ห้อง `staff:<branchId>` สำหรับพนักงาน):
`queue:update` (คิวเปลี่ยน) · `queue:call` (เรียกคิว) · `order:new` (ออเดอร์ใหม่) · `staff:count` (จำนวนเครื่องพนักงาน)

---

## 🚀 ติดตั้งและรันในเครื่อง

**ต้องมี:** Node.js ≥ 20, pnpm ≥ 9, Docker (สำหรับ MongoDB)

```bash
git clone https://github.com/jaturapornchai/bccrm.git
cd bccrm
pnpm install
cp .env.example .env          # แล้วแก้ค่าที่ต้องใช้ (ดูตารางด้านล่าง)

docker compose up -d mongo    # ฐานข้อมูล (พอร์ต 27017)

pnpm --filter @bccrm/api dev    # API       → http://localhost:3001
pnpm --filter @bccrm/liff dev   # ลูกค้า    → http://localhost:3002
pnpm --filter @bccrm/admin dev  # พนักงาน   → http://localhost:3000
```

> ถ้าใช้ MongoDB จาก `docker compose` ให้แก้ใน `.env` เป็น `MONGODB_URL=mongodb://127.0.0.1:27017/bccrm` (ค่าตัวอย่างใช้พอร์ต 27018)

ครั้งแรกระบบจะสร้างเมนูและขนาดโต๊ะตัวอย่างของร้านโซมายด์ให้อัตโนมัติ

**รัน test:**
```bash
pnpm --filter @bccrm/api test
```

---

## ⚙️ Environment Variables ที่สำคัญ

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `MONGODB_URL` | ที่อยู่ MongoDB |
| `DB_MODE` | ไม่ตั้ง = MongoDB (ค่าเริ่มต้น), `memory` = เก็บคิวใน RAM, `prisma` = PostgreSQL |
| `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | เชื่อม LINE Messaging API |
| `LIFF_URL` | ลิงก์ LIFF ที่แนบไปในข้อความ LINE |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | แชท AI (ค่าเริ่มต้น DeepSeek, `deepseek-chat`) |
| `TYPESAFE_API_KEY` | Jev แนะนำเมนู (ไม่ใส่ = ใช้กฎสำรอง) |
| `ENABLE_LINE_PUSH` | สวิตช์หลักของ Push ต้องเป็น `true` ก่อน Push จุดไหนถึงจะทำงาน |
| `ENABLE_LINE_PUSH_ON_CALLED` | ส่ง LINE ตอนเรียกคิว (production เปิดอยู่) |
| `ENABLE_LINE_PUSH_ON_BOOKING`, `ENABLE_LINE_PUSH_ON_ALMOST_THERE` | ส่ง LINE ตอนจองคิว / ใกล้ถึงคิว (production ปิดไว้เพื่อประหยัด) |
| `VITE_API_URL` | API ที่ LIFF เรียก (ตั้งตอน build) |
| `NEXT_PUBLIC_API_URL` | API ที่หน้าจอพนักงานเรียก ใส่ค่าว่างเมื่อใช้โดเมนเดียวกับ API |

> ห้าม commit ไฟล์ `.env` หรือใส่ key ลงในโค้ด

---

## 🌐 Deploy ขึ้นเซิร์ฟเวอร์

ขั้นตอนละเอียดอยู่ใน [HANDOFF.md](HANDOFF.md) สรุปสั้น ๆ:

```bash
# API
pnpm --filter @bccrm/api build
# → copy apps/api/dist เข้า container แล้ว restart

# LIFF (ลูกค้า)
pnpm --filter @bccrm/liff build
# → copy apps/liff/dist ไปที่โฟลเดอร์ที่ Caddy เสิร์ฟ

# หน้าจอพนักงาน (static export)
cd apps/admin && ADMIN_STATIC=1 NEXT_PUBLIC_API_URL= npx next build
# → copy apps/admin/out ไปที่โฟลเดอร์ที่ Caddy เสิร์ฟ
```

ถ้าจะ build ทั้งชุดด้วย Docker ให้ใช้ `docker-compose.server.yml`

---

## 💬 ตั้งค่า LINE

1. ที่ LINE Developers สร้าง **Messaging API Channel** (สำหรับ Webhook) และ **LINE Login Channel** (สำหรับ LIFF)
2. Webhook URL: `https://<โดเมน>/webhooks/line` แล้วเปิด **Use webhook**
3. LIFF: Size `Full`, Endpoint `https://<โดเมน>`, Scopes `openid profile chat_message.write` แล้วเปลี่ยนสถานะเป็น **Published**
4. ใส่ `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LIFF_URL` ใน `.env`

**ริชเมนู:** ภาพพร้อมใช้อยู่ที่ `docs/rich-menu/` (2500×843 และ 1200×405) มี 3 ปุ่ม:
📋 **จองคิวออนไลน์** (ลิงก์ LIFF) · 🎫 **บัตรคิวของฉัน** (ลิงก์ LIFF) · 🤖 **คุยกับ AI น้องบีซี** (ส่งข้อความ `คุยกับ AI`)

---

## ⚠️ ข้อจำกัดตอนนี้ (เวอร์ชัน demo)

- **ยังไม่มีระบบยืนยันตัวตน:** หน้าจอพนักงานและ API เปิดให้ทุกคนใช้ได้ ต้องเพิ่ม login/สิทธิ์ก่อนใช้กับร้านจริง
- รองรับ **1 สาขา** (`branchId = demo`)
- ออเดอร์ขึ้นสถานะ "กำลังทำ" ทันทีที่สั่ง ยังไม่มีปุ่มให้ครัวเปลี่ยนสถานะออเดอร์
- คิวทุกขนาดโต๊ะเรียงต่อกันเป็นแถวเดียว ปุ่ม "เรียกคิวถัดไป" จะเรียกคิวที่เก่าสุด แต่เลือกเรียกตามขนาดโต๊ะเองได้
- ช่อง "ความเคลื่อนไหวล่าสุด" แสดงเฉพาะเหตุการณ์หลังเปิดหน้าจอ ถ้ารีเฟรชหน้าจะเริ่มใหม่

---

## 🗺️ Roadmap

- [x] สั่งอาหารล่วงหน้า + บัตรคิวผ่าน LINE LIFF
- [x] Jev แนะนำ 3 เมนูถัดไป
- [x] แชท AI "น้องบีซี" ผ่าน LINE OA และ LIFF
- [x] หน้าจอพนักงานแบบเรียลไทม์ ใช้หลายเครื่องพร้อมกัน
- [x] LINE Push ตอนเรียกคิว (ที่เหลือใช้ Reply ทั้งหมด)
- [x] MCP Server 5 เครื่องมือ
- [ ] Login พนักงาน + สิทธิ์การใช้งาน (RBAC) ฝั่ง API
- [ ] สถานะออเดอร์ฝั่งครัว (รับออเดอร์ → กำลังทำ → พร้อมเสิร์ฟ)
- [ ] รองรับหลายสาขา
- [ ] สะสมแต้ม / คูปอง
- [ ] พิมพ์บัตรคิวด้วยเครื่องพิมพ์ความร้อน

---

## 🤝 ร่วมพัฒนา & License

ส่ง Pull Request หรือเปิด Issue ได้ที่ https://github.com/jaturapornchai/bccrm (ดู [CONTRIBUTING.md](CONTRIBUTING.md))
เผยแพร่ภายใต้ **[MIT License](LICENSE)**

สร้างด้วย ❤️ เพื่อธุรกิจบริการไทย
