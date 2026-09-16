# แผนออกแบบระบบ CRM + Queue สำหรับธุรกิจไทย (เชื่อม LINE OA)

> วันที่จัดทำ: 2026-09-16
> สถานะ: Draft v2 — เพิ่มกลยุทธ์ Open Source; รอยืนยันขอบเขตก่อนเริ่มพัฒนา

---

## 1. สรุปผู้บริหาร

สร้างแพลตฟอร์ม CRM สำหรับธุรกิจบริการไทย (คลินิก / ร้านทำผม / ร้านอาหาร / ศูนย์บริการ) ที่มีหัวใจ 3 ส่วน:

1. **ระบบคิว (Queue)** — รับคิวได้ 3 ช่องทาง: จองล่วงหน้าผ่าน LINE OA, Walk-in ผ่าน Kiosk แท็บเล็ตหน้าร้าน (Android/iPad), พนักงานเปิดคิวให้จากแอป
2. **CRM** — โปรไฟล์ลูกค้าผูกกับ LINE userId, ประวัติการใช้บริการ, สมาชิก/แต้มสะสม, แคมเปญ Broadcast
3. **หลังบ้าน** — Web Admin (Next.js) สำหรับ Super Admin/บริษัท + Mobile App สำหรับเจ้าของร้าน/ผู้จัดการ/พนักงาน

**ช่องทางที่ต่างจากคู่แข่ง:** คู่แข่งส่วนใหญ่ทำ "คิว" หรือ "LINE CRM" อย่างใดอย่างหนึ่ง ของเรารวมคิวหน้าร้าน (Kiosk) + คิวออนไลน์ (LINE) + CRM เข้าด้วยกันในข้อมูลลูกค้าคนเดียว และเปิดเป็น **Open Source** ให้ร้านค้า/นักพัฒนา self-host เองได้ฟรี — ซึ่งยังไม่มีผู้เล่นไทยรายไหนทำ

**โมเดลโปรเจกต์:** Open Source แบบ **MIT License — ฟรีทั้งหมด** (self-host ฟรี, ดัดแปลงได้, ทำการค้าได้ ไม่มีเงื่อนไขซ่อน)

---

## 2. ผลการค้นหา: มีคนทำแล้วหรือยัง และเขาทำอย่างไร

### 2.1 ระบบคิว + LINE OA (ไทย)

| ผู้เล่น | ทำอะไร | แนวทางเทคนิคที่เรียนรู้ได้ |
|---|---|---|
| **ระบบคิว.com (Queue On Cloud)** | คิว + จองล่วงหน้า + ประเมินความพึงพอใจในระบบเดียว เชื่อม LINE OA ลึก (แจ้งเตือนทุกจังหวะ: จองสำเร็จ/ใกล้ถึงคิว/ย้ายคิว/ยกเลิก), แยก LINE OA ต่อสาขา, Smart Queue (VIP/ด่วน/ดันคิวรอนาน) | รูปแบบการ์ดแจ้งเตือน (Flex Message) 10+ แบบ, ปฏิทินจองแสดงช่วงเวลาว่างจริงเขียว/เหลือง/แดง |
| **FoxConnect (iPlan Digital)** | ระบบจองคิว + CRM บน LINE OA โดยเฉพาะ เมนูบริการ + ปฏิทินจองอยู่ใน LINE ทั้งหมด ลูกค้าไม่ต้องโหลดแอป | ใช้ LIFF เป็นหน้าจอจองคิวใน LINE, ไม่มี native app ฝั่งลูกค้า |
| **Dolly Solutions** | ระบบคิว Hardware (ตู้กดบัตรคิว, จอแสดงผล, เสียงเรียก 3 ภาษา) + Online Queue ผ่าน LINE OA/SMS + API เชื่อม HIS/CRM | รูปแบบ Hybrid: hardware หน้าร้าน + คิวออนไลน์, แจ้งเตือนก่อนถึงคิว 10-20 นาที |
| **QueueBee (ตลาดไทย)** | QMS ระดับองค์กร: Kiosk หน้าร้าน + Virtual Queue ผ่านมือถือ + Customer Portal + Dashboard กลาง | สถาปัตยกรรม Kiosk + Web dashboard ศูนย์กลาง, รองรับหลายสาขา/หลายแผนก |
| **DLT Smart Queue (ภาครัฐ)** | แอปจองคิวกรมการขนส่ง + LINE OA | ตัวอย่าง scale ระดับประเทศ |

