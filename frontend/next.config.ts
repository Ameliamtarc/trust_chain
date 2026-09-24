import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    const backendUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    return [{ source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
