import liff from "@line/liff";

/**
 * เริ่มต้น LIFF — คืน profile ของลูกค้าเมื่อ login แล้ว
 * อ่านคู่มือ: https://developers.line.biz/en/docs/liff/
 */
export async function initLiff() {
  const liffId = import.meta.env.VITE_LIFF_ID as string | undefined;
  if (!liffId) {
    // โหมด dev นอก LINE — ใช้ profile ปลอมเพื่อพัฒนา UI ต่อได้
    return { devMode: true as const, userId: "dev-user", displayName: "ผู้ใช้ทดสอบ" };
  }

  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login();
    return null; // จะ redirect ไปหน้า LINE login
  }

  const profile = await liff.getProfile();
  return { devMode: false as const, userId: profile.userId, displayName: profile.displayName };
}

export type LiffProfile = Awaited<ReturnType<typeof initLiff>>;
