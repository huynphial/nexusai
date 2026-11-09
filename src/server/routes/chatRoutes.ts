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
      SELECT m.id, m.name, m.provider, m.model_identifier, m.system_prompt,
             m.timeout_seconds, m.enable_stream, m.enable_thinking, m.is_active,
             gma.rate_limit_period, gma.rate_limit_requests, gma.max_tokens_group, gma.max_tokens_per_user
      FROM ai_models m
      JOIN group_model_access gma ON m.id = gma.model_id
      WHERE gma.group_id = ? AND m.is_active = 1
      ORDER BY m.id ASC
      `,
      [groupId]
    );

    const group = await getOne(`SELECT default_model_id FROM user_groups WHERE id = ?`, [groupId]);
    const defaultModelId = group?.default_model_id || null;

    const modelsWithQuota = [];
    for (const m of models) {
      const quotaCheck = await checkRateLimitAndQuota(userId!, groupId, m.id);
      modelsWithQuota.push({
        ...m,
        system_prompt: m.system_prompt || '',
        timeout_seconds: m.timeout_seconds || 60,
        enable_stream: m.enable_stream ?? 1,
        enable_thinking: m.enable_thinking ?? 1,
        is_default: m.id === defaultModelId,
        quota: quotaCheck.usage,
        allowed: quotaCheck.allowed,
        disallow_reason: quotaCheck.reason
      });
    }

    res.json({ models: modelsWithQuota, default_model_id: defaultModelId });
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

    const sessionTitle = title ? title.trim() : `Trò chuyện mới - ${model.name}`;
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

    const messages = await query(
      `SELECT id, session_id, sender, content, thinking_content, progress_steps, x_choices, tokens_used, latency_ms, tokens_per_second, created_at
       FROM chat_messages WHERE session_id = ? ORDER BY id ASC`,
      [sessionId]
    );

    const parsedMessages = messages.map((m: any) => ({
      ...m,
      progress_steps: m.progress_steps
        ? (() => {
            try {
              return JSON.parse(m.progress_steps);
            } catch {
              return undefined;
            }
          })()
        : undefined,
      x_choices: m.x_choices
        ? (() => {
            try {
              return JSON.parse(m.x_choices);
            } catch {
              return undefined;
            }
          })()
        : undefined,
    }));

    res.json({ messages: parsedMessages });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tải lịch sử tin nhắn.' });
  }
});

// Stream message to LLM using Server-Sent Events (SSE)
router.post('/stream', async (req: CustomRequest, res: Response) => {
  const userId = req.user?.id!;
  const userEmail = req.user?.email!;
  const groupId = req.user?.user_group_id!;
  const { session_id, model_id, prompt, enable_thinking } = req.body;

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
    return res.status(404).json({ error: 'Mô hình AI này hiện không khả dụng.' });
  }

  if (enable_thinking !== undefined) {
    modelConfig.enable_thinking = enable_thinking ? 1 : 0;
  }

  // Rate limit check
  const limitCheck = await checkRateLimitAndQuota(userId, groupId, targetModelId);
  if (!limitCheck.allowed) {
    await logger.audit(
      userId,
      userEmail,
      'RATE_LIMIT_BLOCKED',
      `Chặn truy vấn stream do vượt quá Quota: ${limitCheck.reason}`,
      req.ip
    );
    return res.status(429).json({
      error: limitCheck.reason || 'Đã vượt quá giới hạn truy cập.',
      usage: limitCheck.usage
    });
  }

  // Setup Server-Sent Events (SSE) headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (!currentSessionId) {
    const autoTitle = prompt.trim().substring(0, 30) + (prompt.trim().length > 30 ? '...' : '');
    const newSessionRes = await run(
      `INSERT INTO chat_sessions (user_id, model_id, title) VALUES (?, ?, ?)`,
      [userId, targetModelId, autoTitle]
    );
    currentSessionId = newSessionRes.lastID;
  }

  // Save user prompt
  await run(
    `INSERT INTO chat_messages (session_id, sender, content, tokens_used) VALUES (?, 'user', ?, 0)`,
    [currentSessionId, prompt.trim()]
  );

  const history = await query(
    `SELECT sender as role, content FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT 10`,
    [currentSessionId]
  );
  history.reverse();

  try {
    const userInfo = {
      name: req.user?.name,
      email: req.user?.email,
      id: req.user?.id,
      role: req.user?.role,
    };

    const aiResult = await generateAIChatResponse(
      modelConfig,
      history,
      (chunk) => {
        // Send chunk to client via SSE
        if (chunk.type === 'progress') {
          res.write(`data: ${JSON.stringify({ type: 'progress', step: chunk.step, summary: chunk.summary })}\n\n`);
        } else if (chunk.type === 'choices') {
          res.write(`data: ${JSON.stringify({ type: 'choices', choices: chunk.choices })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: chunk.type, text: chunk.text })}\n\n`);
        }
      },
      userInfo,
      currentSessionId
    );

    // Save assistant message to database with thinking content, progress steps, choices & performance metrics
    const assistantMsgRes = await run(
      `INSERT INTO chat_messages (session_id, sender, content, thinking_content, progress_steps, x_choices, tokens_used, latency_ms, tokens_per_second)
       VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
      [
        currentSessionId,
        aiResult.content,
        aiResult.thinking_content || null,
        aiResult.progress_steps ? JSON.stringify(aiResult.progress_steps) : null,
        aiResult.x_choices ? JSON.stringify(aiResult.x_choices) : null,
        aiResult.tokensUsed,
        aiResult.latency_ms,
        aiResult.tokens_per_second
      ]
    );

    await logTokenUsage(userId, groupId, targetModelId, aiResult.tokensUsed);
    await run(`UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [currentSessionId]);

    await logger.audit(
      userId,
      userEmail,
      'STREAM_LLM_PROMPT',
      `Hoàn thành stream tới ${modelConfig.name} (${aiResult.tokensUsed} tokens, ${aiResult.latency_ms}ms, ${aiResult.tokens_per_second} tk/s)`,
      req.ip
    );

    const updatedQuota = await checkRateLimitAndQuota(userId, groupId, targetModelId);

    const finalMessage = {
      id: assistantMsgRes.lastID,
      session_id: currentSessionId,
      sender: 'assistant',
      content: aiResult.content,
      thinking_content: aiResult.thinking_content || null,
      progress_steps: aiResult.progress_steps || undefined,
      progress_summary: aiResult.progress_summary || undefined,
      x_choices: aiResult.x_choices || undefined,
      tokens_used: aiResult.tokensUsed,
      latency_ms: aiResult.latency_ms,
      tokens_per_second: aiResult.tokens_per_second,
      created_at: new Date().toISOString()
    };

    res.write(`data: ${JSON.stringify({
      type: 'done',
      session_id: currentSessionId,
      message: finalMessage,
      updated_quota: updatedQuota.usage
    })}\n\n`);

    res.end();
  } catch (err: any) {
    logger.error('ChatRoute', 'Stream error', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Lỗi khi stream từ AI.' })}\n\n`);
    res.end();
  }
});

