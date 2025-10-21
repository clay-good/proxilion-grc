/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: '../public',
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api',
  },
};

module.exports = nextConfig;

