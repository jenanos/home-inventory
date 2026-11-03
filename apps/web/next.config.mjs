/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui", "@workspace/db"],
  async headers() {
    return [
      {
        // The OAuth consent screen is the one page where a click grants a
        // third party access, so it must never be framed or cached, and it
        // must not leak the request context through a referrer.
        source: "/oauth/consent",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ]
  },
}

export default nextConfig
