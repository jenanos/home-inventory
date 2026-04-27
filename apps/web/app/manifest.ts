import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Overview",
    short_name: "Home Overview",
    description: "Personlig app for å holde styr på hjem, prosjekter og økonomi.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
