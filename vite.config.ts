import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appTitle = env.VITE_APP_TITLE?.trim() || 'Local AI';
  const appDescription =
    env.VITE_APP_DESCRIPTION?.trim() ||
    'Trợ lý trí tuệ nhân tạo hỗ trợ streaming thời gian thực, hiển thị quá trình suy luận (Thinking) và đo lường hiệu năng tốc độ xử lý token chi tiết.';

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-env-fallback',
        transformIndexHtml(html) {
          return html
            .replace(/%VITE_APP_TITLE%/g, appTitle)
            .replace(/%VITE_APP_DESCRIPTION%/g, appDescription);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: false,
      ws: false as const,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
