import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tillad billeder fra WooCommerce og Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kronborgmarinebaadudstyr.dk',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.com',
      },
    ],
  },
};

export default nextConfig;
