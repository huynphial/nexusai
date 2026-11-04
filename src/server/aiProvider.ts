import { GoogleGenAI } from '@google/genai';
import { logger } from './logger';

export interface ChatMessageItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIModelConfig {
  id: number;
  name: string;
  provider: 'openai_compatible' | 'gemini' | 'custom';
  model_identifier: string;
  api_url?: string;
  api_token?: string;
  system_prompt?: string;
  timeout_seconds?: number;
  enable_stream?: number | boolean;
  enable_thinking?: number | boolean;
}

export interface StreamChunk {
  type: 'thinking' | 'content';
  text: string;
}

export interface AIResponse {
  content: string;
  thinking_content?: string;
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
      // 2. OpenAI Compatible Endpoint / Custom ChatGPT API Execution
      const baseUrl = (modelConfig.api_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const apiToken = modelConfig.api_token || process.env.OPENAI_API_KEY || '';
      const modelId = modelConfig.model_identifier || 'gpt-4o';

      const fullMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      if (!apiToken) {
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

        if (isStreamWanted) {
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
      const requestPayload = {
        model: modelId,
        messages: fullMessages,
        temperature: 0.7,
        stream: !!isStreamWanted,
      };

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(requestPayload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        clearTimeout(timer);
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      let accumulatedContent = '';
      let accumulatedThinking = '';

      if (isStreamWanted && response.body) {
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
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                // 1. Check reasoning_content (DeepSeek R1, Qwen reasoning, etc.)
                if (delta.reasoning_content && allowThinking) {
                  accumulatedThinking += delta.reasoning_content;
                  onChunk({ type: 'thinking', text: delta.reasoning_content });
                }

                // 2. Check regular content
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
        const reasoningContent = messageObj?.reasoning_content || '';

        const extracted = extractThinkingFromContent(rawContent);
        accumulatedContent = extracted.cleanContent;
        accumulatedThinking = reasoningContent || extracted.thinkingContent || '';
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const totalTokens = Math.ceil((JSON.stringify(fullMessages).length + accumulatedContent.length + accumulatedThinking.length) / 4);
      const tokensPerSecond = latencyMs > 0 ? Number(((totalTokens / (latencyMs / 1000))).toFixed(1)) : 0;

      return {
        content: accumulatedContent,
        thinking_content: allowThinking ? accumulatedThinking : undefined,
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
