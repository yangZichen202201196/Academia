/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 避免 Windows 下 `.next` 目录被占用/权限异常时可改用单独目录
  distDir: '.next14',
};

export default nextConfig;

