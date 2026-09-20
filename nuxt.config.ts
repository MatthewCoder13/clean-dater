export default defineNuxtConfig({
  compatibilityDate: '2026-08-26',
  ssr: false,
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  icon: {
    clientBundle: {
      scan: true,
    },
  },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    resolve: {
      // html2pdf.js використовує html2canvas, який не підтримує кольори
      // Tailwind v4 (oklch) — підставляємо сумісний форк html2canvas-pro
      alias: {
        html2canvas: 'html2canvas-pro',
      },
    },
    server: {
      strictPort: true,
    },
  },
  ignore: ['**/src-tauri/**'],
  imports: {
    dirs: ['constants'],
  },
});
