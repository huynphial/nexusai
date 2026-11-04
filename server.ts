import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './src/server/db';
import { logger } from './src/server/logger';
import authRoutes from './src/server/routes/authRoutes';
import userRoutes from './src/server/routes/userRoutes';
import groupRoutes from './src/server/routes/groupRoutes';
import modelRoutes from './src/server/routes/modelRoutes';
import chatRoutes from './src/server/routes/chatRoutes';
import dashboardRoutes from './src/server/routes/dashboardRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request logging middleware to full_yyyy-mm-dd.log
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP', `${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms) - IP: ${req.ip || '127.0.0.1'}`);
    });
  }
  next();
});

// Initialize Database schema and seed data
initDatabase();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/admin/models', modelRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Local AI Server', timestamp: new Date().toISOString() });
});

// Configure Vite integration for Development vs Production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false as const,
      },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        const indexHtmlPath = path.resolve(__dirname, 'index.html');
        let htmlStr = fs.existsSync(indexHtmlPath)
          ? fs.readFileSync(indexHtmlPath, 'utf-8')
          : `<!doctype html><html><head><title>NexusAI</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;
        let template = await vite.transformIndexHtml(url, htmlStr);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    // Serve static files in production (handles running from root or from inside dist/)
    const staticDir = fs.existsSync(path.resolve(__dirname, 'index.html'))
      ? __dirname
      : path.resolve(__dirname, 'dist');

    console.log(`[Server] Production mode: serving static assets from ${staticDir}`);
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.resolve(staticDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] NexusAI LLM Chat App running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
});
