import { GoogleGenAI } from '@google/genai';

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
}

export interface AIResponse {
  content: string;
  tokensUsed: number;
}

export async function generateAIChatResponse(
  modelConfig: AIModelConfig,
  messages: ChatMessageItem[]
): Promise<AIResponse> {
  const systemPrompt = modelConfig.system_prompt || 'Bạn là trợ lý AI hữu ích và thông minh.';

  if (modelConfig.provider === 'gemini') {
    // 1. Gemini Server-Side Execution
    const apiKey = process.env.GEMINI_API_KEY || '';
    const modelName = modelConfig.model_identifier || 'gemini-3.8-flash';

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      console.warn('[AIProvider] GEMINI_API_KEY not configured in env, providing intelligent assistant fallback response.');
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Prepare contents list
      const formattedContents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const res = await ai.models.generateContent({
        model: modelName,
        contents: formattedContents.length > 0 ? (formattedContents as any) : 'Xin chào',
        config: {
          systemInstruction: systemPrompt,
        },
      });

      const responseText = res.text || 'Không có phản hồi từ Gemini.';
      const promptLength = messages.reduce((acc, m) => acc + m.content.length, 0) + systemPrompt.length;
      const estimatedTokens = Math.ceil((promptLength + responseText.length) / 4);

      return {
        content: responseText,
        tokensUsed: res.usageMetadata?.totalTokenCount || estimatedTokens,
      };
    } catch (err: any) {
      console.error('[AIProvider] Gemini API Error:', err.message || err);
      // Fallback message if key fails or model unreachable
      return {
        content: `**[Gemini System Alert]** Phản hồi được xử lý qua Gemini (${modelName}):\n\nPhản hồi thông minh của bạn cho yêu cầu vừa gửi:\n\n` +
          `Xin chào! Tôi đã nhận được yêu cầu của bạn. Hệ thống NexusAI đang kích hoạt cấu hình mô hình **${modelConfig.name}** với System Prompt: *"${systemPrompt}"*.\n\n` +
          `> Lỗi kết nối API trực tiếp: ${err.message || 'Chưa thiết lập GEMINI_API_KEY chuẩn'}. Hãy kiểm tra Settings > Secrets trên AI Studio hoặc cập nhật API Token trong Dashboard Admin!`,
        tokensUsed: 120,
      };
    }
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
      // Simulate/fallback response if admin hasn't provided API token yet
      const simulatedResponse =
        `### Phản hồi từ ${modelConfig.name} (${modelId})\n\n` +
        `Xin chào! Bạn đang sử dụng mô hình AI được phân quyền cho nhóm người dùng của mình.\n\n` +
        `**Chi tiết Cấu hình Mô hình:**\n` +
        `- **Nhà cung cấp:** OpenAI Compatible\n` +
        `- **Endpoint URL:** \`${baseUrl}\` \n` +
        `- **Model ID:** \`${modelId}\` \n` +
        `- **System Prompt:** *"${systemPrompt}"*\n\n` +
        `> 💡 **Lưu ý Admin:** Để nhận câu trả lời thực tế từ ChatGPT/OpenAI hoặc DeepSeek API, vui lòng nhập **API Token / AI Token** cho mô hình này tại trang **Dashboard Admin -> Quản lý Mô hình AI**!`;

      const estimatedTokens = Math.ceil((JSON.stringify(fullMessages).length + simulatedResponse.length) / 4);
      return {
        content: simulatedResponse,
        tokensUsed: estimatedTokens,
      };
    }

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: fullMessages,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || 'Không có phản hồi từ dịch vụ OpenAI.';
      const tokensUsed = data.usage?.total_tokens || Math.ceil((JSON.stringify(fullMessages).length + content.length) / 4);

      return {
        content,
        tokensUsed,
      };
    } catch (err: any) {
      console.error('[AIProvider] OpenAI API Error:', err.message || err);
      return {
        content: `**[Lỗi Kết Nối AI Token]** Không thể gọi API đến \`${baseUrl}\` (${modelId}):\n\n` +
          `\`\`\`\n${err.message}\n\`\`\`\n\n` +
          `Vui lòng kiểm tra lại **API Token** và **Endpoint URL** đã khai báo trong trang Quản trị Admin.`,
        tokensUsed: 45,
      };
    }
  }
}
