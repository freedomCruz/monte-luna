import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const apiAddr = process.env.API_ADDR;
const proxyTarget = apiAddr ? (apiAddr.startsWith('http') ? apiAddr : `http://${apiAddr}`) : undefined;

export default defineConfig({
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      strictPort: true,
      ...(proxyTarget
        ? {
            proxy: {
              '/api': {
                target: proxyTarget,
                // Keep the browser Host header so the backend cross-origin check (Go
                // CrossOriginProtection) sees Origin and Host match on any local host name.
                changeOrigin: false,
              },
            },
          }
        : {}),
    },
  },
});

