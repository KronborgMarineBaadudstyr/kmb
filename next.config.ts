import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pakker der bruger Node.js-specifikke API'er (fs, path, __dirname osv.)
  // må IKKE bundtes af Next.js — de kræver Node.js runtime
  serverExternalPackages: [
    '@woocommerce/woocommerce-rest-api',
    'basic-ftp',
    'xlsx',
  ],

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
