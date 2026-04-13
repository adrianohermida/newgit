/** @type {import('next').NextConfig} */
const isStaticExport =
  process.env.CF_PAGES === "1" ||
  process.env.GITHUB_PAGES === "true" ||
  process.env.STATIC_EXPORT === "1" ||
  process.env.NEXT_OUTPUT_MODE === "export";

const nextConfig = {
  ...(isStaticExport ? { output: "export" } : {}),
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
  },
};

module.exports = nextConfig;