// Send message to LLM (non-streaming fallback)
router.post('/send', async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id!;
    const userEmail = req.user?.email!;
    const groupId = req.user?.user_group_id!;
    const { session_id, model_id, prompt, enable_thinking } = req.body;

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

    if (enable_thinking !== undefined) {
      modelConfig.enable_thinking = enable_thinking ? 1 : 0;
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

    const userInfo = {
      name: req.user?.name,
      email: req.user?.email,
      id: req.user?.id,
      role: req.user?.role,
    };

    // Call AI provider
    const aiResult = await generateAIChatResponse(modelConfig, history, undefined, userInfo, currentSessionId);

    const assistantMsgRes = await run(
      `INSERT INTO chat_messages (session_id, sender, content, thinking_content, progress_steps, x_choices, tokens_used, latency_ms, tokens_per_second)
       VALUES (?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
      [
        currentSessionId,
        aiResult.content,
        aiResult.thinking_content || null,
        aiResult.progress_steps ? JSON.stringify(aiResult.progress_steps) : null,
        aiResult.x_choices ? JSON.stringify(aiResult.x_choices) : null,
        aiResult.tokensUsed,
        aiResult.latency_ms,
        aiResult.tokens_per_second
      ]
    );

    await logTokenUsage(userId, groupId, targetModelId, aiResult.tokensUsed);
    await run(`UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [currentSessionId]);

    await logger.audit(
      userId,
      userEmail,
      'SEND_LLM_PROMPT',
      `Gửi yêu cầu tới ${modelConfig.name} (${aiResult.tokensUsed} tokens, ${aiResult.latency_ms}ms, ${aiResult.tokens_per_second} tk/s)`,
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
        thinking_content: aiResult.thinking_content || null,
        progress_steps: aiResult.progress_steps || undefined,
        progress_summary: aiResult.progress_summary || undefined,
        x_choices: aiResult.x_choices || undefined,
        tokens_used: aiResult.tokensUsed,
        latency_ms: aiResult.latency_ms,
        tokens_per_second: aiResult.tokens_per_second,
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