### 2.2 LINE CRM (ไทย)

| ผู้เล่น | ทำอะไร |
|---|---|
| **AIQ LineCRM (Audience IQ)** | แปลง LINE OA เป็น CRM: Rich Menu, Loyalty program, คูปองดิจิทัล, Customer Journey, Line Official Notification (LON) ส่งข้อความตามเบอร์โทรแทน SMS, เชื่อม POS/Salesforce ผ่าน API |
| **Communicat-O** | LINE OA เชื่อม CRM: bulk messaging แบบ personalize, real-time analytics |
| **Choco CRM / Wisible / SalePage** | CRM ไทยที่มี LINE OA integration เป็น feature มาตรฐาน (เก็บแชต, แท็กลูกค้า, broadcast) |

### 2.3 บทเรียนสำคัญจากตลาด

1. **LINE คือหน้าบ้านของลูกค้าไทย** — ทุกระบบที่สำเร็จไม่บังคับลูกค้าโหลดแอป ใช้ LIFF (LINE Front-end Framework) ทำหน้าจอจอง/เช็กคิวอยู่ในแชท LINE ทั้งหมด
2. **Flex Message คือประสบการณ์หลัก** — บัตรคิว, การ์ดแจ้งเตือน, สถานะเรียลไทม์ ส่งผ่าน Flex Message ไม่ใช่ข้อความธรรมดา
3. **คิวต้องรองรับ 3 โหมดพร้อมกัน** — จองล่วงหน้า (booking) / walk-in หน้าร้าน (kiosk) / พนักงานเปิดให้ — และต้อง "ผสานคิว" ไม่ให้เลขจองชนกับเลข walk-in
4. **Notification เป็น transaction ที่เสียเงิน** — Push message ผ่าน LINE มีต้นทุน (แพ็กเกจ Messaging API ตามจำนวนข้อความ) ต้องออกแบบนโยบายแจ้งเตือนให้ประหยัด เช่น รวมข้อความ, ใช้ LON, หรือให้ลูกค้ากดเช็กคิวเองผ่าน LIFF (ฟรี)
5. **Smart Queue เป็นจุดขาย** — VIP/คิวด่วน/ดันคิวที่รอนาน/skill-based routing เป็นสิ่งที่ระบบจ่ายเงินซื้อ
6. **PDPA** — ระบบที่เก็บข้อมูลลูกค้าไทยต้องมี consent flow ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล

---

## 3. ภาพรวมสถาปัตยกรรม

```
                        ┌─────────────────────────┐
                        │      LINE Platform       │
                        │  Messaging API · LIFF ·  │
                        │  Rich Menu · LON · Login │
                        └───────────┬─────────────┘
                                    │ webhook / push
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌─────────▼─────────┐       ┌─────────▼─────────┐
│  ลูกค้า (LINE)  │        │   Backend API      │       │  Kiosk หน้าร้าน    │
│  LIFF: จองคิว   │◄──────►│  (Node.js/NestJS)  │◄─────►│  Android/iPad      │
│  เช็กคิว สมาชิก │        │  Queue Engine      │ WS/   │  กดบัตรคิว/QR      │
└────────────────┘        │  CRM Engine        │ REST  │  จอแสดงคิว (TV)   │
                          │  Notification Hub  │       └───────────────────┘
┌────────────────┐        │  LINE Webhook Svc  │
│  Web Admin      │◄──────►│  Auth · Billing    │       ┌───────────────────┐
│  (Next.js)      │        └─────────┬─────────┘       │  Mobile App        │
│  Super Admin    │                  │                  │  (Flutter)         │
│  ตั้งค่าบริษัท  │        ┌─────────▼─────────┐       │  เจ้าของร้าน/ผจก./ │
└────────────────┘        │   PostgreSQL +     │◄─────►│  พนักงานเรียกคิว   │
                          │   Redis (คิวสด/ล็อก)│       └───────────────────┘
                          └───────────────────┘
```

