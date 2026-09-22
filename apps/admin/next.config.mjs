/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@bccrm/ui"],
  // prod: ADMIN_STATIC=1 → static export ให้ Caddy เสิร์ฟที่ admin.bcaicloud.com (ไม่ตั้ง = next start ปกติ ตาม Dockerfile)
  ...(process.env.ADMIN_STATIC === "1" && { output: "export" }),
};

export default nextConfig;
