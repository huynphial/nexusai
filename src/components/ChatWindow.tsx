import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ModelWithQuota, ProgressStep, ProgressSummary } from '../types';
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
  Pause,
  Play,
  Square,
  Copy,
  Check,
  RotateCcw,
  Edit2,
  X,
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
  streamingData?: {
    content: string;
    thinking?: string;
    isThinking?: boolean;
    progress_steps?: ProgressStep[];
    progress_summary?: ProgressSummary;
  } | null;
  onCancelStream?: () => void;
  onTogglePauseStream?: () => void;
  isStreamPaused?: boolean;
  thinkingEnabled?: boolean;
  onToggleThinking?: () => void;
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
  onCancelStream,
  onTogglePauseStream,
  isStreamPaused = false,
  thinkingEnabled = true,
  onToggleThinking,
}) => {
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
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

  const handleCopy = async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handleRetry = (botMsg: ChatMessage) => {
    if (loading) return;
    const idx = messages.findIndex((m) => m.id === botMsg.id);
    let targetPrompt = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') {
        targetPrompt = messages[i].content;
        break;
      }
    }
    if (!targetPrompt) {
      const lastUser = [...messages].reverse().find((m) => m.sender === 'user');
      targetPrompt = lastUser?.content || '';
    }
    if (targetPrompt) {
      onSendMessage(targetPrompt);
    }
  };

  const handleStartEdit = (userMsg: ChatMessage) => {
    setEditingMsgId(userMsg.id);
    setEditingContent(userMsg.content);
  };

  const handleSaveEdit = (newText: string) => {
    if (!newText.trim() || loading) return;
    setEditingMsgId(null);
    onSendMessage(newText.trim());
  };

  const examplePrompts = [
    'Tóm tắt các điểm quan trọng về cách cấu hình Rate Limit cho mô hình LLM.',
    'Viết một hàm TypeScript tính toán số lượng Token tiêu thụ theo khoảng thời gian.',
    'Giải thích cách hoạt động của cơ chế Thinking/Reasoning trong các mô hình AI mới.',
    'Viết một kịch bản kiểm thử API Chatbot hoàn chỉnh bằng cURL.',
  ];

  const modelSupportsThinking = Boolean(selectedModel?.enable_thinking);

  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] bg-white dark:bg-slate-900 relative">
      {/* Active Model Header Bar: Custom Dropdown Menu with Quotas & Thinking Toggle */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
            <Cpu className="w-4 h-4" />
          </div>

          {/* Custom Model Selector Popover: Quota and token consumption visible when expanded */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-slate-100 hover:bg-slate-200/70 dark:bg-slate-800/80 dark:hover:bg-slate-800 rounded-xl text-slate-800 dark:text-slate-100 transition-colors border border-slate-200/80 dark:border-slate-700/80 shadow-2xs cursor-pointer"
            >
              <span className="text-xs sm:text-sm font-bold truncate max-w-[150px] sm:max-w-[220px]">
                {selectedModel?.name || 'Chọn mô hình AI'}
              </span>
              {selectedModel?.provider === 'step_progress' && (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                  RAG
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                  isModelDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Popover with Quota Consumption Details */}
            {isModelDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in duration-150">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between">
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Mô hình AI & Hạn mức Token</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {availableModels.length} mô hình
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto p-2 space-y-2">
                  {availableModels.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Chưa có mô hình nào được phân quyền.
                    </div>
                  ) : (
                    availableModels.map((m) => {
                      const isSelected = m.id === selectedModel?.id;
                      const quota = m.quota;

                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            if (m.allowed) {
                              onSelectModel(m.id);
                              setIsModelDropdownOpen(false);
                            }
                          }}
                          className={`p-3 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-700 shadow-2xs'
                              : 'bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          } ${!m.allowed ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {/* Model Header */}
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                {m.name}
                              </span>
                              {m.provider === 'step_progress' && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
                                  Tiến độ từng bước (RAG)
                                </span>
                              )}
                              {m.is_default && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                  Mặc định
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                              {!m.allowed && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                  Hết hạn ngạch
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Token Quota Details: only visible inside this dropdown when expanded! */}
                          {quota ? (
                            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1.5 text-[10px]">
                              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-medium">
                                <span>Hạn mức ({quota.period}):</span>
                                <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">
                                  {quota.user_requests} / {quota.rate_limit_requests > 0 ? quota.rate_limit_requests : '∞'} req
                                </span>
                              </div>

                              {/* Personal Token Bar */}
                              <div>
                                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                  <span>Token cá nhân:</span>
                                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                    {quota.user_tokens.toLocaleString()} / {quota.max_tokens_per_user > 0 ? quota.max_tokens_per_user.toLocaleString() : '∞'}
                                  </span>
                                </div>
                                {quota.max_tokens_per_user > 0 && (
                                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                                    <div
                                      className="bg-indigo-500 h-full transition-all"
                                      style={{
                                        width: `${Math.min(100, (quota.user_tokens / quota.max_tokens_per_user) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>

                              {/* Group Token Bar */}
                              <div>
                                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                  <span>Token cả nhóm:</span>
                                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                                    {quota.group_tokens.toLocaleString()} / {quota.max_tokens_group > 0 ? quota.max_tokens_group.toLocaleString() : '∞'}
                                  </span>
                                </div>
                                {quota.max_tokens_group > 0 && (
                                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                                    <div
                                      className="bg-purple-500 h-full transition-all"
                                      style={{
                                        width: `${Math.min(100, (quota.group_tokens / quota.max_tokens_group) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 mt-1 font-mono">
                              Không giới hạn hạn mức token
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Thinking Toggle Control */}
        {selectedModel && (
          <div className="flex items-center gap-2">
            {modelSupportsThinking ? (
              <button
                type="button"
                onClick={onToggleThinking}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shadow-2xs ${
                  thinkingEnabled
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={thinkingEnabled ? 'Bấm để tắt suy luận (Thinking)' : 'Bấm để bật suy luận (Thinking)'}
              >
                <Brain className={`w-3.5 h-3.5 ${thinkingEnabled ? 'animate-pulse text-white' : 'text-slate-400'}`} />
                <span>Suy luận: {thinkingEnabled ? 'BẬT' : 'TẮT'}</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium px-2.5 py-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200/60 dark:border-slate-700/50">
                <Brain className="w-3.5 h-3.5 opacity-40" />
                <span className="hidden sm:inline">Không hỗ trợ suy luận</span>
              </span>
            )}
          </div>
        )}
      </div>

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
                    editingMsgId === m.id ? (
                      <div className="space-y-2 min-w-[240px] sm:min-w-[320px]">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(editingContent);
                            } else if (e.key === 'Escape') {
                              setEditingMsgId(null);
                            }
                          }}
                          rows={3}
                          className="w-full text-xs sm:text-sm p-2 rounded-xl bg-indigo-700 text-white placeholder-indigo-300 border border-indigo-400 focus:outline-hidden focus:ring-1 focus:ring-white resize-none"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingMsgId(null)}
                            className="p-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-indigo-200 hover:text-white transition-colors cursor-pointer"
                            title="Hủy"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(editingContent)}
                            disabled={!editingContent.trim() || loading}
                            className="p-1.5 rounded-lg bg-white text-indigo-700 hover:bg-indigo-50 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                            title="Gửi lại"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                        <div className="mt-2 pt-1.5 border-t border-indigo-500/30 flex items-center justify-end gap-1 text-indigo-200">
                          <button
                            type="button"
                            onClick={() => handleCopy(m.id, m.content)}
                            className="p-1 rounded-lg hover:bg-indigo-700/80 text-indigo-200 hover:text-white transition-colors cursor-pointer"
                            title="Sao chép"
                          >
                            {copiedId === m.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(m)}
                            className="p-1 rounded-lg hover:bg-indigo-700/80 text-indigo-200 hover:text-white transition-colors cursor-pointer"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    <>
                      {/* Step-by-Step Execution Progress (Gateway / RAG model) */}
                      {m.progress_steps && m.progress_steps.length > 0 && (
                        <ProgressTimeline steps={m.progress_steps} summary={m.progress_summary} isLive={false} />
                      )}

                      {/* Thinking / Reasoning Box (if model produced thinking) */}
                      {m.thinking_content && (
                        <ThinkingBox thinking={m.thinking_content} isLive={false} />
                      )}

                      <MarkdownViewer content={m.content} />

                      {/* Performance Metrics & Action Buttons (Pure icon buttons, no text) */}
                      <div className="mt-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-y-1.5 gap-x-3 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
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

                        {/* Action Buttons: Copy & Retry (Pure icon buttons, no text) */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopy(m.id, m.content)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                            title="Sao chép câu trả lời"
                          >
                            {copiedId === m.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRetry(m)}
                            disabled={loading}
                            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-40 cursor-pointer"
                            title="Tạo lại câu trả lời"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>

                          <span className="text-[9px] text-slate-400 ml-1">
                            {new Date(m.created_at).toLocaleTimeString()}
                          </span>
                        </div>
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
              {/* Paused Banner */}
              {isStreamPaused && (
                <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex items-center gap-2">
                  <Pause className="w-3.5 h-3.5" />
                  <span>Đang tạm dừng stream. Nhấn nút <b>"Tiếp tục"</b> bên dưới để nhận tiếp.</span>
                </div>
              )}

              {/* Live Step-by-Step Execution Progress (Gateway / RAG model) */}
              {streamingData.progress_steps && streamingData.progress_steps.length > 0 && (
                <ProgressTimeline
                  steps={streamingData.progress_steps}
                  summary={streamingData.progress_summary}
                  isLive={true}
                />
              )}

              {/* Live Thinking Process (Streamed in realtime if model supports thinking and user has thinking enabled) */}
              {thinkingEnabled && modelSupportsThinking && (streamingData.thinking || streamingData.isThinking) && (
                <ThinkingBox
                  thinking={streamingData.thinking || 'Đang phân tích câu hỏi và chuẩn bị các bước suy luận...'}
                  isLive={streamingData.isThinking}
                />
              )}

              {streamingData.content ? (
                <MarkdownViewer content={streamingData.content} />
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 py-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span>
                    {thinkingEnabled && modelSupportsThinking && streamingData.isThinking
                      ? 'Đang suy luận (Thinking)...'
                      : 'Đang chuẩn bị phản hồi...'}
                  </span>
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

      {/* Input Form Box with Cancel, Pause, Resume Controls */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Active Stream Control Toolbar */}
          {(loading || streamingData) && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl animate-in fade-in">
              <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                <RefreshCw className={`w-3.5 h-3.5 ${isStreamPaused ? '' : 'animate-spin'}`} />
                <span>
                  {isStreamPaused
                    ? '⏸️ Đang tạm dừng phát'
                    : streamingData?.isThinking && thinkingEnabled && modelSupportsThinking
                    ? '🧠 Đang suy luận...'
                    : '⚡ Đang nhận câu trả lời...'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {onTogglePauseStream && (
                  <button
                    type="button"
                    onClick={onTogglePauseStream}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    title={isStreamPaused ? 'Tiếp tục nhận phản hồi' : 'Tạm dừng nhận phản hồi'}
                  >
                    {isStreamPaused ? (
                      <>
                        <Play className="w-3 h-3 fill-amber-600 text-amber-600" />
                        <span>Tiếp tục</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Tạm dừng</span>
                      </>
                    )}
                  </button>
                )}

                {onCancelStream && (
                  <button
                    type="button"
                    onClick={onCancelStream}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer"
                    title="Hủy tiến trình phản hồi hiện tại"
                  >
                    <Square className="w-3 h-3 fill-red-600 text-red-600" />
                    <span>Hủy</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative">
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
              className="absolute right-3 bottom-3.5 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Gửi tin nhắn"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
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

// Step-by-Step Execution Progress Timeline (Progress Gateway / RAG)
const ProgressTimeline: React.FC<{
  steps: ProgressStep[];
  summary?: ProgressSummary;
  isLive?: boolean;
}> = ({ steps, summary, isLive = false }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);

  const handleCopySql = async (id: string, sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedSqlId(id);
      setTimeout(() => setCopiedSqlId(null), 1800);
    } catch {
      // ignore
    }
  };

  const doneSteps = steps.filter((s) => s.status === 'done').length;
  const hasError = steps.some((s) => s.status === 'error');
  const isRunning = isLive && steps.some((s) => s.status === 'running');
  const totalMs = summary?.total_ms || (steps.length > 0 && steps[steps.length - 1].end_ms && steps[0].start_ms !== undefined ? (steps[steps.length - 1].end_ms! - steps[0].start_ms!) : 0);

  return (
    <div className="mb-3 rounded-2xl border border-purple-200/80 dark:border-purple-900/50 bg-gradient-to-b from-purple-50/70 to-indigo-50/40 dark:from-slate-950/90 dark:to-purple-950/30 overflow-hidden text-xs shadow-2xs transition-all">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-purple-900 dark:text-purple-300 font-semibold hover:bg-purple-100/50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {isRunning ? (
            <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
            </div>
          ) : hasError ? (
            <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          )}
          <span className="font-bold text-xs">
            {isRunning ? 'Tiến độ thực hiện từng bước (Đang chạy...)' : 'Tiến trình thực hiện từng bước (Gateway / RAG)'}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
            {doneSteps}/{steps.length} bước
          </span>
          {totalMs > 0 && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              · {(totalMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400">
          <span>{isOpen ? 'Thu gọn' : 'Xem tiến độ'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Steps List */}
      {isOpen && (
        <div className="p-3 pt-1 border-t border-purple-100 dark:border-purple-950/70 space-y-2 bg-white/60 dark:bg-slate-950/40">
          {steps.map((step, idx) => {
            const isDone = step.status === 'done';
            const isRunningStep = step.status === 'running';
            const isError = step.status === 'error';
            const isSql = step.meta?.kind === 'sql' || (step.detail && /^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(step.detail.trim()));

            return (
              <div
                key={step.id || idx}
                className={`relative pl-6 pb-2 last:pb-0 ${
                  idx !== steps.length - 1 ? 'border-l-2 border-slate-200 dark:border-slate-800 ml-2.5' : 'ml-2.5'
                }`}
              >
                {/* Node marker icon */}
                <div
                  className={`absolute -left-[9px] top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ring-2 ring-white dark:ring-slate-900 ${
                    isRunningStep
                      ? 'bg-indigo-600 text-white animate-pulse'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : isError
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-600'
                  }`}
                >
                  {isRunningStep ? (
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  ) : isDone ? (
                    <Check className="w-2.5 h-2.5" />
                  ) : isError ? (
                    '!'
                  ) : (
                    '•'
                  )}
                </div>

                {/* Step Content Card */}
                <div className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                      <span>{step.title || step.id}</span>
                      {step.phase && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-normal bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase tracking-wider">
                          {step.phase}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      {step.duration_ms !== null && step.duration_ms !== undefined ? (
                        <span className="text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {step.duration_ms}ms
                        </span>
                      ) : isRunningStep ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">
                          Đang chạy...
                        </span>
                      ) : null}

                      {step.meta?.rows !== undefined && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200/50 dark:border-emerald-900/50">
                          {step.meta.rows} dòng
                        </span>
                      )}

                      {step.meta?.intent && (
                        <span className="text-purple-600 dark:text-purple-400 font-medium bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200/50 dark:border-purple-900/50">
                          {step.meta.intent}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Step detail (SQL query or explanation) */}
                  {step.detail && (
                    <div className="mt-1.5">
                      {isSql ? (
                        <div className="relative group">
                          <pre className="p-2 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all border border-slate-800">
                            {step.detail}
                          </pre>
                          <button
                            type="button"
                            onClick={() => handleCopySql(step.id, step.detail!)}
                            className="absolute top-1.5 right-1.5 p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-opacity text-[10px] flex items-center gap-1 shadow-xs cursor-pointer"
                            title="Sao chép SQL"
                          >
                            {copiedSqlId === step.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
