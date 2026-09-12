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
    server: {
      strictPort: true,
    },
  },
  ignore: ['**/src-tauri/**'],
});
