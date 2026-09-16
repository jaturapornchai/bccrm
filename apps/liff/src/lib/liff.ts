import liff from "@line/liff";

export interface LiffUserData {
  devMode: boolean;
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

/**
 * เริ่มต้น LIFF — คืน profile ของลูกค้าเมื่อ login แล้ว
 * อ่านคู่มือ: https://developers.line.biz/en/docs/liff/
 */
export async function initLiff(): Promise<LiffUserData | null> {
  const liffId = import.meta.env.VITE_LIFF_ID as string | undefined;

  const getDevProfile = (): LiffUserData => {
    const savedUserId = localStorage.getItem("bccrm_dev_userid") || "Udev001";
    const savedName = localStorage.getItem("bccrm_dev_name") || "คุณลูกค้า (ทดสอบ)";
    return {
      devMode: true,
      userId: savedUserId,
      displayName: savedName,
      pictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${savedUserId}`,
    };
  };

  if (!liffId) {
    return getDevProfile();
  }

  try {
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      if (!liff.isInClient() && typeof window !== "undefined" && window.location.hostname === "localhost") {
        return getDevProfile();
      }
      liff.login();
      return null; // redirecting to line login
    }

    const profile = await liff.getProfile();
    return {
      devMode: false,
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    };
  } catch (err) {
    console.warn("LIFF init fallback to dev mode:", err);
    return getDevProfile();
  }
}

export type LiffProfile = LiffUserData | null;
