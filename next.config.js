/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow Server Actions / route bodies up to 20MB (default is 1MB).
    serverActions: { bodySizeLimit: "20mb" },
  },
};

module.exports = nextConfig;
