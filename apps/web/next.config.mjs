/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui", "@workspace/db"],
  async redirects() {
    // The maintenance page became the projects page (ADR 0006). Old
    // bookmarks and links keep working.
    return [
      {
        source: "/vedlikehold",
        destination: "/prosjekter",
        permanent: true,
      },
      {
        source: "/vedlikehold/:path*",
        destination: "/prosjekter/:path*",
        permanent: true,
      },
    ]
  },
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
