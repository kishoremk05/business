import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        proxy: {
          '/send-sms': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/send-whatsapp': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/send-whatsapp-template': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/send-twilio-whatsapp': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/health': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/wa-verify': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
          '/wa-list-numbers': {
            target: 'http://localhost:3002',
            changeOrigin: true,
          },
        }
      }
    };
});
