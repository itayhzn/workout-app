/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Relative base + hash routing lets the build run from any GitHub Pages path.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Kinetic Workout",
        short_name: "Kinetic",
        description: "Personal workout tracker",
        theme_color: "#0B0C0E",
        background_color: "#0B0C0E",
        display: "standalone",
        start_url: "./",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // Config JSON: always try the network so edits show up; fall back to cache offline.
            urlPattern: ({ url }) => url.pathname.includes("/data/"),
            handler: "NetworkFirst",
            options: { cacheName: "config-json", networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes("/images/"),
            handler: "CacheFirst",
            options: { cacheName: "exercise-images", expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
