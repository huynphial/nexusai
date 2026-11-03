import { Router, Response } from 'express';
import { query, getOne, run } from '../db';
import { authenticateToken, CustomRequest } from '../auth';
import { checkRateLimitAndQuota, logTokenUsage } from '../rateLimiter';
import { generateAIChatResponse } from '../aiProvider';
import { logger } from '../logger';

const router = Router();
router.use(authenticateToken);

// Get available models assigned to the user's group, along with live quota usage
router.get('/available-models', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const groupId = req.user?.user_group_id;

    if (!groupId) {
      return res.json({ models: [] });
    }

    const models = await query(
      `
      SELECT m.id, m.name, m.provider, m.model_identifier, m.system_prompt, m.is_active,
             gma.rate_limit_period, gma.rate_limit_requests, gma.max_tokens_group, gma.max_tokens_per_user
      FROM ai_models m
      JOIN group_model_access gma ON m.id = gma.model_id
      WHERE gma.group_id = ? AND m.is_active = 1
      ORDER BY m.id ASC
      `,
      [groupId]
    );

    const modelsWithQuota = [];
    for (const m of models) {
      const quotaCheck = await checkRateLimitAndQuota(userId!, groupId, m.id);
      modelsWithQuota.push({
        ...m,
        system_prompt: m.system_prompt || '',
        quota: quotaCheck.usage,
        allowed: quotaCheck.allowed,
        disallow_reason: quotaCheck.reason
      });
    }

    res.json({ models: modelsWithQuota });
  } catch (err: any) {
    logger.error('ChatRoute', 'Get available models error', err);
    res.status(500).json({ error: 'Không thể lấy danh sách mô hình AI được phân quyền.' });
  }
});

// Get user chat sessions
router.get('/sessions', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const sessions = await query(
      `
      SELECT s.*, m.name as model_name, m.provider, m.model_identifier
      FROM chat_sessions s
      JOIN ai_models m ON s.model_id = m.id
      WHERE s.user_id = ?
      ORDER BY s.updated_at DESC
      `,
      [userId]
    );

    res.json({ sessions });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách phiên trò chuyện.' });
  }
});

// Create chat session
router.post('/sessions', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id!;
    const userEmail = req.user?.email!;
    const { model_id, title } = req.body;

    if (!model_id) {
      return res.status(400).json({ error: 'Vui lòng chọn mô hình AI.' });
    }

    const model = await getOne(`SELECT * FROM ai_models WHERE id = ?`, [model_id]);
    if (!model) {
      return res.status(404).json({ error: 'Mô hình AI không hợp lệ.' });
    }

    const sessionTitle = title ? title.trim() : `Cuộc trò chuyện mới - ${model.name}`;
    const result = await run(
      `INSERT INTO chat_sessions (user_id, model_id, title) VALUES (?, ?, ?)`,
      [userId, model_id, sessionTitle]
    );

    await logger.audit(userId, userEmail, 'CREATE_CHAT_SESSION', `Tạo phiên chat mới #${result.lastID} với ${model.name}`, req.ip);

    res.status(201).json({
      session: {
        id: result.lastID,
        user_id: userId,
        model_id,
        title: sessionTitle,
        model_name: model.name,
        provider: model.provider,
        model_identifier: model.model_identifier
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tạo cuộc trò chuyện mới.' });
  }
});

// Delete chat session
router.delete('/sessions/:id', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id!;
    const userEmail = req.user?.email!;
    const sessionId = parseInt(req.params.id, 10);

    await run(`DELETE FROM chat_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
    await run(`DELETE FROM chat_messages WHERE session_id = ?`, [sessionId]);

    await logger.audit(userId, userEmail, 'DELETE_CHAT_SESSION', `Xóa phiên trò chuyện #${sessionId}`, req.ip);

    res.json({ message: 'Đã xóa cuộc trò chuyện.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi xóa cuộc trò chuyện.' });
  }
});

