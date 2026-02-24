/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  typescript: {
    tsconfigPath: "./tsconfig.next.json"
  }
};

export default nextConfig;
