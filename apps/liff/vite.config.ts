import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    // dev ต้องใช้ https ผ่าน tunnel (เช่น ngrok/cloudflared) เพื่อให้ LIFF เปิดใน LINE ได้
  },
});
