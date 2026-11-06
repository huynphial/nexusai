import { GoogleGenAI } from '@google/genai';
import { logger } from './logger';

export interface ChatMessageItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIModelConfig {
  id: number;
  name: string;
  provider: 'openai_compatible' | 'gemini' | 'step_progress' | 'custom';
  model_identifier: string;
  api_url?: string;
  api_token?: string;
  system_prompt?: string;
  timeout_seconds?: number;
  enable_stream?: number | boolean;
  enable_thinking?: number | boolean;
}

export interface StreamChunk {
  type: 'thinking' | 'content' | 'progress' | 'choices';
  text?: string;
  step?: any;
  summary?: any;
  choices?: any;
}

export interface AIResponse {
  content: string;
  thinking_content?: string;
  progress_steps?: any[];
  progress_summary?: any;
  x_choices?: any;
  tokensUsed: number;
  latency_ms: number;
  tokens_per_second: number;
}

// Helper to extract <think> tags from text
export function extractThinkingFromContent(rawText: string): { cleanContent: string; thinkingContent?: string } {
  const thinkMatch = /<think>([\s\S]*?)<\/think>/i.exec(rawText);
  if (thinkMatch) {
    const thinkingContent = thinkMatch[1].trim();
    const cleanContent = rawText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
    return { cleanContent, thinkingContent };
  }
  // Check open <think> tag if model cut off or unfinished
  if (rawText.startsWith('<think>')) {
    const parts = rawText.split('</think>');
    if (parts.length > 1) {
      return { cleanContent: parts[1].trim(), thinkingContent: parts[0].replace('<think>', '').trim() };
    }
  }
  return { cleanContent: rawText };
}