### การไหลของข้อมูลหลัก (Data Flow)

**A. ลูกค้าจองผ่าน LINE**
ลูกค้ากด Rich Menu → LIFF เลือกบริการ/วันเวลา → Backend ออกเลขคิว → ส่ง Flex Message "บัตรคิว" → ใกล้ถึงคิวส่ง Push แจ้งเตือน → ถึงคิวเรียก

**B. Walk-in ผ่าน Kiosk หน้าร้าน**
ลูกค้ากดจอ Kiosk เลือกบริการ → (ทางเลือก) กรอกเบอร์/สแกน QR LINE เพื่อผูกโปรไฟล์ → Backend ออกเลขคิว → พิมพ์บัตรคิว/แสดงบนจอ TV → ถ้าผูก LINE แล้วรับแจ้งเตือนได้เหมือนคิวออนไลน์

**C. พนักงานเรียกคิว**
พนักงานกด "เรียกคิวถัดไป" จาก Mobile App หรือเว็บ → Queue Engine เลือกคิวตามกติกา → จอ TV แสดง + เสียงเรียก + Push ไปหาลูกค้า → บันทึกเวลารอ/เวลาบริการลง CRM

---

## 4. โครงสร้างระบบย่อย (Modules)

### 4.1 Queue Engine (แกนกลาง)
- ออกเลขคิวต่อสาขา/ต่อประเภทบริการ (A001, B002...) รีเซ็ตรายวัน
- ผสาน 3 แหล่งคิว: Booking (ล็อกช่วงเวลา) / Walk-in / คิวด่วน-VIP
- กติกาจัดลำดับ (config ได้): FIFO, priority score, ดันคิวที่รอเกิน X นาที, skill-based routing ไปเคาน์เตอร์ที่รับเรื่องนั้น
- State machine ของคิว: `booked → checked-in → waiting → called → serving → done / no-show / cancelled / transferred`
- Real-time update ผ่าน WebSocket (Socket.io) ไปยังจอ TV, Kiosk, แอปพนักงาน, LIFF
- Race condition: ใช้ Redis หรือ DB transaction + optimistic locking ตอนออกเลขคิว/เรียกคิว

### 4.2 CRM
- โปรไฟล์ลูกค้า: ผูก LINE userId เป็นตัวตนหลัก + เบอร์โทร (ทางเลือก)
- Consent PDPA: บันทึกการยินยอมก่อนเก็บข้อมูล
- ประวัติ: คิวที่เคยใช้, บริการที่ทำ, ยอดใช้จ่าย (ถ้าต่อ POS), คะแนนประเมิน
- แท็ก/กลุ่มเป้าหมาย (segment) สำหรับ broadcast
- สมาชิก/แต้มสะสม/คูปอง (Phase 2)
- แดชบอร์ด: เวลารอเฉลี่ย, no-show rate, คิวต่อชั่วโมง/วัน, ลูกค้าเก่า-ใหม่

### 4.3 LINE Integration Service
- Webhook receiver: follow/unfollow/message/postback events
- Flex Message templates: บัตรคิว, แจ้งใกล้ถึงคิว (ล่วงหน้า N คิว), เรียกคิว, ยกเลิก, ย้ายคิว, ประเมินความพึงพอใจ
- LIFF apps: (1) จองคิว (2) บัตรคิวของฉัน/เช็กคิวสด (3) โปรไฟล์สมาชิก
- Rich Menu ต่อสาขา (ผูกผ่าน LINE Official Account Manager)
- Multi-tenant: ร้านแต่ละร้าน/สาขาใช้ LINE OA ของตัวเอง (เก็บ channel token แยก tenant)
- นโยบายประหยัดโควต้าข้อความ: รวมแจ้งเตือน, เช็กคิวผ่าน LIFF แทน push, ตั้งได้ว่าแจ้งกี่ครั้ง

