import React, { useState } from 'react';
import { AIModel } from '../../types';
import { Plus, Edit2, Trash2, Cpu, Key, Globe, Terminal, CheckCircle, XCircle, Clock, Radio, Brain } from 'lucide-react';

interface Props {
  models: AIModel[];
  onCreateModel: (data: any) => Promise<void>;
  onUpdateModel: (id: number, data: any) => Promise<void>;
  onDeleteModel: (id: number) => Promise<void>;
}

export const ModelManagementTab: React.FC<Props> = ({
  models,
  onCreateModel,
  onUpdateModel,
  onDeleteModel,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<'openai_compatible' | 'gemini' | 'step_progress' | 'custom'>('openai_compatible');
  const [modelIdentifier, setModelIdentifier] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(60);
  const [enableStream, setEnableStream] = useState<boolean>(true);
  const [enableThinking, setEnableThinking] = useState<boolean>(true);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  const handleOpenAdd = () => {
    setEditingModel(null);
    setName('');
    setProvider('openai_compatible');
    setModelIdentifier('gpt-4o');
    setApiUrl('https://api.openai.com/v1');
    setApiToken('');
    setSystemPrompt('Bạn là trợ lý trí tuệ nhân tạo Local AI, hỗ trợ người dùng chu đáo bằng Tiếng Việt.');
    setTimeoutSeconds(60);
    setEnableStream(true);
    setEnableThinking(true);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: AIModel) => {
    setEditingModel(m);
    setName(m.name);
    setProvider(m.provider);
    setModelIdentifier(m.model_identifier);
    setApiUrl(m.api_url || '');
    setApiToken(m.masked_token || '');
    setSystemPrompt(m.system_prompt || '');
    setTimeoutSeconds(m.timeout_seconds || 60);
    setEnableStream(m.enable_stream === 1 || m.enable_stream === true || m.enable_stream === undefined);
    setEnableThinking(m.enable_thinking === 1 || m.enable_thinking === true || m.enable_thinking === undefined);
    setIsActive(m.is_active === 1 || m.is_active === true);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !modelIdentifier.trim()) {
      return alert('Vui lòng điền đầy đủ Tên mô hình và Mã định danh.');
    }

    setLoading(true);
    try {
      const payload = {
        name,
        provider,
        model_identifier: modelIdentifier,
        api_url: apiUrl,
        api_token: apiToken,
        system_prompt: systemPrompt,
        timeout_seconds: timeoutSeconds,
        enable_stream: enableStream ? 1 : 0,
        enable_thinking: enableThinking ? 1 : 0,
        is_active: isActive,
      };

      if (editingModel) {
        await onUpdateModel(editingModel.id, payload);
      } else {
        await onCreateModel(payload);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu thông tin mô hình.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span>Khai Báo Mô Hình, Timeout, Stream & Thinking (Local AI)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cấu hình thời gian chờ tối đa (Timeout) ngăn lỗi treo API, cơ chế Stream thời gian thực và trích xuất quá trình suy luận (Thinking).
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Khai Báo Model Mới</span>
        </button>
      </div>

      {/* Models Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Tên Mô Hình</th>
                <th className="p-3">Mã Model (ID)</th>
                <th className="p-3">Thời Gian Chờ (Timeout)</th>
                <th className="p-3">Tính Năng</th>
                <th className="p-3">Trạng Thái Token</th>
                <th className="p-3">Kích Hoạt</th>
                <th className="p-3 text-center">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-400">
                    Chưa khai báo mô hình AI nào.
                  </td>
                </tr>
              ) : (
                models.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                      {m.name}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {m.provider === 'step_progress' ? (
                          <span className="text-purple-600 dark:text-purple-400 font-semibold">⚡ Suy luận từng bước</span>
                        ) : (
                          m.provider
                        )}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{m.model_identifier}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/20">
                        <Clock className="w-3 h-3 text-amber-500" />
                        {m.timeout_seconds || 60}s
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {m.enable_stream !== 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                            <Radio className="w-2.5 h-2.5" /> Stream
                          </span>
                        )}
                        {m.enable_thinking !== 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium border border-purple-500/20">
                            <Brain className="w-2.5 h-2.5" /> Thinking
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {m.provider === 'gemini' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                          Tích hợp sẵn SDK
                        </span>
                      ) : m.has_token ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.masked_token}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          Chưa có Token (Demo Mode)
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {m.is_active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                          <CheckCircle className="w-3.5 h-3.5" /> Bật
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[10px]">
                          <XCircle className="w-3.5 h-3.5" /> Tắt
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Chỉnh sửa cấu hình"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Bạn có chắc chắn muốn xóa mô hình "${m.name}" không?`)) {
                              onDeleteModel(m.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Xóa mô hình"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Edit / Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between font-bold text-base text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">
              <span>{editingModel ? `Chỉnh sửa Mô hình AI: ${editingModel.name}` : 'Khai Báo Mô hình AI Mới'}</span>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tên Mô Hình hiển thị</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: GPT-4o hoặc DeepSeek R1"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Loại Provider</label>
                  <select
                    value={provider}
                    onChange={(e: any) => {
                      const newP = e.target.value;
                      setProvider(newP);
                      if (newP === 'step_progress' && !editingModel) {
                        setApiUrl('http://localhost:8000/v1');
                        setModelIdentifier('qwen3:8b');
                      }
                    }}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  >
                    <option value="openai_compatible">OpenAI Compatible (ChatGPT/DeepSeek/vLLM)</option>
                    <option value="step_progress">Model Suy Luận Từng Bước</option>
                    <option value="gemini">Gemini SDK</option>
                    <option value="custom">Custom Proxy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Mã Model Identifier</label>
                  <input
                    type="text"
                    required
                    value={modelIdentifier}
                    onChange={(e) => setModelIdentifier(e.target.value)}
                    placeholder="gpt-4o / deepseek-chat"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Timeout & Execution settings */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Thời gian chờ tối đa & Cơ chế xử lý</span>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                    Thời gian chờ tối đa (Timeout theo giây):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={600}
                      value={timeoutSeconds}
                      onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                      className="w-32 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs"
                    />
                    <span className="text-slate-500 text-[11px]">giây (Mặc định: 60s, đề xuất: 120s cho mô hình lớn/suy luận)</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2 border-t border-slate-200/60 dark:border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableStream}
                      onChange={(e) => setEnableStream(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Bật Stream câu trả lời thời gian thực (Server-Sent Events)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableThinking}
                      onChange={(e) => setEnableThinking(e.target.checked)}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    <span>Bật hiển thị quá trình suy luận (Thinking / Reasoning Box)</span>
                  </label>
                </div>
              </div>

              {provider !== 'gemini' && (
                <>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Endpoint Base URL</label>
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">AI Token / API Key</label>
                    <input
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="sk-..."
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">System Prompt mặc định</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={2}
                  placeholder="Khai báo chỉ dẫn hệ thống cho Mô hình AI..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isActiveCheck" className="text-slate-700 dark:text-slate-300 font-semibold cursor-pointer">
                  Kích hoạt cho phép phân quyền người dùng
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm"
                >
                  {loading ? 'Đang lưu...' : 'Lưu lại Mô hình'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