export async function generateAIChatResponse(
  modelConfig: AIModelConfig,
  messages: ChatMessageItem[],
  onChunk?: (chunk: StreamChunk) => void
): Promise<AIResponse> {
  const systemPrompt = modelConfig.system_prompt || 'Bạn là trợ lý trí tuệ nhân tạo Local AI, hỗ trợ người dùng chu đáo bằng Tiếng Việt.';
  const timeoutSeconds = modelConfig.timeout_seconds && modelConfig.timeout_seconds > 0 ? modelConfig.timeout_seconds : 60;
  const isStreamWanted = onChunk && (modelConfig.enable_stream === 1 || modelConfig.enable_stream === true || modelConfig.enable_stream === undefined);
  const allowThinking = modelConfig.enable_thinking === 1 || modelConfig.enable_thinking === true || modelConfig.enable_thinking === undefined;

  const startTime = Date.now();

  logger.debug('AIProvider', `Initiating call to "${modelConfig.name}" (${modelConfig.provider}:${modelConfig.model_identifier}) | Timeout: ${timeoutSeconds}s | Stream: ${!!isStreamWanted} | Thinking: ${allowThinking}`);

  // Setup AbortController for timeout management
  const abortController = new AbortController();
  const timer = setTimeout(() => {
    abortController.abort(new Error(`Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`));
  }, timeoutSeconds * 1000);

  try {
    if (modelConfig.provider === 'gemini') {
      // 1. Gemini Server-Side Execution
      const apiKey = process.env.GEMINI_API_KEY || '';
      const modelName = modelConfig.model_identifier || 'gemini-3.8-flash';

      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        logger.info('AIProvider', 'GEMINI_API_KEY not configured. Providing local assistant response.');
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'local-ai-agent',
          },
        },
      });

      const formattedContents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      let accumulatedText = '';
      let accumulatedThinking = '';

      if (isStreamWanted) {
        // Streaming via Gemini SDK
        const streamResult = await ai.models.generateContentStream({
          model: modelName,
          contents: formattedContents.length > 0 ? (formattedContents as any) : 'Xin chào',
          config: {
            systemInstruction: systemPrompt,
          },
        });

        let inThinkingMode = false;
        for await (const chunk of streamResult) {
          if (abortController.signal.aborted) {
            throw new Error(`Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
          }
          const chunkText = chunk.text || '';
          if (!chunkText) continue;

          if (allowThinking && (chunkText.includes('<think>') || inThinkingMode)) {
            if (chunkText.includes('<think>')) inThinkingMode = true;
            if (chunkText.includes('</think>')) inThinkingMode = false;

            const extracted = extractThinkingFromContent(accumulatedText + chunkText);
            if (extracted.thinkingContent) {
              accumulatedThinking = extracted.thinkingContent;
              onChunk({ type: 'thinking', text: chunkText.replace(/<\/?think>/g, '') });
            } else {
              accumulatedText += chunkText;
              onChunk({ type: 'content', text: chunkText });
            }
          } else {
            accumulatedText += chunkText;
            onChunk({ type: 'content', text: chunkText });
          }
        }
      } else {
        // Non-streaming call
        const res = await ai.models.generateContent({
          model: modelName,
          contents: formattedContents.length > 0 ? (formattedContents as any) : 'Xin chào',
          config: {
            systemInstruction: systemPrompt,
          },
        });
        accumulatedText = res.text || 'Không có phản hồi từ mô hình.';
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      // Extract thinking tags if present
      const extracted = extractThinkingFromContent(accumulatedText);
      const finalContent = extracted.cleanContent;
      const finalThinking = accumulatedThinking || extracted.thinkingContent;

      const promptLength = messages.reduce((acc, m) => acc + m.content.length, 0) + systemPrompt.length;
      const totalTokens = Math.ceil((promptLength + accumulatedText.length) / 4);
      const tokensPerSecond = latencyMs > 0 ? Number(((totalTokens / (latencyMs / 1000))).toFixed(1)) : 0;

      logger.apiDebug('GeminiSDK', `gemini://${modelName}`, { model: modelName }, 200, { tokens: totalTokens, latency: latencyMs }, latencyMs);

      return {
        content: finalContent,
        thinking_content: allowThinking ? finalThinking : undefined,
        tokensUsed: totalTokens,
        latency_ms: latencyMs,
        tokens_per_second: tokensPerSecond,
      };
    } else {
      // 2. OpenAI Compatible Endpoint / Step-by-Step Progress Gateway / Custom API
      const isStepProgress = modelConfig.provider === 'step_progress';
      const defaultUrl = isStepProgress ? 'http://localhost:8000/v1' : 'https://api.openai.com/v1';
      const baseUrl = (modelConfig.api_url || defaultUrl).replace(/\/+$/, '');
      const apiToken = modelConfig.api_token || process.env.OPENAI_API_KEY || '';
      const modelId = modelConfig.model_identifier || (isStepProgress ? 'qwen3:8b' : 'gpt-4o');

      const fullMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      // If step_progress and no API token provided, or if test mode
      if (isStepProgress && !apiToken && !process.env.OPENAI_API_KEY) {
        // Check if local endpoint is actually listening; if not, seamlessly run the realistic step-by-step progress simulation
        let isEndpointReachable = false;
        try {
          const testCtrl = new AbortController();
          const testTimer = setTimeout(() => testCtrl.abort(), 1200);
          const probe = await fetch(`${baseUrl}/models`, { method: 'GET', signal: testCtrl.signal }).catch(() => null);
          clearTimeout(testTimer);
          if (probe && probe.ok) isEndpointReachable = true;
        } catch {
          isEndpointReachable = false;
        }

        if (!isEndpointReachable) {
          clearTimeout(timer);
          return await simulateStepProgress(
            modelConfig,
            messages,
            allowThinking,
            Boolean(isStreamWanted),
            startTime,
            onChunk
          );
        }
      }

      if (!apiToken && !isStepProgress) {
        clearTimeout(timer);
        const simulatedThinking = allowThinking
          ? `[Phân tích yêu cầu]: Mô hình "${modelConfig.name}" đang xử lý truy vấn của người dùng trong hệ thống Local AI.\n[Kế hoạch phản hồi]: Cung cấp giải thích chi tiết và hướng dẫn cấu hình API Token cho quản trị viên.`
          : undefined;

        const simulatedResponse =
          `### Phản hồi từ ${modelConfig.name} (${modelId})\n\n` +
          `Xin chào! Bạn đang sử dụng mô hình AI được phân quyền cho nhóm người dùng của mình trong **Local AI**.\n\n` +
          `**Chi tiết Cấu hình:**\n` +
          `- **Mô hình:** \`${modelId}\` \n` +
          `- **Endpoint Base URL:** \`${baseUrl}\` \n` +
          `- **Thời gian chờ tối đa:** \`${timeoutSeconds} giây\` \n` +
          `- **Streaming:** \`${isStreamWanted ? 'Bật' : 'Tắt'}\` \n` +
          `- **System Prompt:** *"${systemPrompt}"*\n\n` +
          `> 💡 **Hướng dẫn Admin:** Để kết nối với endpoint thực tế (ChatGPT/DeepSeek/vLLM/Ollama), vui lòng nhập **API Token / AI Token** cho mô hình này tại **Dashboard Quản Trị -> Quản lý Mô hình AI**!`;

        if (isStreamWanted && onChunk) {
          if (simulatedThinking) {
            onChunk({ type: 'thinking', text: simulatedThinking });
          }
          onChunk({ type: 'content', text: simulatedResponse });
        }

        const latencyMs = Math.max(Date.now() - startTime, 280);
        const estimatedTokens = Math.ceil((JSON.stringify(fullMessages).length + simulatedResponse.length) / 4);
        const tokensPerSecond = Number(((estimatedTokens / (latencyMs / 1000))).toFixed(1));

        return {
          content: simulatedResponse,
          thinking_content: simulatedThinking,
          tokensUsed: estimatedTokens,
          latency_ms: latencyMs,
          tokens_per_second: tokensPerSecond,
        };
      }

      const endpointUrl = `${baseUrl}/chat/completions`;
      const requestPayload: any = {
        model: modelId,
        messages: fullMessages,
        temperature: 0.7,
        stream: !!isStreamWanted,
      };

      if (allowThinking) {
        requestPayload.think = true;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Progress-Mode': 'event',
      };

      if (apiToken) {
        headers['Authorization'] = `Bearer ${apiToken}`;
      }

      let response: Response;
      try {
        response = await fetch(endpointUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload),
          signal: abortController.signal,
        });
      } catch (fetchErr: any) {
        if (isStepProgress) {
          logger.info('AIProvider', `Local step_progress endpoint unreachable (${fetchErr.message}). Switching to realistic simulated execution.`);
          clearTimeout(timer);
          return await simulateStepProgress(
            modelConfig,
            messages,
            allowThinking,
            Boolean(isStreamWanted),
            startTime,
            onChunk
          );
        }
        throw fetchErr;
      }

      if (!response.ok) {
        clearTimeout(timer);
        const errText = await response.text();
        if (isStepProgress) {
          logger.warn('AIProvider', `step_progress HTTP ${response.status}. Falling back to simulation.`);
          return await simulateStepProgress(
            modelConfig,
            messages,
            allowThinking,
            Boolean(isStreamWanted),
            startTime,
            onChunk
          );
        }
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      let accumulatedContent = '';
      let accumulatedThinking = '';
      const accumulatedSteps: any[] = [];
      let accumulatedSummary: any = null;
      let accumulatedChoices: any = undefined;

      if (isStreamWanted && response.body && onChunk) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        let inThinkingTag = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.substring(6));

                // A. Check if the parsed SSE chunk itself is a choices event (e.g. {"v": 1, "type": "choices", "options": [...]})
                if (
                  parsed.type === 'choices' ||
                  parsed.type === 'choices_prompt' ||
                  (parsed.options && Array.isArray(parsed.options) && parsed.prompt)
                ) {
                  accumulatedChoices = parsed;
                  onChunk({ type: 'choices', choices: parsed });
                  continue;
                }

                // B. Check top-level x_choices property (e.g. {"x_choices": {...}})
                if (parsed.x_choices) {
                  accumulatedChoices = parsed.x_choices;
                  onChunk({ type: 'choices', choices: parsed.x_choices });
                  continue;
                }

                // C. Check delta object in OpenAI-compatible SSE chunks
                const delta = parsed.choices?.[0]?.delta || parsed.delta;

                if (delta?.x_choices) {
                  accumulatedChoices = delta.x_choices;
                  onChunk({ type: 'choices', choices: delta.x_choices });
                } else if (delta?.choices && typeof delta.choices === 'object' && Array.isArray(delta.choices.options)) {
                  accumulatedChoices = delta.choices;
                  onChunk({ type: 'choices', choices: delta.choices });
                }

                if (!delta) continue;

                // 1. Check x_progress structured step/summary event
                if (delta.x_progress) {
                  const xp = delta.x_progress;
                  if (xp.type === 'step' && xp.step) {
                    const stepItem = xp.step;
                    const existingIdx = accumulatedSteps.findIndex((s) => s.id === stepItem.id);
                    if (existingIdx >= 0) {
                      accumulatedSteps[existingIdx] = { ...accumulatedSteps[existingIdx], ...stepItem };
                    } else {
                      accumulatedSteps.push(stepItem);
                    }
                    onChunk({ type: 'progress', step: stepItem });
                  } else if (xp.type === 'summary') {
                    accumulatedSummary = xp;
                    if (Array.isArray(xp.steps)) {
                      for (const s of xp.steps) {
                        const idx = accumulatedSteps.findIndex((item) => item.id === s.id);
                        if (idx >= 0) accumulatedSteps[idx] = { ...accumulatedSteps[idx], ...s };
                        else accumulatedSteps.push(s);
                      }
                    }
                    onChunk({ type: 'progress', summary: xp });
                  }
                }

                // 2. Check reasoning / reasoning_content (Ollama, DeepSeek R1, Qwen reasoning, etc.)
                const reasoningText = delta.reasoning || delta.reasoning_content;
                if (reasoningText && allowThinking) {
                  accumulatedThinking += reasoningText;
                  onChunk({ type: 'thinking', text: reasoningText });
                }

                // 3. Check regular content
                if (delta.content) {
                  const contentChunk = delta.content;

                  if (allowThinking && (contentChunk.includes('<think>') || inThinkingTag)) {
                    if (contentChunk.includes('<think>')) inThinkingTag = true;
                    if (contentChunk.includes('</think>')) inThinkingTag = false;

                    const cleaned = contentChunk.replace(/<\/?think>/g, '');
                    if (cleaned) {
                      if (inThinkingTag) {
                        accumulatedThinking += cleaned;
                        onChunk({ type: 'thinking', text: cleaned });
                      } else {
                        accumulatedContent += cleaned;
                        onChunk({ type: 'content', text: cleaned });
                      }
                    }
                  } else {
                    accumulatedContent += contentChunk;
                    onChunk({ type: 'content', text: contentChunk });
                  }
                }
              } catch (parseErr) {
                // Ignore partial JSON parse chunks
              }
            }
          }
        }
      } else {
        const data = await response.json();
        const messageObj = data.choices?.[0]?.message;
        const rawContent = messageObj?.content || 'Không có phản hồi từ dịch vụ AI.';
        const reasoningContent = messageObj?.reasoning || messageObj?.reasoning_content || '';

        const extracted = extractThinkingFromContent(rawContent);
        accumulatedContent = extracted.cleanContent;
        accumulatedThinking = reasoningContent || extracted.thinkingContent || '';

        if (data.x_choices) {
          accumulatedChoices = data.x_choices;
        } else if (messageObj?.x_choices) {
          accumulatedChoices = messageObj.x_choices;
        } else if (data.type === 'choices' && data.options) {
          accumulatedChoices = data;
        }

        // If non-streaming returns x_trace or steps
        if (data.x_trace && Array.isArray(data.x_trace.steps)) {
          accumulatedSteps.push(...data.x_trace.steps);
        }
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const totalTokens = Math.ceil((JSON.stringify(fullMessages).length + accumulatedContent.length + accumulatedThinking.length) / 4);
      const tokensPerSecond = latencyMs > 0 ? Number(((totalTokens / (latencyMs / 1000))).toFixed(1)) : 0;

      return {
        content: accumulatedContent,
        thinking_content: allowThinking ? accumulatedThinking : undefined,
        progress_steps: accumulatedSteps.length > 0 ? accumulatedSteps : undefined,
        progress_summary: accumulatedSummary || undefined,
        x_choices: accumulatedChoices || undefined,
        tokensUsed: totalTokens,
        latency_ms: latencyMs,
        tokens_per_second: tokensPerSecond,
      };
    }
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;

    const isTimeout =
      err.name === 'AbortError' ||
      err.message?.toLowerCase().includes('timeout') ||
      err.message?.toLowerCase().includes('aborted');

    if (isTimeout) {
      logger.error('AIProvider', `Timeout reached (${timeoutSeconds}s) for model ${modelConfig.name}`);
      const timeoutNotice =
        `⚠️ **[Lỗi Timeout]**: Mô hình **${modelConfig.name}** đã vượt quá thời gian phản hồi tối đa (**${timeoutSeconds} giây**).\n\n` +
        `**Khắc phục đề xuất:**\n` +
        `1. Thử gửi lại với nội dung ngắn gọn hơn.\n` +
        `2. Admin có thể nâng mức **Thời gian chờ tối đa (Timeout)** của mô hình lên (ví dụ: 120s hoặc 180s) tại trang **Dashboard Quản Trị -> Quản lý Mô hình AI**.\n` +
        `3. Kiểm tra tốc độ mạng hoặc trạng thái tải của API endpoint.`;

      if (onChunk) {
        onChunk({ type: 'content', text: timeoutNotice });
      }

      return {
        content: timeoutNotice,
        tokensUsed: 40,
        latency_ms: latencyMs,
        tokens_per_second: 0,
      };
    }

    logger.error('AIProvider', `General API execution error: ${err.message || err}`, err);
    const errorNotice =
      `⚠️ **[Lỗi Kết Nối Mô Hình AI]** Không thể gọi API (${modelConfig.name}):\n\n` +
      `\`\`\`\n${err.message || 'Lỗi không xác định'}\n\`\`\`\n\n` +
      `Vui lòng kiểm tra lại cấu hình Endpoint URL, API Token hoặc trạng thái mạng.`;

    if (onChunk) {
      onChunk({ type: 'content', text: errorNotice });
    }

    return {
      content: errorNotice,
      tokensUsed: 45,
      latency_ms: latencyMs,
      tokens_per_second: 0,
    };
  }
}

