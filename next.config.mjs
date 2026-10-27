/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生成独立运行包，供 Dockerfile 使用
  output: "standalone",
  images: { unoptimized: true },
};

export default nextConfig;
