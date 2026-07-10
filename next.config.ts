import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pakker der bruger Node.js-specifikke API'er (fs, path, __dirname osv.)
  // må IKKE bundtes af Next.js — de kræver Node.js runtime
  serverExternalPackages: [
    '@woocommerce/woocommerce-rest-api',
    'basic-ftp',
    'xlsx',
  ],

  // Tillad billeder fra alle HTTPS-domæner (leverandør-billeder fra Palby, Columbus, Engholm m.fl.)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http',  hostname: '**' },
    ],
  },
};

export default nextConfig;
