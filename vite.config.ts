import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Allow tunnel hosts (cloudflared, ngrok) when testing payment webhooks
      // from localhost. `.trycloudflare.com` / `.ngrok-free.app` covers any
      // dynamic subdomain those services assign us.
      allowedHosts: [
        '.trycloudflare.com',
        '.ngrok-free.app',
        '.ngrok.io',
        '.loca.lt',
      ],
    },
  };
});