### 4.4 Kiosk หน้าร้าน (Android / iPad)
- โหมดกดบัตรคิว: เลือกบริการ → ออกเลข → พิมพ์ thermal printer (ESC/POS ผ่าน Bluetooth/LAN) หรือ QR ให้สแกนเข้า LINE
- โหมด Check-in: ลูกค้าที่จองไว้สแกน QR จากบัตรคิวใน LINE เพื่อยืนยันมาถึง
- โหมดจอแสดงคิว (TV/Signage): แสดงเลขที่กำลังเรียก + เสียงเรียกภาษาไทย (TTS)
- Kiosk mode: ล็อกแอปไม่ให้ออก (Android: kiosk policy/lock task mode, iPad: Guided Access)
- ทำงานออฟไลน์ชั่วคราวได้: เก็บคิว local แล้ว sync เมื่อเน็ตกลับมา
- เทคโนโลยีที่แนะนำ: **Flutter เดียวกันกับ Mobile App** (เหตุผลใน 5.2)

### 4.5 Web Admin (Next.js)
- สำหรับ: Super Admin (ผู้ให้บริการแพลตฟอร์ม) + Admin บริษัท/สาขา
- จัดการ tenant/ร้าน/สาขา/ผู้ใช้/สิทธิ์ (RBAC)
- ตั้งค่าบริการ, ช่วงเวลาเปิดจอง, เคาน์เตอร์, กติกาคิว
- ตั้งค่า LINE OA (channel id/secret/token), ออกแบบ Rich Menu/Flex template
- แดชบอร์ดรายงาน, ส่งออก Excel
- จัดการ billing/subscription ของร้าน (ถ้าขายเป็น SaaS)
- Tech: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, ต่อ API ตัวเดียวกับทุก client

### 4.6 Mobile App สำหรับ Admin/เจ้าของร้าน/ผู้จัดการ/พนักงาน
- สิทธิ์ตามบทบาท (RBAC):
  - **เจ้าของร้าน**: แดชบอร์ดยอดวันนี้, คิวคงค้าง, รายงาน, ตั้งค่าร้าน, ส่ง broadcast
  - **ผู้จัดการ**: จัดการคิววันนี้ (ย้าย/ยกเลิก/เรียกซ้ำ), จัดตารางพนักงาน, อนุมัติคิวด่วน
  - **พนักงาน (เคาน์เตอร์)**: เรียกคิว/รับคิว/เสร็จคิว, ดูโปรไฟล์ลูกค้าที่กำลังบริการ, บันทึกโน้ต
- Push notification ฝั่งร้าน (Firebase Cloud Messaging): คิวแน่นผิดปกติ, ลูกค้า VIP มาถึง
- ทำงาน real-time ผ่าน WebSocket เดียวกับระบบคิว

---

## 5. Tech Stack ที่เสนอ

