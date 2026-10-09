import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        id: "/admin",
        name: "BarbershopStyle Admin",
        short_name: "BarbershopStyle",
        description: "Painel administrativo BarbershopStyle",
        lang: "pt-BR",
        start_url: "/admin",
        scope: "/admin",
        display: "standalone",
        prefer_related_applications: false,
        background_color: "#0a0b0d",
        theme_color: "#d4a84f",
        icons: [
          {
            src: "/barbershopstyle-admin-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/barbershopstyle-admin-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/barbershopstyle-admin-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,ico}"] },
    }),
  ],
});
