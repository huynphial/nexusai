import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ModelWithQuota } from '../types';
import { MarkdownViewer } from './MarkdownViewer';
import { Send, Bot, User as UserIcon, Sparkles, AlertCircle, Info, Zap, RefreshCw, Terminal, Sliders } from 'lucide-react';

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onSendMessage: (prompt: string) => void;
  selectedModel: ModelWithQuota | undefined;
  errorMsg: string | null;
  onClearError: () => void;
}

export const ChatWindow: React.FC<Props> = ({
  messages,
  loading,
  onSendMessage,
  selectedModel,
  errorMsg,
  onClearError,
}) => {
  const [prompt, setPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    onSendMessage(prompt.trim());
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const examplePrompts = [
    'Tóm tắt các điểm quan trọng về cách cấu hình Rate Limit cho mô hình LLM.',
    'Viết một hàm TypeScript tính toán số lượng Token tiêu thụ theo khoảng thời gian.',
    'Phân tích sự khác biệt giữa OpenAI GPT-4o và DeepSeek Chat.',
    'Viết một kịch bản kiểm thử API Chatbot hoàn chỉnh bằng cURL.',
  ];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-white dark:bg-slate-900 relative">
      {/* Active Model Header Bar */}
      <div className="h-12 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
            {selectedModel ? selectedModel.name : 'Chưa chọn mô hình'}
          </span>
          {selectedModel && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 font-medium">
              {selectedModel.model_identifier}
            </span>
          )}
        </div>

        {selectedModel && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-1 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">System Prompt</span>
            </button>
          </div>
        )}
      </div>

      {/* System Prompt Modal Drawer */}
      {showSystemPrompt && selectedModel && (
        <div className="p-3 bg-slate-900 text-slate-200 border-b border-slate-800 text-xs animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between font-semibold mb-1 text-indigo-400">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>Cấu hình System Prompt cho {selectedModel.name}:</span>
            </div>
            <button onClick={() => setShowSystemPrompt(false)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
          <p className="italic bg-slate-950 p-2 rounded border border-slate-800 text-slate-300 font-mono text-[11px]">
            "{selectedModel.system_prompt || 'Chưa thiết lập system prompt.'}"
          </p>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start justify-between gap-3 text-xs text-red-700 dark:text-red-300 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-red-800 dark:text-red-200 mb-0.5">Cảnh báo Giới hạn & Rate Limit</div>
              <p>{errorMsg}</p>
            </div>
          </div>
          <button onClick={onClearError} className="text-red-400 hover:text-red-600 font-bold text-sm">
            ✕
          </button>
        </div>
      )}

      {/* Messages Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto px-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 mb-4">
              <Sparkles className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Xin chào, bạn cần trợ giúp gì hôm nay?
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Hệ thống NexusAI hỗ trợ khai thác Chat LLM đa mô hình (ChatGPT, DeepSeek, Gemini). Mọi lượt sử dụng được tự động quản lý theo Quota và Rate Limit nhóm.
            </p>

            {/* Example Prompt Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
              {examplePrompts.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(item)}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                >
                  <Bot className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.sender === 'user';

            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs ${
                    isUser
                      ? 'bg-slate-800 dark:bg-slate-700'
                      : 'bg-gradient-to-tr from-indigo-600 to-purple-600'
                  }`}
                >
                  {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl p-4 shadow-2xs transition-all ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <>
                      <MarkdownViewer content={m.content} />
                      {m.tokens_used > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1 font-mono">
                            <Zap className="w-3 h-3 text-amber-500" />
                            {m.tokens_used.toLocaleString()} tokens tiêu thụ
                          </span>
                          <span className="font-mono">{new Date(m.created_at).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex gap-3 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-2xl rounded-tl-none p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span>Mô hình đang suy luận và xử lý câu trả lời...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Box */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || (selectedModel && !selectedModel.allowed)}
            placeholder={
              selectedModel && !selectedModel.allowed
                ? `Đã khóa: ${selectedModel.disallow_reason}`
                : 'Nhập câu hỏi của bạn... (Shift + Enter để xuống dòng)'
            }
            rows={2}
            className="w-full text-xs sm:text-sm p-3 pr-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!prompt.trim() || loading || (selectedModel && !selectedModel.allowed)}
            className="absolute right-3 bottom-3.5 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-lg shadow-sm transition-colors"
            title="Gửi tin nhắn"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