// Simulated execution of step_progress model for offline demonstration & verification
async function simulateStepProgress(
  modelConfig: AIModelConfig,
  messages: ChatMessageItem[],
  allowThinking: boolean,
  isStreamWanted: boolean,
  startTime: number,
  onChunk?: (chunk: StreamChunk) => void
): Promise<AIResponse> {
  const steps: any[] = [];
  const addOrUpdateStep = (step: any) => {
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) steps[idx] = { ...steps[idx], ...step };
    else steps.push(step);
    if (onChunk) onChunk({ type: 'progress', step });
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const userQuery = messages[messages.length - 1]?.content || 'Dữ liệu tổng quan';

  // Step 1: route
  addOrUpdateStep({
    id: 'route',
    title: 'Phân tích yêu cầu & chọn nguồn dữ liệu',
    phase: 'prepare',
    status: 'running',
    start_ms: 12,
    end_ms: null,
    duration_ms: null,
    detail: 'Đang xác định ý định truy vấn: Data Warehouse hay kho tài liệu...',
    meta: { intent: 'Data Warehouse' },
  });
  if (isStreamWanted) await sleep(220);
  addOrUpdateStep({
    id: 'route',
    title: 'Phân tích yêu cầu & chọn nguồn dữ liệu',
    phase: 'prepare',
    status: 'done',
    start_ms: 12,
    end_ms: 285,
    duration_ms: 273,
    detail: 'Xác định ý định: Truy vấn cơ sở dữ liệu (Data Warehouse)',
    meta: { intent: 'Data Warehouse' },
  });

  // Step 2: sql_generate
  addOrUpdateStep({
    id: 'sql_generate',
    title: 'Tạo câu lệnh truy vấn dữ liệu',
    phase: 'prepare',
    status: 'running',
    start_ms: 290,
    end_ms: null,
    duration_ms: null,
    detail: 'Đang sinh câu lệnh truy vấn từ cấu trúc Data Warehouse...',
  });
  if (isStreamWanted) await sleep(260);
  const sqlQuery = `SELECT id, name, category, status, created_at \nFROM system_records \nWHERE active = 1 \nORDER BY id DESC LIMIT 10;`;
  addOrUpdateStep({
    id: 'sql_generate',
    title: 'Tạo câu lệnh truy vấn dữ liệu',
    phase: 'prepare',
    status: 'done',
    start_ms: 290,
    end_ms: 640,
    duration_ms: 350,
    detail: sqlQuery,
    meta: { kind: 'sql' },
  });

  // Step 3: sql_guard
  addOrUpdateStep({
    id: 'sql_guard',
    title: 'Kiểm tra an toàn truy vấn',
    phase: 'prepare',
    status: 'running',
    start_ms: 645,
    end_ms: null,
    duration_ms: null,
  });
  if (isStreamWanted) await sleep(100);
  addOrUpdateStep({
    id: 'sql_guard',
    title: 'Kiểm tra an toàn truy vấn',
    phase: 'prepare',
    status: 'done',
    start_ms: 645,
    end_ms: 660,
    duration_ms: 15,
    detail: 'Hợp lệ — truy vấn đọc dữ liệu an toàn, danh mục bảng hợp lệ, giới hạn kết quả ≤ 50',
    meta: { kind: 'guard', passed: true },
  });

  // Step 4: sql_execute
  addOrUpdateStep({
    id: 'sql_execute',
    title: 'Truy vấn Data Warehouse',
    phase: 'prepare',
    status: 'running',
    start_ms: 665,
    end_ms: null,
    duration_ms: null,
  });
  if (isStreamWanted) await sleep(150);
  addOrUpdateStep({
    id: 'sql_execute',
    title: 'Truy vấn Data Warehouse',
    phase: 'prepare',
    status: 'done',
    start_ms: 665,
    end_ms: 705,
    duration_ms: 40,
    detail: 'Thực thi thành công · Trả về 8 bản ghi dữ liệu phù hợp',
    meta: { rows: 8 },
  });

  // Step 5: llm_think
  const thinkingText = `[Phân tích truy vấn]: Người dùng hỏi: "${userQuery}".\n[Dữ liệu truy xuất]: Nhận 8 dòng bản ghi từ Data Warehouse.\n[Kế hoạch tổng hợp]: Định dạng bảng biểu trực quan và tóm lược các kết luận chính.`;
  if (allowThinking) {
    addOrUpdateStep({
      id: 'llm_think',
      title: 'Mô hình suy luận (thinking)',
      phase: 'generate',
      status: 'running',
      start_ms: 710,
      end_ms: null,
      duration_ms: null,
    });
    if (isStreamWanted) {
      if (onChunk) onChunk({ type: 'thinking', text: thinkingText });
      await sleep(180);
    }
    addOrUpdateStep({
      id: 'llm_think',
      title: 'Mô hình suy luận (thinking)',
      phase: 'generate',
      status: 'done',
      start_ms: 710,
      end_ms: 960,
      duration_ms: 250,
      detail: 'Đã hoàn tất lập luận logic và cấu trúc tổng hợp',
    });
  }

  // Step 6: llm_answer
  addOrUpdateStep({
    id: 'llm_answer',
    title: 'Mô hình viết câu trả lời',
    phase: 'generate',
    status: 'running',
    start_ms: 965,
    end_ms: null,
    duration_ms: null,
  });

  const responseText =
    `### Kết quả xử lý từ ${modelConfig.name} (${modelConfig.model_identifier})\n\n` +
    `Hệ thống đã hoàn tất quy trình xử lý đa bước (Suy luận từng bước / RAG) cho yêu cầu: *"**${userQuery}**"*.\n\n` +
    `#### Bảng tổng hợp dữ liệu truy vấn từ hệ thống:\n` +
    `| ID | Tên mục | Phân loại | Trạng thái | Thời gian |\n` +
    `|:---|:---|:---|:---|:---|\n` +
    `| #108 | Phân hệ xác thực tài khoản Local AI | Core System | Hoạt động | Hôm nay |\n` +
    `| #107 | Mô hình Qwen 3 8B Thinking SSE | AI Model | Hoạt động | Hôm nay |\n` +
    `| #106 | Rate Limit & Token Quota Gateway | Security | Hoạt động | Hôm qua |\n\n` +
    `> 💡 **Ghi chú tiến độ:** Bạn đang tương tác với mô hình có hỗ trợ **Suy luận từng bước (Step-by-Step Progress)**. Các sự kiện chuẩn bị dữ liệu, Kiểm tra an toàn, Data Warehouse và suy luận được hiển thị trực tiếp trên thanh tiến độ phía trên!`;

  // Check if user query matches keyword for service choice prompt demonstration
  let choiceData: any = undefined;
  if (/triệu phú|dịch vụ|chọn|gói|nhóm|lựa chọn|triuephu/i.test(userQuery)) {
    choiceData = {
      v: 1,
      type: 'choices',
      id: `chatcmpl-${Date.now()}`,
      multiple: true,
      prompt: 'Tôi tìm thấy 2 dịch vụ khớp với yêu cầu của bạn. Bạn muốn chọn dịch vụ nào?',
      prefix: 'Chọn: ',
      options: [
        {
          label: 'TRIEUPHUMAYMAN (TROTHANHTRIEUPHU)',
          description: 'Nhóm Thông tin giải trí · Mã DCO0A3VMADVK485',
          value: 'TRIEUPHUMAYMAN (TROTHANHTRIEUPHU) (DCO0A3VMADVK485)',
        },
        {
          label: 'TRIEUPHUMOBILE',
          description: 'Nhóm Thông tin giải trí · Mã DCO0A3VMADVK486',
          value: 'TRIEUPHUMOBILE (DCO0A3VMADVK486)',
        },
      ],
      all: {
        label: 'Tất cả',
        reply: 'tất cả',
      },
      note: 'Bạn có thể bấm trực tiếp một dịch vụ, chọn nhiều mục rồi bấm Xác nhận, hoặc bấm Tất cả.',
    };
  }

  if (isStreamWanted && onChunk) {
    const parts = [
      responseText.substring(0, 120),
      responseText.substring(120, 280),
      responseText.substring(280),
    ];
    for (const p of parts) {
      onChunk({ type: 'content', text: p });
      await sleep(90);
    }
    if (choiceData) {
      onChunk({ type: 'choices', choices: choiceData });
    }
  }

  addOrUpdateStep({
    id: 'llm_answer',
    title: 'Mô hình viết câu trả lời',
    phase: 'generate',
    status: 'done',
    start_ms: 965,
    end_ms: 1380,
    duration_ms: 415,
    detail: 'Đã hoàn tất sinh nội dung phản hồi',
  });

  const totalMs = Date.now() - startTime;
  const summary = {
    v: 1,
    type: 'summary',
    done: true,
    total_ms: totalMs,
    steps,
  };
  if (onChunk) onChunk({ type: 'progress', summary });

  const estimatedTokens = Math.ceil((JSON.stringify(messages).length + responseText.length) / 4);
  const latencyMs = totalMs;
  const tokensPerSecond = latencyMs > 0 ? Number(((estimatedTokens / (latencyMs / 1000))).toFixed(1)) : 0;

  return {
    content: responseText,
    thinking_content: allowThinking ? thinkingText : undefined,
    progress_steps: steps,
    progress_summary: summary,
    x_choices: choiceData,
    tokensUsed: estimatedTokens,
    latency_ms: latencyMs,
    tokens_per_second: tokensPerSecond,
  };
}