| ส่วน | เทคโนโลยี | เหตุผล |
|---|---|---|
| Backend API | NestJS (Node.js + TypeScript) | ภาษาเดียวกับ Next.js, โครงสร้าง module ชัดเจน เหมาะทีมไทย |
| ฐานข้อมูล | **MongoDB** (driver ตรง ไม่ผ่าน ORM) | เลือกใช้แล้ว — เครื่อง dev มีอยู่ใน Docker; เหมาะกับข้อมูลคิว/ลูกค้าที่โครงยืดหยุ่น (PostgreSQL+Prisma เก็บไว้เป็นทางเลือกผ่าน DB_MODE=prisma) |
| Cache/Queue runtime | Redis | สถานะคิวสด, ล็อกตอนออกเลข, pub/sub |
| Background jobs | BullMQ (บน Redis) | งานแจ้งเตือนล่วงหน้า, ตัด no-show, รีเซ็ตเลขคิวรายวัน |
| Realtime | Socket.io | จอ TV/Kiosk/แอป/LIFF อัปเดตสด |
| Web Admin | Next.js + TypeScript + Tailwind + shadcn/ui | ตาม requirement, ecosystem ใหญ่ |
| Mobile App + Kiosk | **Flutter (ชุดเดียว)** | code เดียวออก Android + iOS + แท็บเล็ต kiosk; ต่อ printer Bluetooth/LAN ทำได้; ลดทีมพัฒนา |
| ทางเลือก Mobile | React Native (Expo) | ถ้าทีมถนัด React มากกว่า — แลกกับความยากเรื่อง native printer |
| LINE | Messaging API, LIFF v2, LINE Login, Flex Message, Rich Menu API, LON (ถ้าสมัครได้) | มาตรฐานของไทยทั้งหมด |
| Auth | JWT + LINE Login (ลูกค้า), Email/OTP (ฝั่งร้าน) | |
| Infra | Docker → เริ่มที่ VPS/Cloud เดียว (เช่น AWS Lightsail / DigitalOcean SG region), โตแล้วค่อยแยก | คุมต้นทุนช่วงแรก |
| Storage | S3-compatible (รูปโปรไฟล์, ไฟล์แนบ) | |

**หมายเหตุเรื่อง Flutter vs React Native:** Kiosk ต้องคุมเครื่องพิมพ์ thermal (ESC/POS) และ kiosk lock — Flutter มี plugin ครบกว่าและเสถียรกว่าบน Android tablet จีนราคาถูกที่ร้านไทยนิยมใช้ จึงเสนอ Flutter เป็นค่าเริ่มต้น แต่เปลี่ยนได้ถ้าทีมถนัด RN

---

## 6. โมเดลข้อมูลหลัก (คร่าว)

```
Tenant (ร้าน/บริษัท) ─┬─ Branch (สาขา) ─┬─ Service (ประเภทบริการ)
                     │                 ├─ Counter (ช่องบริการ)
                     │                 ├─ User (พนักงาน, role)
                     │                 └─ LineChannel (token ของสาขา)
                     ├─ Customer (ผูก lineUserId, เบอร์, consent)
                     ├─ QueueTicket (เลขคิว, แหล่งที่มา, state, timestamps)
                     ├─ Booking (ช่วงเวลาจองล่วงหน้า)
                     └─ Campaign/Broadcast, Point, Coupon (Phase 2)
```

QueueTicket เก็บเวลาครบทุกจังหวะ (createdAt, checkedInAt, calledAt, servedAt, doneAt) เพื่อคำนวณ wait time / service time ทำรายงาน

---

## 7. Roadmap แบ่งเฟส

### Phase 0 — Discovery & UX (2-3 สัปดาห์)
- เก็บ requirement ร้าน pilot 1-2 ร้าน (ประเภทธุรกิจที่เลือก เช่น คลินิก)
- วาด wireframe: LIFF จองคิว, Kiosk, แอปพนักงาน, Admin
- สมัคร/เตรียม LINE OA + Messaging API channel + LIFF app

### Phase 1 — MVP คิว (6-8 สัปดาห์)
- Backend: Queue engine + Booking + Redis realtime
- LIFF: จองคิว + บัตรคิว + เช็กคิวสด
- Kiosk Android: กดบัตรคิว + check-in QR + จอแสดงคิว
- Mobile app: พนักงานเรียกคิว/ปิดคิว (role เดียวก่อน)
- Web Admin: ตั้งค่าร้าน/บริการ/ผู้ใช้ + ดูคิววันนี้
- แจ้งเตือน LINE พื้นฐาน: จองสำเร็จ, ใกล้ถึงคิว, เรียกคิว
- **ทดลองร้าน pilot จริง**

### Phase 2 — CRM (4-6 สัปดาห์)
- โปรไฟล์ลูกค้า + ประวัติ + consent PDPA
- แท็ก/segment + broadcast ผ่าน LINE
- แดชบอร์ดรายงาน (เวลารอ, no-show, KPI พนักงาน)
- RBAC ครบ: เจ้าของ/ผู้จัดการ/พนักงาน
- iPad kiosk + iOS app

