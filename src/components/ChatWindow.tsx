import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ModelWithQuota } from '../types';
import { MarkdownViewer } from './MarkdownViewer';
import {
  Send,
  Bot,
  User as UserIcon,
  Sparkles,
  AlertCircle,
  Zap,
  RefreshCw,
  Clock,
  Gauge,
  Brain,
  ChevronDown,
  ChevronUp,
  Cpu,
  Sliders,
  Terminal,
} from 'lucide-react';

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onSendMessage: (prompt: string) => void;
  availableModels: ModelWithQuota[];
  selectedModel: ModelWithQuota | undefined;
  onSelectModel: (id: number) => void;
  errorMsg: string | null;
  onClearError: () => void;
  streamingData?: { content: string; thinking?: string; isThinking?: boolean } | null;
}

export const ChatWindow: React.FC<Props> = ({
  messages,
  loading,
  onSendMessage,
  availableModels,
  selectedModel,
  onSelectModel,
  errorMsg,
  onClearError,
  streamingData,
}) => {
  const [prompt, setPrompt] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, streamingData]);

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
    'Giải thích cách hoạt động của cơ chế Thinking/Reasoning trong các mô hình AI mới.',
    'Viết một kịch bản kiểm thử API Chatbot hoàn chỉnh bằng cURL.',
  ];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-white dark:bg-slate-900 relative">
      {/* Active Model Header Bar with Clean Dropdown */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
            <Cpu className="w-4 h-4" />
          </div>

          {/* Simple Dropdown showing ONLY model name */}
          <div className="relative">
            <select
              value={selectedModel?.id || ''}
              onChange={(e) => onSelectModel(Number(e.target.value))}
              className="text-xs sm:text-sm font-bold pl-2 pr-7 py-1.5 bg-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 appearance-none cursor-pointer transition-colors"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.allowed} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {m.name} {!m.allowed ? '(Hết hạn ngạch)' : ''}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 text-slate-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {selectedModel?.timeout_seconds && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              <Clock className="w-3 h-3 text-slate-400" />
              Timeout: {selectedModel.timeout_seconds}s
            </span>
          )}
        </div>

        {selectedModel && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-2 py-1 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
              title="Xem System Prompt"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden md:inline">System Prompt</span>
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
              <span>Chỉ dẫn hệ thống cho {selectedModel.name}:</span>
            </div>
            <button onClick={() => setShowSystemPrompt(false)} className="text-slate-400 hover:text-white">
              ✕
            </button>
          </div>
          <p className="italic bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed">
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
              <div className="font-bold text-red-800 dark:text-red-200 mb-0.5">Thông báo hệ thống</div>
              <p className="leading-relaxed whitespace-pre-line">{errorMsg}</p>
            </div>
          </div>
          <button onClick={onClearError} className="text-red-400 hover:text-red-600 font-bold text-sm">
            ✕
          </button>
        </div>
      )}

      {/* Messages Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingData ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto px-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 mb-4">
              <Sparkles className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Chào mừng bạn đến với Local AI
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Trợ lý trí tuệ nhân tạo hỗ trợ streaming thời gian thực, hiển thị quá trình suy luận (Thinking) và đo lường hiệu năng tốc độ xử lý token chi tiết.
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
                  className={`rounded-2xl p-4 shadow-2xs transition-all max-w-full overflow-hidden ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-none'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  ) : (
                    <>
                      {/* Thinking / Reasoning Box (if model produced thinking) */}
                      {m.thinking_content && (
                        <ThinkingBox thinking={m.thinking_content} isLive={false} />
                      )}

                      <MarkdownViewer content={m.content} />

                      {/* Performance Metrics: Duration, Token Speed, Total Tokens */}
                      <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-y-1 gap-x-3 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <div className="flex items-center flex-wrap gap-2.5">
                          {m.latency_ms !== undefined && m.latency_ms > 0 && (
                            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300" title="Thời gian xử lý câu trả lời">
                              <Clock className="w-3 h-3 text-indigo-500" />
                              {(m.latency_ms / 1000).toFixed(2)}s
                            </span>
                          )}

                          {m.tokens_per_second !== undefined && m.tokens_per_second > 0 && (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title="Tốc độ sinh token">
                              <Gauge className="w-3 h-3 text-emerald-500" />
                              {m.tokens_per_second} tk/s
                            </span>
                          )}

                          {m.tokens_used > 0 && (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium" title="Tổng token tiêu thụ">
                              <Zap className="w-3 h-3 text-amber-500" />
                              {m.tokens_used.toLocaleString()} tokens
                            </span>
                          )}
                        </div>

                        <span className="text-[9px] text-slate-400">
                          {new Date(m.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Live Streaming Message Display */}
        {streamingData && (
          <div className="flex gap-3 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Bot className="w-4 h-4" />
            </div>

            <div className="rounded-2xl rounded-tl-none p-4 bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xs max-w-full overflow-hidden">
              {/* Live Thinking Process */}
              {streamingData.thinking && (
                <ThinkingBox thinking={streamingData.thinking} isLive={streamingData.isThinking} />
              )}

              {streamingData.content ? (
                <MarkdownViewer content={streamingData.content} />
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span>{streamingData.isThinking ? 'Đang suy luận (Thinking)...' : 'Đang chuẩn bị phản hồi...'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {loading && !streamingData && (
          <div className="flex gap-3 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <div className="rounded-2xl rounded-tl-none p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span>Đang kết nối tới mô hình AI...</span>
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

// Collapsible Thinking / Reasoning Process Box
const ThinkingBox = ({ thinking, isLive = false }: { thinking: string; isLive?: boolean }) => {
  const [isOpen, setIsOpen] = useState(isLive);

  useEffect(() => {
    if (isLive) {
      setIsOpen(true);
    }
  }, [isLive]);

  return (
    <div className="mb-3 rounded-xl border border-indigo-200/70 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-slate-950/60 overflow-hidden text-xs transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-indigo-700 dark:text-indigo-400 font-semibold hover:bg-indigo-100/50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Brain className={`w-3.5 h-3.5 ${isLive ? 'animate-pulse text-indigo-500' : 'text-indigo-400'}`} />
          <span>{isLive ? 'Đang suy luận (Thinking)...' : 'Quá trình suy luận (Reasoning Process)'}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span>{isOpen ? 'Thu gọn' : 'Xem chi tiết'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-3 pt-1 border-t border-indigo-100 dark:border-indigo-950/60 font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-60 overflow-y-auto bg-white/40 dark:bg-slate-950/30">
          {thinking}
        </div>
      )}
    </div>
  );
};
