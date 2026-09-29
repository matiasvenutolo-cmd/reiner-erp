import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default de Next es 1 MB — muy poco para un plano o una foto de celular
    // subida como adjunto de ingeniería (ver src/app/actions/maestros.ts).
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