### Phase 3 — เชิงพาณิชย์ (4-6 สัปดาห์)
- สมาชิก/แต้ม/คูปอง, ประเมินความพึงพอใจ
- Smart queue (VIP/ด่วน/skill routing)
- Multi-tenant billing (SaaS subscription), PromptPay รับเงินค่าบริการ (ถ้าต้องการ)
- Offline mode kiosk, เสียงเรียก TTS ไทย
- Scale infra: แยก service, monitoring (Grafana/Sentry)

---

## 8. ความเสี่ยงและข้อควรระวัง

| ความเสี่ยง | แนวทางลด |
|---|---|
| โควต้า/ค่าใช้จ่าย LINE Messaging API พุ่งตามจำนวนร้าน | ออกแบบนโยบายแจ้งเตือนประหยัดตั้งแต่ต้น; ให้เช็กคิวผ่าน LIFF; คิดค่าบริการร้านตามแพ็กเกจข้อความ |
| เน็ตหน้าร้านหลุด | Kiosk offline mode + บัตรคิวกระดาษสำรอง |
| เลขคิวชนกันเมื่อหลายช่องทางออกพร้อมกัน | ออกเลขที่ backend จุดเดียว + transaction/lock |
| PDPA | consent flow + สิทธิ์ลบข้อมูล + นโยบายเก็บข้อมูลชัดเจน |
| Hardware หน้าร้านหลากรุ่น (tablet จีน, printer หลายยี่ห้อ) | กำหนด spec อุปกรณ์ที่รองรับ + ทำ printer abstraction layer |
| Apple App Store review สำหรับ kiosk/signage app | ใช้ Guided Access แทน kiosk lock; แยก build config |

---

## 9. คำถามที่ต้องตัดสินใจก่อนเริ่ม

1. **กลุ่มธุรกิจเป้าหมายแรก** — คลินิก / ร้านทำผม / ร้านอาหาร / ศูนย์บริการรถ? (flow คิวต่างกัน)
2. **License** — ✅ ตัดสินใจแล้ว: MIT (ฟรีทั้งหมด)
3. **Mobile app** — ✅ ตัดสินใจแล้ว: **Flutter** (scaffold ไว้ที่ `apps/mobile` แล้ว — ชุดเดียวออก Android + iOS + Kiosk แท็บเล็ต)
4. **Kiosk** — ต้องพิมพ์บัตรคิวกระดาษจริงไหม หรือ QR เข้า LINE พอ? (กระทบต้นทุน hardware)
5. **รายได้ระยะยาว** — จะทำ hosted cloud ของตัวเองไหม หรือพึ่ง donation/บริการติดตั้งอย่างเดียว?
6. **งบและทีม** — มีทีมกี่คน ถนัด stack ไหน เพื่อปรับ roadmap ให้จริง

---

## 10. กลยุทธ์ Open Source

### 10.1 License ที่เลือก: **MIT** ✅

ตัดสินใจแล้ว (2026-09-16): ใช้ **MIT License** — ฟรีทั้งหมด ใครก็เอาไปใช้ ดัดแปลง และทำการค้าได้โดยไม่ต้องเปิด source คืน

| ข้อดี | ข้อแลกเปลี่ยนที่ยอมรับ |
|---|---|
| adopt ง่ายสุด ร้านค้า/บริษัท/ภาครัฐเอาไปใช้ได้ไม่ติดขัดกฎหมาย | คู่แข่งเอาไปห่อขายได้ — ชนะด้วย community และคุณภาพแทนกฎหมาย |
| เหมาะกับเป้าหมาย "มาตรฐานกลางระบบคิว+LINE ของไทย" | รายได้ต้องมาจากบริการ (hosting/ติดตั้ง/support) ไม่ใช่การล็อกฟีเจอร์ |
| ดึง contributor ง่ายกว่า copyleft | — |

ฟีเจอร์ LINE/LIFF ผูกกับบัญชี LINE OA ของผู้ใช้เอง (แต่ละร้านใช้ channel token ของตัวเอง) จึงไม่มีปัญหาเรื่องการแจก credentials ในโค้ดเปิด ทุกฟีเจอร์เปิดหมด ไม่มี enterprise layer ปิด

