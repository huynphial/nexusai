import { Router, Response } from 'express';
import { query, getOne } from '../db';
import { authenticateToken, requireAdmin, CustomRequest } from '../auth';
import { isDebugEnabled } from '../logger';

const router = Router();
router.use(authenticateToken);

// Dashboard stats endpoint
router.get('/stats', async (req: CustomRequest, res: Response) => {
  try {
    const totalUsers = await getOne(`SELECT COUNT(*) as count FROM users`);
    const totalGroups = await getOne(`SELECT COUNT(*) as count FROM user_groups`);
    const totalModels = await getOne(`SELECT COUNT(*) as count FROM ai_models WHERE is_active = 1`);
    const totalMessages = await getOne(`SELECT COUNT(*) as count FROM chat_messages`);

    const tokensToday = await getOne(`
      SELECT COALESCE(SUM(tokens_count), 0) as total
      FROM token_usage_logs
      WHERE timestamp >= datetime('now', '-1 day')
    `);

    const tokensMonth = await getOne(`
      SELECT COALESCE(SUM(tokens_count), 0) as total
      FROM token_usage_logs
      WHERE timestamp >= datetime('now', '-30 day')
    `);

    const tokensByModel = await query(`
      SELECT m.name as model_name, m.provider, COALESCE(SUM(l.tokens_count), 0) as total_tokens
      FROM ai_models m
      LEFT JOIN token_usage_logs l ON m.id = l.model_id
      GROUP BY m.id, m.name, m.provider
      ORDER BY total_tokens DESC
    `);

    const tokensByGroup = await query(`
      SELECT g.name as group_name, COALESCE(SUM(l.tokens_count), 0) as total_tokens
      FROM user_groups g
      LEFT JOIN token_usage_logs l ON g.id = l.group_id
      GROUP BY g.id, g.name
      ORDER BY total_tokens DESC
    `);

    const dailyTrend = await query(`
      SELECT strftime('%Y-%m-%d', timestamp) as date, COALESCE(SUM(tokens_count), 0) as tokens
      FROM token_usage_logs
      WHERE timestamp >= datetime('now', '-7 day')
      GROUP BY strftime('%Y-%m-%d', timestamp)
      ORDER BY date ASC
    `);

    const recentLogs = await query(`
      SELECT l.id, l.tokens_count, l.timestamp,
             u.name as user_name, u.email as user_email,
             g.name as group_name,
             m.name as model_name
      FROM token_usage_logs l
      JOIN users u ON l.user_id = u.id
      JOIN user_groups g ON l.group_id = g.id
      JOIN ai_models m ON l.model_id = m.id
      ORDER BY l.id DESC
      LIMIT 10
    `);

    res.json({
      overview: {
        total_users: totalUsers ? totalUsers.count : 0,
        total_groups: totalGroups ? totalGroups.count : 0,
        total_models: totalModels ? totalModels.count : 0,
        total_messages: totalMessages ? totalMessages.count : 0,
        tokens_today: tokensToday ? tokensToday.total : 0,
        tokens_month: tokensMonth ? tokensMonth.total : 0
      },
      tokens_by_model: tokensByModel,
      tokens_by_group: tokensByGroup,
      daily_trend: dailyTrend,
      recent_logs: recentLogs
    });
  } catch (err: any) {
    console.error('[DashboardRoute] Stats error:', err);
    res.status(500).json({ error: 'Không thể lấy thông tin thống kê Dashboard.' });
  }
});

// Audit Logs endpoint (Admin only)
router.get('/audit-logs', requireAdmin, async (req: CustomRequest, res: Response) => {
  try {
    const logs = await query(`
      SELECT * FROM audit_logs
      ORDER BY id DESC
      LIMIT 50
    `);
    res.json({ audit_logs: logs });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tải nhật ký thao tác audit.' });
  }
});

// System .env and DB connection info monitor
router.get('/system-env', requireAdmin, async (req: CustomRequest, res: Response) => {
  try {
    const dbType = process.env.DB_TYPE || 'sqlite';
    const dbFile = process.env.DB_FILE || './data/database.sqlite';
    const port = process.env.PORT || '3000';
    const defaultAdmin = process.env.DEFAULT_ADMIN_EMAIL || 'admin@nexusai.io';
    const hasGeminiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';

    res.json({
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        DB_TYPE: dbType,
        DB_FILE: dbFile,
        PORT: port,
        DEFAULT_ADMIN_EMAIL: defaultAdmin,
        HAS_GEMINI_API_KEY: hasGeminiKey,
        JWT_SECRET_CONFIGURED: !!process.env.JWT_SECRET,
        DEBUG_LOG_ENABLED: isDebugEnabled()
      },
      status: 'Online',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi đọc cấu hình hệ thống.' });
  }
});

export default router;
