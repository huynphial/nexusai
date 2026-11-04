import React, { useState } from 'react';
import { ChatSession, ModelWithQuota } from '../types';
import { Plus, MessageSquare, Trash2, Search, Cpu, Zap, Lock, ChevronRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Props {
  sessions: ChatSession[];
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewChat: () => void;
  onDeleteSession: (id: number) => void;
  availableModels: ModelWithQuota[];
  selectedModelId: number | null;
  onSelectModel: (id: number) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<Props> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  availableModels,
  selectedModelId,
  onSelectModel,
  isOpen,
  onCloseMobile,
}) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedModel = availableModels.find((m) => m.id === selectedModelId);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 w-72 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col z-40 transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top: New Chat Action */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2">
          <button
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Cuộc Trò Chuyện Mới</span>
          </button>

          {/* Clean Dropdown Model Selector */}
          <div className="mt-1">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center justify-between px-0.5">
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                <span>Mô hình AI</span>
              </span>
              <span className="text-[10px] text-slate-400">{user?.group_name}</span>
            </label>

            {availableModels.length === 0 ? (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-[11px]">
                Chưa gán mô hình cho nhóm {user?.group_name || 'này'}.
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedModelId || ''}
                  onChange={(e) => onSelectModel(Number(e.target.value))}
                  className="w-full text-xs font-semibold pl-3 pr-8 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id} disabled={!m.allowed}>
                      {m.name} {!m.allowed ? '(Hết hạn ngạch)' : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Model Quota Card */}
        {selectedModel && selectedModel.quota && (
          <div className="mx-3 my-2 p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span className="truncate max-w-[130px] font-bold text-indigo-600 dark:text-indigo-400">
                {selectedModel.name}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                / {selectedModel.quota.period}
              </span>
            </div>

            {/* User Token Bar */}
            <div className="space-y-1.5 text-[10px]">
              <div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Token cá nhân:</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {selectedModel.quota.user_tokens.toLocaleString()} / {selectedModel.quota.max_tokens_per_user.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                  <div
                    className="bg-indigo-500 h-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (selectedModel.quota.user_tokens / selectedModel.quota.max_tokens_per_user) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Group Token Bar */}
              <div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Token cả nhóm:</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {selectedModel.quota.group_tokens.toLocaleString()} / {selectedModel.quota.max_tokens_group.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                  <div
                    className="bg-purple-500 h-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (selectedModel.quota.group_tokens / selectedModel.quota.max_tokens_group) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Session Bar */}
        <div className="px-3 pt-1 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm cuộc trò chuyện..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Lịch sử chat ({filteredSessions.length})
          </div>

          {filteredSessions.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              Chưa có lịch sử chat nào.
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <div
                  key={s.id}
                  className={`group relative flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-900'
                  }`}
                  onClick={() => {
                    onSelectSession(s.id);
                    onCloseMobile();
                  }}
                >
                  <div className="flex items-center gap-2 truncate pr-6">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                    <span className="truncate">{s.title}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity"
                    title="Xóa cuộc trò chuyện"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer User Badge */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
              {user?.name.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="truncate">
              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
            </div>
          </div>
          <span title="Tài khoản an toàn">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          </span>
        </div>
      </aside>
    </>
  );
};
