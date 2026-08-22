import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Her Africa Table",
    short_name: "Africa Table",
    description:
      "A trusted community where African women meet, connect and grow together.",
    start_url: "/home?source=installed-app",
    scope: "/",
    display: "standalone",
    background_color: "#fffdf8",
    theme_color: "#5f1722",
    categories: ["business", "social", "lifestyle"],
    icons: [
      {
        src: "/icons/her-africa-table-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/her-africa-table-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/her-africa-table-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Your home",
        short_name: "Home",
        description: "Open your Her Africa Table home.",
        url: "/home?source=app-shortcut",
        icons: [{ src: "/icons/her-africa-table-192.png", sizes: "192x192" }],
      },
      {
        name: "Communities",
        short_name: "Communities",
        description: "Return to your Communities.",
        url: "/communities?source=app-shortcut",
        icons: [{ src: "/icons/her-africa-table-192.png", sizes: "192x192" }],
      },
      {
        name: "Events",
        short_name: "Events",
        description: "See upcoming Her Africa Table events.",
        url: "/events?source=app-shortcut",
        icons: [{ src: "/icons/her-africa-table-192.png", sizes: "192x192" }],
      },
    ],
  };
}
