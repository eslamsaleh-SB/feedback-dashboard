/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow Server Actions / route bodies up to 20MB (default is 1MB).
    serverActions: { bodySizeLimit: "20mb" },
  },
  // Pilot: don't fail the production build on type/lint warnings.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
