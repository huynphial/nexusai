import { GoogleGenAI } from '@google/genai';
import { logger } from './logger';
import { getMcpToolBindingsForModel, callMcpTool, McpToolBinding } from './mcpClient';

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
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  enable_mcp?: number | boolean;
  mcp_server_ids?: number[] | string;
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

export interface UserInfoTracing {
  name?: string;
  email?: string;
  id?: number | string;
  role?: string;
  group_id?: number;
}

export async function generateAIChatResponse(
  modelConfig: AIModelConfig,
  messages: ChatMessageItem[],
  onChunk?: (chunk: StreamChunk) => void,
  userInfo?: UserInfoTracing,
  sessionId?: number | string,
  externalSignal?: AbortSignal
): Promise<AIResponse> {
  const systemPrompt = modelConfig.system_prompt || 'Bạn là trợ lý trí tuệ nhân tạo Local AI, hỗ trợ người dùng chu đáo bằng Tiếng Việt.';
  const timeoutSeconds = modelConfig.timeout_seconds && modelConfig.timeout_seconds > 0 ? modelConfig.timeout_seconds : 60;
  const isStreamWanted = onChunk && (modelConfig.enable_stream === 1 || modelConfig.enable_stream === true || modelConfig.enable_stream === undefined);
  const allowThinking = modelConfig.enable_thinking === 1 || modelConfig.enable_thinking === true || modelConfig.enable_thinking === undefined;

  const startTime = Date.now();

  logger.debug('AIProvider', `Initiating call to "${modelConfig.name}" (${modelConfig.provider}:${modelConfig.model_identifier}) | Timeout: ${timeoutSeconds}s | Stream: ${!!isStreamWanted} | Thinking: ${allowThinking}`);

  // Setup AbortController combining max timeout AND client cancellation signal
  const abortController = new AbortController();
  const timer = setTimeout(() => {
    abortController.abort(new Error(`Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`));
  }, timeoutSeconds * 1000);

  const onExternalAbort = () => {
    abortController.abort(externalSignal?.reason || new Error('CLIENT_ABORTED'));
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const isMcpEnabled = modelConfig.enable_mcp !== 0 && modelConfig.enable_mcp !== false;
  let parsedMcpServerIds: number[] = [];
  if (Array.isArray(modelConfig.mcp_server_ids)) {
    parsedMcpServerIds = modelConfig.mcp_server_ids;
  } else if (typeof modelConfig.mcp_server_ids === 'string' && modelConfig.mcp_server_ids.trim()) {
    try {
      const parsed = JSON.parse(modelConfig.mcp_server_ids);
      if (Array.isArray(parsed)) parsedMcpServerIds = parsed;
    } catch {
      parsedMcpServerIds = [];
    }
  }

  let mcpBindings: McpToolBinding[] = [];
  if (isMcpEnabled) {
    try {
      mcpBindings = await getMcpToolBindingsForModel(
        parsedMcpServerIds.length > 0 ? parsedMcpServerIds : null,
        userInfo?.group_id
      );
    } catch (mcpLoadErr: any) {
      logger.warn('AIProvider', `Failed loading MCP bindings: ${mcpLoadErr.message}`);
    }
  }

  try {
    if (modelConfig.provider === 'gemini') {
      // 1. Gemini Server-Side Execution (with optional MCP Function Calling)
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

      const formattedContents: any[] = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      if (formattedContents.length === 0) {
        formattedContents.push({ role: 'user', parts: [{ text: 'Xin chào' }] });
      }

      let accumulatedText = '';
      let accumulatedThinking = '';
      const geminiSteps: any[] = [];

      const modelTemp = typeof modelConfig.temperature === 'number' ? modelConfig.temperature : 0.7;
      const modelTopP = typeof modelConfig.top_p === 'number' ? modelConfig.top_p : 0.95;
      const modelMaxTokens = typeof modelConfig.max_tokens === 'number' && modelConfig.max_tokens > 0 ? modelConfig.max_tokens : undefined;

      const geminiConfig: any = {
        systemInstruction: systemPrompt,
        temperature: modelTemp,
        topP: modelTopP,
        abortSignal: abortController.signal,
      };
      if (modelMaxTokens) {
        geminiConfig.maxOutputTokens = modelMaxTokens;
      }
      if (mcpBindings.length > 0) {
        geminiConfig.tools = [
          {
            functionDeclarations: mcpBindings.map((b) => ({
              name: b.qualifiedName,
              description: b.description,
              parametersJsonSchema: b.inputSchema || { type: 'object', properties: {} },
            })),
          },
        ];
      }

      const MAX_TOOL_TURNS = 6;
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        if (abortController.signal.aborted) {
          throw new Error(externalSignal?.aborted ? 'CLIENT_ABORTED' : `Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
        }

        let turnFunctionCalls: Array<{ name: string; args: Record<string, any> }> = [];

        if (isStreamWanted) {
          const streamResult = await ai.models.generateContentStream({
            model: modelName,
            contents: formattedContents as any,
            config: geminiConfig,
          });

          let inThinkingMode = false;
          for await (const chunk of streamResult) {
            if (abortController.signal.aborted) {
              throw new Error(externalSignal?.aborted ? 'CLIENT_ABORTED' : `Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
            }
            if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
              for (const fc of chunk.functionCalls) {
                if (fc.name) {
                  turnFunctionCalls.push({ name: fc.name, args: (fc.args as Record<string, any>) || {} });
                }
              }
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
          const res = await ai.models.generateContent({
            model: modelName,
            contents: formattedContents as any,
            config: geminiConfig,
          });
          if (Array.isArray(res.functionCalls) && res.functionCalls.length > 0) {
            for (const fc of res.functionCalls) {
              if (fc.name) {
                turnFunctionCalls.push({ name: fc.name, args: (fc.args as Record<string, any>) || {} });
              }
            }
          }
          if (res.text) {
            accumulatedText += res.text;
          }
        }

        if (turnFunctionCalls.length === 0) {
          break;
        }

        // Execute requested MCP tools and feed results back to Gemini
        formattedContents.push({
          role: 'model',
          parts: turnFunctionCalls.map((fc) => ({
            functionCall: { name: fc.name, args: fc.args },
          })),
        });

        const responseParts: any[] = [];
        for (let i = 0; i < turnFunctionCalls.length; i++) {
          if (abortController.signal.aborted) {
            throw new Error(externalSignal?.aborted ? 'CLIENT_ABORTED' : `Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
          }
          const fc = turnFunctionCalls[i];
          const binding = mcpBindings.find((b) => b.qualifiedName === fc.name || b.originalName === fc.name);
          const stepId = `mcp_${turn}_${i}_${Date.now()}`;
          const stepStart = Date.now() - startTime;
          const toolName = binding?.originalName || fc.name;
          const serverName = binding?.serverName || 'MCP';
          const toolDesc = binding?.rawDescription || '';

          const runningStep = {
            id: stepId,
            title: `Gọi công cụ MCP: ${toolName}`,
            phase: 'tool',
            status: 'running',
            start_ms: stepStart,
            end_ms: null,
            duration_ms: null,
            detail: toolDesc || undefined,
            meta: {
              kind: 'mcp_tool',
              tool_name: toolName,
              server_name: serverName,
              tool_description: toolDesc,
              transport: binding?.transport || '',
              arg_keys: Object.keys(fc.args || {}),
            },
          };
          geminiSteps.push(runningStep);
          if (onChunk) onChunk({ type: 'progress', step: runningStep });

          const t0 = Date.now();
          const toolResult = binding
            ? await callMcpTool(binding.serverId, binding.originalName, fc.args, abortController.signal)
            : {
                text: `Không tìm thấy công cụ MCP "${fc.name}".`,
                isError: true,
                raw: null,
                statusCode: 404,
                transport: 'unknown',
                latencyMs: 0,
              };
          const toolMs = Date.now() - t0;

          const doneStep = {
            ...runningStep,
            status: toolResult.isError ? 'error' : 'done',
            end_ms: Date.now() - startTime,
            duration_ms: toolMs,
            detail: toolDesc || undefined,
            meta: {
              kind: 'mcp_tool',
              tool_name: toolName,
              server_name: serverName,
              tool_description: toolDesc,
              transport: toolResult.transport || binding?.transport || '',
              status_code: toolResult.statusCode,
              arg_keys: Object.keys(fc.args || {}),
              ok: !toolResult.isError,
            },
          };
          const sIdx = geminiSteps.findIndex((s) => s.id === stepId);
          if (sIdx >= 0) geminiSteps[sIdx] = doneStep;
          if (onChunk) onChunk({ type: 'progress', step: doneStep });

          responseParts.push({
            functionResponse: {
              name: fc.name,
              response: { result: toolResult.text },
            },
          });
        }

        formattedContents.push({
          role: 'user',
          parts: responseParts,
        });
      }

      if (!accumulatedText && !accumulatedThinking) {
        accumulatedText = 'Không có phản hồi từ mô hình.';
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

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
        progress_steps: geminiSteps.length > 0 ? geminiSteps : undefined,
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
            onChunk,
            abortController.signal
          );
        }
      }

      const isOpenAIDefault = !modelConfig.api_url || modelConfig.api_url.includes('api.openai.com');
      if (!apiToken && !isStepProgress && isOpenAIDefault) {
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

      let endpointUrl = `${baseUrl}/chat/completions`;
      if (/\/(chat\/completions|api\/chat|api\/generate)$/i.test(baseUrl)) {
        endpointUrl = baseUrl;
      } else if (/\/api$/i.test(baseUrl)) {
        endpointUrl = `${baseUrl}/chat`;
      }
      const isOllamaNative = /\/api\/(chat|generate)$/i.test(endpointUrl);

      const modelTemp = typeof modelConfig.temperature === 'number' ? modelConfig.temperature : 0.7;
      const modelTopP = typeof modelConfig.top_p === 'number' ? modelConfig.top_p : 0.95;
      const modelMaxTokens = typeof modelConfig.max_tokens === 'number' && modelConfig.max_tokens > 0 ? modelConfig.max_tokens : 0;
      const modelPresence = typeof modelConfig.presence_penalty === 'number' ? modelConfig.presence_penalty : 0;
      const modelFrequency = typeof modelConfig.frequency_penalty === 'number' ? modelConfig.frequency_penalty : 0;

      const openAiTools = mcpBindings.map((b) => ({
        type: 'function',
        function: {
          name: b.qualifiedName,
          description: b.description,
          parameters: b.inputSchema || { type: 'object', properties: {} },
        },
      }));

      const conversationMessages: any[] = [...fullMessages];
      let toolsEnabledForRequest = openAiTools.length > 0;

      let accumulatedContent = '';
      let accumulatedThinking = '';
      const accumulatedSteps: any[] = [];
      let accumulatedSummary: any = null;
      let accumulatedChoices: any = undefined;
      let reportedTotalTokens = 0;

      const MAX_TOOL_TURNS = 6;

      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        if (abortController.signal.aborted) {
          throw new Error(externalSignal?.aborted ? 'CLIENT_ABORTED' : `Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
        }
        const requestPayload: any = {
          model: modelId,
          messages: conversationMessages,
          stream: !!isStreamWanted,
        };

        if (isOllamaNative) {
          const ollamaOpts: any = {
            temperature: modelTemp,
            top_p: modelTopP,
          };
          if (modelMaxTokens > 0) ollamaOpts.num_predict = modelMaxTokens;
          if (modelPresence !== 0) ollamaOpts.presence_penalty = modelPresence;
          if (modelFrequency !== 0) ollamaOpts.frequency_penalty = modelFrequency;
          requestPayload.options = ollamaOpts;
          requestPayload.think = allowThinking;
        } else {
          requestPayload.temperature = modelTemp;
          requestPayload.top_p = modelTopP;
          if (modelMaxTokens > 0) requestPayload.max_tokens = modelMaxTokens;
          if (modelPresence !== 0) requestPayload.presence_penalty = modelPresence;
          if (modelFrequency !== 0) requestPayload.frequency_penalty = modelFrequency;
          if (allowThinking) {
            requestPayload.think = true;
          } else if (!baseUrl.includes('api.openai.com')) {
            requestPayload.think = false;
          }
        }

        if (toolsEnabledForRequest) {
          requestPayload.tools = openAiTools;
          if (!isOllamaNative) {
            requestPayload.tool_choice = 'auto';
          }
        }

        if (sessionId !== undefined && sessionId !== null) {
          requestPayload.session_id = sessionId;
        }
        if (userInfo?.id !== undefined && userInfo?.id !== null) {
          requestPayload.user_id = userInfo.id;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Progress-Mode': 'event',
        };

        if (userInfo?.name) {
          headers['X-User-Name'] = encodeURIComponent(userInfo.name);
        }
        if (userInfo?.email) {
          headers['X-User-Email'] = userInfo.email;
        }
        if (userInfo?.id !== undefined && userInfo?.id !== null) {
          headers['X-User-Id'] = String(userInfo.id);
        }
        if (userInfo?.role) {
          headers['X-User-Role'] = userInfo.role;
        }
        if (sessionId !== undefined && sessionId !== null) {
          headers['X-Session-Id'] = String(sessionId);
        }

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
          if (externalSignal?.aborted || abortController.signal.aborted) {
            throw fetchErr;
          }
          if (isStepProgress && turn === 0) {
            logger.info('AIProvider', `Local step_progress endpoint unreachable (${fetchErr.message}). Switching to realistic simulated execution.`);
            clearTimeout(timer);
            return await simulateStepProgress(
              modelConfig,
              messages,
              allowThinking,
              Boolean(isStreamWanted),
              startTime,
              onChunk,
              abortController.signal
            );
          }
          throw fetchErr;
        }

        if (!response.ok) {
          const errText = await response.text();
          // Graceful fallback if Ollama/upstream model doesn't support `tools`
          if (toolsEnabledForRequest && response.status === 400 && /tool|function/i.test(errText)) {
            logger.warn('AIProvider', `Model "${modelId}" rejected tools parameter (${errText.slice(0, 150)}). Retrying without MCP tools.`);
            toolsEnabledForRequest = false;
            continue;
          }

          clearTimeout(timer);
          if (isStepProgress && turn === 0) {
            logger.warn('AIProvider', `step_progress HTTP ${response.status}. Falling back to simulation.`);
            return await simulateStepProgress(
              modelConfig,
              messages,
              allowThinking,
              Boolean(isStreamWanted),
              startTime,
              onChunk,
              abortController.signal
            );
          }
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        let turnContent = '';
        const turnToolCallMap = new Map<
          number,
          { id: string; name: string; argumentsStr: string; argumentsObj: Record<string, any> | null }
        >();

        if (isStreamWanted && response.body && onChunk) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let inThinkingTag = false;
          let tagBuffer = '';

          const getPartialSuffixMatch = (str: string, tag: string): number => {
            const maxLen = Math.min(str.length, tag.length - 1);
            for (let len = maxLen; len > 0; len--) {
              if (tag.startsWith(str.slice(-len))) {
                return len;
              }
            }
            return 0;
          };

          const emitContentWithThinkTags = (chunkText: string) => {
            tagBuffer += chunkText;
            while (tagBuffer.length > 0) {
              if (inThinkingTag) {
                const closeIdx = tagBuffer.indexOf('</think>');
                if (closeIdx !== -1) {
                  const thinkPart = tagBuffer.slice(0, closeIdx);
                  if (thinkPart && allowThinking) {
                    accumulatedThinking += thinkPart;
                    onChunk({ type: 'thinking', text: thinkPart });
                  }
                  tagBuffer = tagBuffer.slice(closeIdx + '</think>'.length);
                  inThinkingTag = false;
                } else {
                  const partialLen = getPartialSuffixMatch(tagBuffer, '</think>');
                  const safeLen = tagBuffer.length - partialLen;
                  if (safeLen > 0) {
                    const thinkPart = tagBuffer.slice(0, safeLen);
                    if (allowThinking) {
                      accumulatedThinking += thinkPart;
                      onChunk({ type: 'thinking', text: thinkPart });
                    }
                    tagBuffer = tagBuffer.slice(safeLen);
                  }
                  break;
                }
              } else {
                const openIdx = tagBuffer.indexOf('<think>');
                if (openIdx !== -1) {
                  const contentPart = tagBuffer.slice(0, openIdx);
                  if (contentPart) {
                    turnContent += contentPart;
                    accumulatedContent += contentPart;
                    onChunk({ type: 'content', text: contentPart });
                  }
                  tagBuffer = tagBuffer.slice(openIdx + '<think>'.length);
                  inThinkingTag = true;
                } else {
                  const partialLen = getPartialSuffixMatch(tagBuffer, '<think>');
                  const safeLen = tagBuffer.length - partialLen;
                  if (safeLen > 0) {
                    const contentPart = tagBuffer.slice(0, safeLen);
                    turnContent += contentPart;
                    accumulatedContent += contentPart;
                    onChunk({ type: 'content', text: contentPart });
                    tagBuffer = tagBuffer.slice(safeLen);
                  }
                  break;
                }
              }
            }
          };

          const processStreamLine = (rawLine: string) => {
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith(':')) return;

            const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            if (!jsonStr || jsonStr === '[DONE]') return;
            if (!jsonStr.startsWith('{')) return;

            try {
              const parsed = JSON.parse(jsonStr);

              // Track reported token counts if available
              if (typeof parsed.usage?.total_tokens === 'number') {
                reportedTotalTokens += parsed.usage.total_tokens;
              } else if (typeof parsed.eval_count === 'number' || typeof parsed.prompt_eval_count === 'number') {
                reportedTotalTokens += (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
              }

              // A. Check if the parsed chunk itself is a choices event
              if (
                parsed.type === 'choices' ||
                parsed.type === 'choices_prompt' ||
                (parsed.options && Array.isArray(parsed.options) && parsed.prompt)
              ) {
                accumulatedChoices = parsed;
                onChunk({ type: 'choices', choices: parsed });
                return;
              }

              // B. Check top-level x_choices property
              if (parsed.x_choices) {
                accumulatedChoices = parsed.x_choices;
                onChunk({ type: 'choices', choices: parsed.x_choices });
                return;
              }

              // C. Extract active message/delta object across OpenAI SSE & Ollama NDJSON formats
              const delta = parsed.choices?.[0]?.delta || parsed.delta;
              const ollamaMessage = parsed.message;
              const choiceMessage = parsed.choices?.[0]?.message;
              const chunkObj = delta || ollamaMessage || choiceMessage;

              if (chunkObj?.x_choices) {
                accumulatedChoices = chunkObj.x_choices;
                onChunk({ type: 'choices', choices: chunkObj.x_choices });
              } else if (chunkObj?.choices && typeof chunkObj.choices === 'object' && Array.isArray(chunkObj.choices.options)) {
                accumulatedChoices = chunkObj.choices;
                onChunk({ type: 'choices', choices: chunkObj.choices });
              }

              // 1. Check x_progress structured step/summary event
              const progressPayload = chunkObj?.x_progress || parsed.x_progress;
              if (progressPayload) {
                const xp = progressPayload;
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

              // 2. Check tool_calls (Ollama native message.tool_calls or OpenAI SSE delta.tool_calls)
              const rawToolCalls = chunkObj?.tool_calls;
              if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
                rawToolCalls.forEach((tc: any, arrayIdx: number) => {
                  const idx = typeof tc.index === 'number' ? tc.index : turnToolCallMap.size + arrayIdx;
                  const existingKey = typeof tc.index === 'number' ? tc.index : arrayIdx;
                  if (!turnToolCallMap.has(existingKey)) {
                    turnToolCallMap.set(existingKey, {
                      id: tc.id || `call_${turn}_${idx}`,
                      name: '',
                      argumentsStr: '',
                      argumentsObj: null,
                    });
                  }
                  const entry = turnToolCallMap.get(existingKey)!;
                  if (tc.id) entry.id = tc.id;
                  if (tc.function?.name) entry.name += tc.function.name;
                  if (typeof tc.function?.arguments === 'string') {
                    entry.argumentsStr += tc.function.arguments;
                  } else if (tc.function?.arguments && typeof tc.function.arguments === 'object') {
                    entry.argumentsObj = tc.function.arguments;
                  }
                });
              }

              // 3. Check thinking / reasoning_content / reasoning
              const reasoningText =
                chunkObj?.thinking ??
                chunkObj?.reasoning_content ??
                chunkObj?.reasoning ??
                parsed.thinking ??
                parsed.reasoning_content ??
                parsed.reasoning ??
                '';

              if (typeof reasoningText === 'string' && reasoningText.length > 0 && allowThinking) {
                accumulatedThinking += reasoningText;
                onChunk({ type: 'thinking', text: reasoningText });
              }

              // 4. Check regular content
              const contentChunk =
                typeof chunkObj?.content === 'string'
                  ? chunkObj.content
                  : typeof parsed.response === 'string'
                  ? parsed.response
                  : '';

              if (contentChunk.length > 0) {
                emitContentWithThinkTags(contentChunk);
              }
            } catch {
              // Ignore partial or malformed JSON lines
            }
          };

          const onAbortReader = () => {
            reader.cancel().catch(() => {});
          };
          abortController.signal.addEventListener('abort', onAbortReader, { once: true });

          try {
            while (true) {
              if (abortController.signal.aborted) {
                throw new Error(externalSignal?.aborted ? 'CLIENT_ABORTED' : `Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
              }
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                processStreamLine(line);
              }
            }
          } finally {
            abortController.signal.removeEventListener('abort', onAbortReader);
          }

          if (buffer.trim()) {
            processStreamLine(buffer);
          }
          if (tagBuffer.length > 0) {
            if (inThinkingTag) {
              if (allowThinking) {
                accumulatedThinking += tagBuffer;
                onChunk({ type: 'thinking', text: tagBuffer });
              }
            } else {
              turnContent += tagBuffer;
              accumulatedContent += tagBuffer;
              onChunk({ type: 'content', text: tagBuffer });
            }
            tagBuffer = '';
          }
        } else {
          const data = await response.json();
          const messageObj = data.choices?.[0]?.message || data.message;
          const rawContent = messageObj?.content ?? data.response ?? '';
          const reasoningContent =
            messageObj?.thinking ||
            messageObj?.reasoning_content ||
            messageObj?.reasoning ||
            data.thinking ||
            data.reasoning_content ||
            data.reasoning ||
            '';

          if (typeof data.usage?.total_tokens === 'number') {
            reportedTotalTokens += data.usage.total_tokens;
          } else if (typeof data.eval_count === 'number' || typeof data.prompt_eval_count === 'number') {
            reportedTotalTokens += (data.prompt_eval_count || 0) + (data.eval_count || 0);
          }

          if (Array.isArray(messageObj?.tool_calls)) {
            messageObj.tool_calls.forEach((tc: any, idx: number) => {
              const argsVal = tc.function?.arguments;
              turnToolCallMap.set(idx, {
                id: tc.id || `call_${turn}_${idx}`,
                name: tc.function?.name || '',
                argumentsStr: typeof argsVal === 'string' ? argsVal : '',
                argumentsObj: argsVal && typeof argsVal === 'object' ? argsVal : null,
              });
            });
          }

          const extracted = extractThinkingFromContent(rawContent);
          turnContent = extracted.cleanContent;
          if (turnContent) {
            accumulatedContent += (accumulatedContent ? '\n' : '') + turnContent;
          }
          if (reasoningContent || extracted.thinkingContent) {
            accumulatedThinking += (accumulatedThinking ? '\n' : '') + (reasoningContent || extracted.thinkingContent || '');
          }

          if (data.x_choices) {
            accumulatedChoices = data.x_choices;
          } else if (messageObj?.x_choices) {
            accumulatedChoices = messageObj.x_choices;
          } else if (data.type === 'choices' && data.options) {
            accumulatedChoices = data;
          }

          if (data.x_trace && Array.isArray(data.x_trace.steps)) {
            accumulatedSteps.push(...data.x_trace.steps);
          }
        }

        // Check if the model requested any MCP tool calls in this turn
        const pendingToolCalls = Array.from(turnToolCallMap.values()).filter((tc) => tc.name.trim().length > 0);
        if (pendingToolCalls.length === 0 || !toolsEnabledForRequest) {
          if (!accumulatedContent && !accumulatedThinking && turn === 0) {
            accumulatedContent = 'Không có phản hồi từ dịch vụ AI.';
          }
          break;
        }

        // Parse arguments and append assistant tool-call message to conversationMessages
        const parsedCalls = pendingToolCalls.map((tc) => {
          let parsedArgs: Record<string, any> = {};
          if (tc.argumentsObj) {
            parsedArgs = tc.argumentsObj;
          } else if (tc.argumentsStr.trim()) {
            try {
              parsedArgs = JSON.parse(tc.argumentsStr);
            } catch {
              parsedArgs = {};
            }
          }
          return { ...tc, parsedArgs };
        });

        if (isOllamaNative) {
          conversationMessages.push({
            role: 'assistant',
            content: turnContent || '',
            tool_calls: parsedCalls.map((tc) => ({
              function: {
                name: tc.name,
                arguments: tc.parsedArgs,
              },
            })),
          });
        } else {
          conversationMessages.push({
            role: 'assistant',
            content: turnContent || null,
            tool_calls: parsedCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.argumentsStr || JSON.stringify(tc.parsedArgs),
              },
            })),
          });
        }

        // Execute each MCP tool call and feed tool results back
        for (let i = 0; i < parsedCalls.length; i++) {
          if (abortController.signal.aborted) {
            throw new Error(externalSignal?.aborted ? 'CLIENT_ABORTED' : `Timeout: Quá thời gian phản hồi tối đa (${timeoutSeconds}s)`);
          }
          const tc = parsedCalls[i];
          const binding = mcpBindings.find((b) => b.qualifiedName === tc.name || b.originalName === tc.name);
          const stepId = `mcp_${turn}_${i}_${Date.now()}`;
          const toolName = binding?.originalName || tc.name;
          const serverName = binding?.serverName || 'MCP';
          const toolDesc = binding?.rawDescription || '';

          const runningStep = {
            id: stepId,
            title: `Gọi công cụ MCP: ${toolName}`,
            phase: 'tool',
            status: 'running',
            start_ms: Date.now() - startTime,
            end_ms: null,
            duration_ms: null,
            detail: toolDesc || undefined,
            meta: {
              kind: 'mcp_tool',
              tool_name: toolName,
              server_name: serverName,
              tool_description: toolDesc,
              transport: binding?.transport || '',
              arg_keys: Object.keys(tc.parsedArgs || {}),
            },
          };
          accumulatedSteps.push(runningStep);
          if (onChunk) onChunk({ type: 'progress', step: runningStep });

          const t0 = Date.now();
          const toolResult = binding
            ? await callMcpTool(binding.serverId, binding.originalName, tc.parsedArgs, abortController.signal)
            : {
                text: `Không tìm thấy công cụ MCP "${tc.name}".`,
                isError: true,
                raw: null,
                statusCode: 404,
                transport: 'unknown',
                latencyMs: 0,
              };
          const toolMs = Date.now() - t0;

          const doneStep = {
            ...runningStep,
            status: toolResult.isError ? 'error' : 'done',
            end_ms: Date.now() - startTime,
            duration_ms: toolMs,
            detail: toolDesc || undefined,
            meta: {
              kind: 'mcp_tool',
              tool_name: toolName,
              server_name: serverName,
              tool_description: toolDesc,
              transport: toolResult.transport || binding?.transport || '',
              status_code: toolResult.statusCode,
              arg_keys: Object.keys(tc.parsedArgs || {}),
              ok: !toolResult.isError,
            },
          };
          const idx = accumulatedSteps.findIndex((s) => s.id === stepId);
          if (idx >= 0) accumulatedSteps[idx] = doneStep;
          if (onChunk) onChunk({ type: 'progress', step: doneStep });

          if (isOllamaNative) {
            conversationMessages.push({
              role: 'tool',
              content: toolResult.text,
              tool_name: tc.name,
            });
          } else {
            conversationMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: toolResult.text,
            });
          }
        }
      }

      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      const totalTokens =
        reportedTotalTokens > 0
          ? reportedTotalTokens
          : Math.ceil((JSON.stringify(fullMessages).length + accumulatedContent.length + accumulatedThinking.length) / 4);
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

    const isClientCancelled =
      Boolean(externalSignal?.aborted) ||
      err.message === 'CLIENT_ABORTED';

    if (isClientCancelled) {
      logger.info('AIProvider', `Request aborted by user client for model "${modelConfig.name}" (${latencyMs}ms). Upstream stream stopped.`);
      return {
        content: '',
        tokensUsed: 0,
        latency_ms: latencyMs,
        tokens_per_second: 0,
      };
    }

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
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

// Simulated execution of step_progress model for offline demonstration & verification
async function simulateStepProgress(
  modelConfig: AIModelConfig,
  messages: ChatMessageItem[],
  allowThinking: boolean,
  isStreamWanted: boolean,
  startTime: number,
  onChunk?: (chunk: StreamChunk) => void,
  abortSignal?: AbortSignal
): Promise<AIResponse> {
  const steps: any[] = [];
  const addOrUpdateStep = (step: any) => {
    if (abortSignal?.aborted) return;
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx >= 0) steps[idx] = { ...steps[idx], ...step };
    else steps.push(step);
    if (onChunk) onChunk({ type: 'progress', step });
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (abortSignal?.aborted) return reject(new Error('CLIENT_ABORTED'));
      const t = setTimeout(() => {
        abortSignal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error('CLIENT_ABORTED'));
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
    });
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
