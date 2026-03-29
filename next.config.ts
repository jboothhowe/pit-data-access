import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return [];
    return [
      {
        source: "/api/v1/:path*",
        destination: `${supabaseUrl}/rest/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
