/// ค่าคงที่การเชื่อมต่อ backend
///
/// เปลี่ยนได้ตอนรันด้วย --dart-define เช่น
///   flutter run --dart-define=BCCRM_API_URL=http://192.168.1.10:3001
///
/// หมายเหตุสำหรับ emulator/device:
///  - Android emulator: ใช้ http://10.0.2.2:3001 (อ้างถึง localhost ของเครื่อง host)
///  - มือถือจริง: ใช้ IP เครื่อง dev ใน LAN เดียวกัน
library;

const String kApiBaseUrl = String.fromEnvironment(
  'BCCRM_API_URL',
  defaultValue: 'http://localhost:3001',
);

/// สาขา/เคาน์เตอร์เริ่มต้นของข้อมูลสาธิต (Phase 2 จะเลือกจากหน้าตั้งค่า)
const String kDefaultBranchId = 'demo';
const String kDefaultCounterId = 'counter-1';
