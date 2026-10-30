import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Explicit override supports custom domains and deployments outside GitHub.
// For owner.github.io repositories GitHub serves at /; project sites use /repo/.
const [owner, repository] = process.env.GITHUB_REPOSITORY?.split("/") || [];
const githubBase = repository
  ? repository.toLowerCase() === `${owner}.github.io`.toLowerCase()
    ? "/"
    : `/${repository}/`
  : "./";
const base = process.env.VITE_BASE_PATH || githubBase;

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "FriendWeb — Your people, connected",
        short_name: "FriendWeb",
        description:
          "Your private, offline-ready 3D relationship map. No accounts or subscriptions.",
        theme_color: "#0b0d14",
        background_color: "#0b0d14",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // All runtime data lives in IndexedDB; no remote requests are cached.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\/assets\//, /\/[^/?]+\.[^/?]+$/],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/three/") ||
            id.includes("node_modules/three-")
          )
            return "three";
          if (
            id.includes("node_modules/react-force-graph") ||
            id.includes("node_modules/3d-force-graph") ||
            id.includes("node_modules/three-forcegraph")
          )
            return "force-graph";
        },
      },
    },
  },
});
