# HANDOFF — BCCRM (ส่งต่อให้ Claude ทำงานต่อ)

> อัปเดตล่าสุด: 2026-09-23 โดย Antigravity เพื่อส่งต่อให้ Claude ดูแลและพัฒนาต่อ
> โปรเจกต์: **BCCRM (ร้านอาหารโซมายด์ Seoulmind เชียงใหม่)**

---

## 1. ข้อมูลสำคัญและสถานะปัจจุบัน

- **Repository**: `D:\bccrm` (Monorepo: pnpm + Turbo)
- **Git Branch**: `dev`
- **Working Tree**: มีการแก้ไฟล์ระบบร้านอาหาร & เมนูใหม่ล่าสุด (ยังไม่ commit/push ตาม Rule 19 จนกว่าลุงจืดจะสั่ง)
  - Modified: `apps/api/package.json`, `apps/api/src/app.module.ts`, `apps/api/src/line/line-ai.service.ts`, `apps/api/src/queues/store/mongo-queue-store.ts`, `apps/liff/index.html`, `apps/liff/src/App.tsx`, `docker-compose.server.yml`, `pnpm-lock.yaml`
  - Untracked: `apps/api/src/menu/` (Menu module & JEV Cloud AI recommendation)

---

## 2. การปรับปรุงล่าสุด (ร้านอาหารโซมายด์ Seoulmind เชียงใหม่)

### 2.1 แบรนด์และคอนเซ็ปต์ร้าน
- **ชื่อร้าน**: **โซมายด์ (Seoulmind) เชียงใหม่**
- **ประเภท**: ร้านอาหารเกาหลี & บิงซู คาเฟ่ยอดนิยม
- **ที่ตั้ง**: 207 ซอยกาแล 1 หลังวัดอุโมงค์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ (เปิด 11:30 – 21:00 น.)

### 2.2 เมนูจริงของร้าน (Seeded 33 รายการ 6 หมวดหมู่)
เมนูเก่าที่สับสนถูกลบทิ้งทั้งหมด และเปลี่ยนเป็นเมนูจริงของ Seoulmind:
1. **ไก่ทอดเกาหลี (6 รายการ)**: ซอสเกาหลีเผ็ดหวาน (129.-), การ์ลิคซอย (129.-), สโนว์ออเนียน (149.-), ชีสลาวา (149.-), ออริจินัล (119.-), ปาร์ตี้เซ็ต 10 ชิ้น (239.-)
2. **อาหารเกาหลีจานหลัก (9 รายการ)**: ข้าวยำบิบิมบัมหมู (149.-), ข้าวผัดกิมจิไข่ดาวเยิ้ม (129.-), ต๊อกบกกีชีสลาวา (139.-), ราพ็อกกี (159.-), จูกุมิหมึกผัดเผ็ดกระทะร้อน (199.-), หม้อไฟบูเดชิเกะ (329.-), ซุปกิมจิหมูสามชั้น (149.-), ข้าวหมูบูลโกกิ (139.-), จับเช (129.-)
3. **ของทานเล่น & เครื่องเคียง (7 รายการ)**: คิมมารีทอดกรอบ (79.-), เฟรนช์ฟรายส์ชีส (89.-), เบคอนชีสฟรายส์ (99.-), มันดูทอด (89.-), หัวไชเท้าดองหวาน (29.-), กิมจิโฮมเมด (39.-), ข้าวเกาหลี (25.-)
4. **บิงซูซิกเนเจอร์อันดับ 1 เชียงใหม่ (5 รายการ)**: สตรอว์เบอร์รี่สดครีมชีสเค้ก (199.-), มะม่วงน้ำดอกไม้เสาวรส (189.-), ไมโลภูเขาไฟ (159.-), มัทฉะโมจิ (179.-), บัวลอยอัญชันมะพร้าวอ่อน (169.-)
5. **เครื่องดื่ม & สลัชชี่ (4 รายการ)**: สลัชชี่ชาไทยเกล็ดหิมะ (69.-), สลัชชี่ส้มยูซุโซดา (69.-), นมกล้วยเกาหลี (59.-), ชาพีชเลมอน (59.-)
6. **เซ็ตสุดคุ้ม (2 รายการ)**: ชุดดูโอ้ 2 ท่าน (319.-), ชุดปาร์ตี้บิงซู 3-4 ท่าน (699.-)

### 2.3 ฟีเจอร์ AI Recommendation ด้วย JEV Cloud
- ใช้งาน `@typesafe-ai/sdk` เชื่อมต่อ `https://api.typesafe.ai` โมเดล `jev-latest` (Key อยู่ใน env: `TYPESAFE_API_KEY`)
- Endpoint: `POST /api/menu/recommend-next` วิเคราะห์อาหารในตะกร้า แล้วแนะนำเมนูคู่หูที่เข้ากันอย่างเป็นธรรมชาติ (เช่น สั่งของคาว/เผ็ด แนะนำสลัชชี่หรือบิงซูดับเผ็ด)
- Order ID เปลี่ยนเป็นฟอร์แมต `SM-XXXX`

