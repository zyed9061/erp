import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Invoice images for /api/ocr go through the auth proxy, which buffers bodies (10MB by default).
    // Leave headroom above the 10MB image limit for the multipart envelope.
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
