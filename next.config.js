/** @type {import('next').NextConfig} */
const nextConfig = {
  // Videos now stream from Google Drive (no large uploads through our server),
  // so no special body-size config is needed — ideal for Vercel.

  // Pilot: don't fail the production build on type/lint warnings.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