### 2.4 ระบบคิวหน้าร้าน & โต๊ะ
- ประเภทคิวใน Mongo Queue Store ปรับเป็น 4 โซนของร้านโซมายด์:
  - `A`: โต๊ะ 1-2 ท่าน (โซนคาเฟ่มินิมอล)
  - `B`: โต๊ะ 3-4 ท่าน (โซนครอบครัว/กลุ่มเพื่อน)
  - `C`: โต๊ะใหญ่ 5-8 ท่าน (โซนปาร์ตี้หม้อไฟ & บิงซู)
  - `T`: สั่งกลับบ้าน (Takeaway)

### 2.5 น้องบีซี (AI Chatbot ใน LINE OA)
- อัปเดตใน `apps/api/src/line/line-ai.service.ts` ให้มี Persona พนักงานต้อนรับร้านโซมายด์ เชียงใหม่ ตอบคำถามเมนู เวลาเปิด-ปิด ที่จอดรถ และแนะนำอาหารพร้อม Flex Message

### 2.6 Frontend LINE LIFF (`apps/liff`)
- ปรับธีม โลโก้ และหัวข้อเป็นร้านโซมายด์ (Seoulmind) เชียงใหม่
- เมนูบาร์ 6 หมวดหมู่ + ตัวเลือกปรับแต่ง (เลือกระดับความหวาน, ซอสไก่ทอด, ความเผ็ด)
- แท็บตรวจสอบคิวโต๊ะและโปรไฟล์ลูกค้า

---

## 3. Production & Server Details

- **Host IP**: `159.223.43.229` (SSH key root)
- **Path บน Server**: `/opt/bccrm/`
- **Reverse Proxy**: Caddy (จัดการ HTTPS อัตโนมัติ)
  - Route `/api/*`, `/webhooks/*`, `/health`, `/socket.io/*` -> `127.0.0.1:3501` (`bccrm-prod-api-1`)
  - Route อื่นๆ -> Static files ที่ `/opt/bccrm/apps/liff/dist/`
- **LIFF URL**: `https://liff.line.me/2009920675-GqteXbxD`
- **Domain**: `https://lineoahook.bcaicloud.com`

### วิธี Build และ Hot-Deploy รวดเร็ว (~5 วินาที)
```bash
# 1. Build local
pnpm --filter @bccrm/api build
pnpm --filter @bccrm/liff build

# 2. Deploy LIFF static files
scp -r apps/liff/dist root@159.223.43.229:/opt/bccrm/apps/liff/

# 3. Deploy API backend dist
scp -r apps/api/dist root@159.223.43.229:/opt/bccrm/apps/api/
ssh root@159.223.43.229 "docker cp /opt/bccrm/apps/api/dist/. bccrm-prod-api-1:/app/apps/api/dist/ && docker restart bccrm-prod-api-1"

# 4. Deploy Staff Dashboard → https://admin.bcaicloud.com (Caddy เสิร์ฟ out/ + proxy /api, /socket.io ไป 127.0.0.1:3501)
(cd apps/admin && ADMIN_STATIC=1 NEXT_PUBLIC_API_URL= npx next build)   # ต้องหยุด next dev ก่อน (ใช้ .next ร่วมกัน)
scp -r apps/admin/out root@159.223.43.229:/opt/bccrm/apps/admin/
```
> แก้ `/opt/bccrm/.env` แล้วต้อง recreate: `docker compose -p bccrm-prod -f docker-compose.server.yml up -d --no-build --no-deps api` แล้ว docker cp dist ซ้ำ (image มี dist เก่า)
> LINE push บน prod: เปิดเฉพาะตอนเรียกคิว (`ENABLE_LINE_PUSH=true`, `ENABLE_LINE_PUSH_ON_CALLED=true`), booking ยังปิด

---

## 4. สิ่งที่สามารถทำต่อได้ทันที (Next Steps สำหรับ Claude)

1. **Commit & Push ขึ้น Git**:
   - เมื่อลุงจืดสั่ง: ตรวจสอบความสะอาด ลบ dead code หรือ debug log (Rule 16) แล้ว commit ขึ้น `dev`
2. **LINE OA Rich Menu**:
   - ลุงจืดต้องการปรับแต่ง Rich Menu ให้เข้ากับร้านโซมายด์ แนะนำ 4 หรือ 6 ช่อง:
     1. สั่งอาหาร & ดูเมนู (เปิด LIFF: `https://liff.line.me/2009920675-GqteXbxD`)
     2. จองคิวโต๊ะหน้าร้าน
     3. คุยกับน้องบีซี (AI ผู้ช่วยร้าน)
     4. แผนที่ร้านหลังวัดอุโมงค์ & เวลาทำการ
3. **การสั่งอาหารและส่งเข้าครัว/ออกใบเสร็จ**:
   - ขยายระบบ Order ให้แจ้งเตือนเข้าห้องครัวหรือ LINE Notification ของร้าน
