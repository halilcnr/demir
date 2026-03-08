/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/shared'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.hepsiburada.com' },
      { protocol: 'https', hostname: '**.trendyol.com' },
      { protocol: 'https', hostname: '**.n11.com' },
      { protocol: 'https', hostname: '**.media-amazon.com' },
    ],
  },
};

export default nextConfig;
