import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, DM_Serif_Display } from "next/font/google"
import { cookies } from "next/headers"

import "@workspace/ui/globals.css"
import { ServiceWorkerRegister } from "@/components/sw-register"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"
import {
  COLOR_PALETTE_COOKIE,
  getColorPalette,
  parseColorPalette,
} from "@/lib/color-palettes"

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

async function readColorPalette() {
  return parseColorPalette((await cookies()).get(COLOR_PALETTE_COOKIE)?.value)
}

export async function generateViewport(): Promise<Viewport> {
  const { themeColor } = getColorPalette(await readColorPalette())
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: themeColor.light },
      { media: "(prefers-color-scheme: dark)", color: themeColor.dark },
    ],
  }
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const palette = await readColorPalette()

  return (
    <html
      lang="no"
      data-palette={palette}
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
