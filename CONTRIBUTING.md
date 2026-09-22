# วิธีมีส่วนร่วมพัฒนา BCCRM (CONTRIBUTING)

ขอบคุณที่สนใจร่วมพัฒนา! โปรเจกต์นี้เป็น open source แบบ MIT — ทุกคนใช้ แก้ และส่งกลับมาได้เสรี

## วิธีเริ่ม

1. Fork repo แล้วโคลนลงเครื่อง
2. ทำตามขั้นตอน "เริ่มใช้งาน" ใน [README](README.md)
3. สร้าง branch จาก `main`: `git checkout -b feat/ชื่อฟีเจอร์` หรือ `fix/ชื่อบั๊ก`
4. เขียนโค้ด + ทดสอบ → เปิด Pull Request

## กติกาโค้ด

- **ภาษา:** TypeScript ทุกส่วน
- **คอมเมนต์และ docs:** ภาษาไทยได้เต็มที่ (กลุ่มเป้าหมายคือคนไทย) — ชื่อตัวแปร/ฟังก์ชันใช้อังกฤษ
- **Commit message:** รูปแบบ [Conventional Commits](https://www.conventionalcommits.org/) เช่น
  `feat(queue): เพิ่มกติกาดันคิวที่รอนานเกิน 30 นาที`
- ก่อน push: `pnpm lint && pnpm typecheck && pnpm test` ต้องผ่าน
- ฟีเจอร์ใหม่ที่แตะ queue-engine หรือ line-sdk ต้องมี unit test

## ขอบเขต package สำคัญ

| Package | ห้ามพลาด |
|---|---|
| `packages/queue-engine` | ออกเลขคิวต้องปลอดภัยต่อ race condition (ทดสอบ concurrent ทุกครั้ง) |
| `packages/line-sdk` | Flex template ทุกตัวต้องผ่าน LINE Flex Message Simulator |
| `apps/api` | endpoint ใหม่ต้องมี guard สิทธิ์ (RBAC) และ rate limit ที่ webhook |

## รายงานบั๊ก / เสนอฟีเจอร์

- เปิด issue พร้อม template ที่ให้ไว้ — เขียนไทยได้เลย
- บั๊กด้านความปลอดภัย (เช่น ข้อมูลลูกค้ารั่ว): **อย่า**เปิด issue สาธารณะ ให้ติดต่อ maintainer โดยตรง

## Code of Conduct

สุภาพ เคารพกัน ช่วยกัน — ร้านค้าไทยรอใช้งานอยู่ 🙏
