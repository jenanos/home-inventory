import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, DM_Serif_Display } from "next/font/google"

import "@workspace/ui/globals.css"
import { ServiceWorkerRegister } from "@/components/sw-register"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

export const metadata: Metadata = {
  title: {
    default: "Home Overview",
    template: "%s · Home Overview",
  },
  description: "Personlig app for å holde styr på hjem, prosjekter og økonomi.",
  applicationName: "Home Overview",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Home Overview",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1c25" },
  ],
}

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontHeading = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="no"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontHeading.variable,
        "font-sans"
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
