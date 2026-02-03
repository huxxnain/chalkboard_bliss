import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chalkboard Bliss",
    short_name: "Chalkboard",
    description: "A Progressive Web App by Hussnain Jutt",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#000000",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
