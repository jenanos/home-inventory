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
        //
        // `same-origin`, not `no-referrer`: under `no-referrer` the browser
        // sends `Origin: null` on the consent form POST, even though it is
        // same-origin (Fetch spec, "serializing a request origin"), and the
        // decision endpoint rightly refuses a null Origin. `same-origin` still
        // sends nothing to other origins, including the client's redirect URI.
        source: "/oauth/consent",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            // No `form-action`: browsers (Chrome first) apply it to the
            // redirect that follows the consent POST as well, so
            // `form-action 'self'` blocked the 303 to the client's redirect
            // URI and the code never reached the client. That target differs
            // per client (and `[::1]` loopback cannot be written as a CSP
            // source at all), and the page renders no untrusted markup, so
            // framing is the risk worth locking down.
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'",
          },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ]
  },
}

export default nextConfig