// Get session messages
router.get('/sessions/:id/messages', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const sessionId = parseInt(req.params.id, 10);

    const session = await getOne(`SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
    if (!session) {
      return res.status(404).json({ error: 'Không tìm thấy cuộc trò chuyện.' });
    }

    const messages = await query(`SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC`, [sessionId]);

    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tải lịch sử tin nhắn.' });
  }
});

// Send message to LLM with Rate Limit & Token Limit enforcement
router.post('/send', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id!;
    const userEmail = req.user?.email!;
    const groupId = req.user?.user_group_id!;
    const { session_id, model_id, prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống.' });
    }

    let currentSessionId = session_id;
    let targetModelId = model_id;

    if (currentSessionId) {
      const session = await getOne(`SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?`, [currentSessionId, userId]);
      if (!session) {
        return res.status(404).json({ error: 'Không tìm thấy phiên trò chuyện này.' });
      }
      targetModelId = session.model_id;
    } else {
      if (!targetModelId) {
        return res.status(400).json({ error: 'Vui lòng chỉ định mô hình AI.' });
      }
    }

    const modelConfig = await getOne(`SELECT * FROM ai_models WHERE id = ? AND is_active = 1`, [targetModelId]);
    if (!modelConfig) {
      return res.status(404).json({ error: 'Mô hình AI này hiện không khả dụng hoặc đã bị ngưng hoạt động.' });
    }

    // Rate Limit Check
    const limitCheck = await checkRateLimitAndQuota(userId, groupId, targetModelId);
    if (!limitCheck.allowed) {
      await logger.audit(
        userId,
        userEmail,
        'RATE_LIMIT_BLOCKED',
        `Chặn truy vấn do vượt quá Quota mô hình ${modelConfig.name}: ${limitCheck.reason}`,
        req.ip
      );
      return res.status(429).json({
        error: limitCheck.reason || 'Đã vượt quá giới hạn truy cập.',
        usage: limitCheck.usage
      });
    }

    if (!currentSessionId) {
      const autoTitle = prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : '');
      const newSessionRes = await run(
        `INSERT INTO chat_sessions (user_id, model_id, title) VALUES (?, ?, ?)`,
        [userId, targetModelId, autoTitle]
      );
      currentSessionId = newSessionRes.lastID;
    }

    await run(
      `INSERT INTO chat_messages (session_id, sender, content, tokens_used) VALUES (?, 'user', ?, 0)`,
      [currentSessionId, prompt.trim()]
    );

    const history = await query(
      `SELECT sender as role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 10`,
      [currentSessionId]
    );
    history.reverse();

    // Call AI provider
    const aiResult = await generateAIChatResponse(modelConfig, history);

    const assistantMsgRes = await run(
      `INSERT INTO chat_messages (session_id, sender, content, tokens_used) VALUES (?, 'assistant', ?, ?)`,
      [currentSessionId, aiResult.content, aiResult.tokensUsed]
    );

    await logTokenUsage(userId, groupId, targetModelId, aiResult.tokensUsed);
    await run(`UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [currentSessionId]);

    await logger.audit(
      userId,
      userEmail,
      'SEND_LLM_PROMPT',
      `Gửi yêu cầu tới ${modelConfig.name} (${aiResult.tokensUsed} tokens tiêu thụ)`,
      req.ip
    );

    const updatedQuota = await checkRateLimitAndQuota(userId, groupId, targetModelId);

    res.json({
      session_id: currentSessionId,
      message: {
        id: assistantMsgRes.lastID,
        session_id: currentSessionId,
        sender: 'assistant',
        content: aiResult.content,
        tokens_used: aiResult.tokensUsed,
        created_at: new Date().toISOString()
      },
      updated_quota: updatedQuota.usage
    });
  } catch (err: any) {
    logger.error('ChatRoute', 'Send message error', err);
    res.status(500).json({ error: 'Lỗi khi xử lý tin nhắn với mô hình AI.' });
  }
});

export default router;