### 10.2 โครงสร้าง Repository (Monorepo เดียว)

```
bccrm/                        (Turborepo / pnpm workspace)
├── apps/
│   ├── api/                  NestJS backend + Queue engine
│   ├── admin/                Next.js Web Admin
│   ├── liff/                 LIFF apps (จองคิว/บัตรคิว/สมาชิก)
│   └── mobile/               Flutter (app พนักงาน + kiosk + signage)
├── packages/
│   ├── queue-engine/         ตรรกะคิว (แยกเป็น lib ให้ community reuse)
│   ├── line-sdk/             Flex templates, webhook helpers ภาษาไทย
│   ├── database/             Prisma schema + migrations
│   └── ui/                   shared components
├── docs/                     (ภาษาไทย + อังกฤษ)
├── docker-compose.yml        self-host คำสั่งเดียวขึ้นระบบ
├── LICENSE
├── CONTRIBUTING.md
└── README.md                 (ไทยเป็นหลัก เพราะกลุ่มเป้าหมายคือร้านไทย)
```

### 10.3 เป้าหมายของการเปิด Source

1. **Self-host ง่ายที่สุดในตลาดไทย** — `docker compose up` ครั้งเดียวได้ทั้งระบบ (Postgres + Redis + API + Admin) ร้านเล็ก host เองบน VPS 300 บาท/เดือนได้
2. **Plugin/Integration จาก community** — เช่น connector ไป POS ไทย (FoodStory, Ocha POS), ระบบสมาชิก, การพิมพ์เครื่อง printer หลายยี่ห้อ
3. **ภาษาไทยเป็นพลเมืองชั้นหนึ่ง** — docs, README, Flex Message template, เสียงเรียกคิว ทั้งหมดทำไทยก่อนอังกฤษ
4. **Trust เรื่องข้อมูล** — ร้านค้าไทยระแวงข้อมูลลูกค้ารั่ว; open source ตรวจสอบได้ = จุดขายด้าน PDPA

### 10.4 โมเดลรายได้ (ทุกฟีเจอร์ฟรี — รายได้จากบริการเท่านั้น)

- **Hosted Cloud (ถ้าทำ)** — เรา host ให้ร้านที่ไม่อยากดูแลเอง คิดค่าโฮสต์/ดูแล ไม่ใช่ค่าซอฟต์แวร์
- **บริการติดตั้ง/ปรับแต่ง/on-premise** — โรงพยาบาล, หน่วยงานราชการ, ร้านที่ต้องการ customization
- **Donation / Sponsor** — GitHub Sponsors สำหรับค่าเซิร์ฟเวอร์พัฒนา
- ไม่มี enterprise layer ปิด — billing, SSO, audit log ถ้าทำก็เปิดใน repo เดียวกันหมด

### 10.5 การดูแล Community

- GitHub: issue template ภาษาไทย, label `good first issue`, roadmap เปิดใน Projects
- Release ผ่าน GitHub Releases + Docker Hub image ทุก tag
- CI: GitHub Actions (lint/test/build ทุก PR) — ตั้งแต่ commit แรก เพราะโปรเจกต์เปิดจะมี contributor ภายนอก
- ช่องทางคุย: GitHub Discussions + กลุ่ม LINE Open Chat สำหรับร้านค้าไทย

### 10.6 ผลกระทบต่อ Roadmap

- **Phase 0** เพิ่ม: ตั้ง repo สาธารณะ, เลือก license, เขียน CONTRIBUTING.md, ตั้ง CI
- **Phase 1** เพิ่ม: docker-compose self-host ต้องทำงานได้ตั้งแต่ MVP (ไม่ใช่ทีหลัง) เพราะคือประตูหลักของ adoption
- **Phase 3** ปรับ: ฟีเจอร์ billing/SaaS แยกเป็น enterprise layer ไม่ปะปน core ที่เปิด source
