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
        name: "Kallé Cortes",
        short_name: "Kallé Cortes",
        description: "Agendamentos da Kallé Cortes",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0b0b0c",
        theme_color: "#d4a84f",
        icons: [{ src: "/favicon-kc.png", sizes: "1536x1024", type: "image/png", purpose: "any" }],
      },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,ico}"] },
    }),
  ],
});
