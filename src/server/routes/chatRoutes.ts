import { Router, Response } from 'express';
import { query, getOne, run } from '../db';
import { authenticateToken, CustomRequest } from '../auth';
import { checkRateLimitAndQuota, logTokenUsage } from '../rateLimiter';
import { generateAIChatResponse } from '../aiProvider';

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

    // Fetch active models accessible by this user group
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

    // Attach quota status for each model
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
    console.error('[ChatRoute] Get available models error:', err);
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
    const userId = req.user?.id;
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
    const userId = req.user?.id;
    const sessionId = parseInt(req.params.id, 10);

    await run(`DELETE FROM chat_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId]);
    await run(`DELETE FROM chat_messages WHERE session_id = ?`, [sessionId]);

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
    const groupId = req.user?.user_group_id!;
    const { session_id, model_id, prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống.' });
    }

    let currentSessionId = session_id;
    let targetModelId = model_id;

    // If session_id provided, verify ownership and fetch model_id
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

    // 1. Fetch model configuration
    const modelConfig = await getOne(`SELECT * FROM ai_models WHERE id = ? AND is_active = 1`, [targetModelId]);
    if (!modelConfig) {
      return res.status(404).json({ error: 'Mô hình AI này hiện không khả dụng hoặc đã bị ngưng hoạt động.' });
    }

    // 2. CHECK RATE LIMIT & TOKEN QUOTA
    const limitCheck = await checkRateLimitAndQuota(userId, groupId, targetModelId);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: limitCheck.reason || 'Đã vượt quá giới hạn truy cập.',
        usage: limitCheck.usage
      });
    }

    // 3. Create session if it doesn't exist yet
    if (!currentSessionId) {
      const autoTitle = prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : '');
      const newSessionRes = await run(
        `INSERT INTO chat_sessions (user_id, model_id, title) VALUES (?, ?, ?)`,
        [userId, targetModelId, autoTitle]
      );
      currentSessionId = newSessionRes.lastID;
    }

    // Save User message in database
    await run(
      `INSERT INTO chat_messages (session_id, sender, content, tokens_used) VALUES (?, 'user', ?, 0)`,
      [currentSessionId, prompt.trim()]
    );

    // Fetch conversation history (last 10 messages for context)
    const history = await query(
      `SELECT sender as role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 10`,
      [currentSessionId]
    );
    history.reverse(); // Chronological order

    // 4. CALL AI PROVIDER (Gemini or OpenAI Compatible)
    const aiResult = await generateAIChatResponse(modelConfig, history);

    // Save Assistant response in database
    const assistantMsgRes = await run(
      `INSERT INTO chat_messages (session_id, sender, content, tokens_used) VALUES (?, 'assistant', ?, ?)`,
      [currentSessionId, aiResult.content, aiResult.tokensUsed]
    );

    // 5. LOG TOKEN USAGE & UPDATE SESSION TIMESTAMPS
    await logTokenUsage(userId, groupId, targetModelId, aiResult.tokensUsed);
    await run(`UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [currentSessionId]);

    // Re-check updated quota statistics for response payload
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
    console.error('[ChatRoute] Send message error:', err);
    res.status(500).json({ error: 'Lỗi khi xử lý tin nhắn với mô hình AI.' });
  }
});

export default router;
