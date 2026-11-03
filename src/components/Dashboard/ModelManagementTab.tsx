import React, { useState } from 'react';
import { AIModel } from '../../types';
import { Plus, Edit2, Trash2, Cpu, Key, Globe, Terminal, CheckCircle, XCircle } from 'lucide-react';

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
  const [provider, setProvider] = useState<'openai_compatible' | 'gemini' | 'custom'>('openai_compatible');
  const [modelIdentifier, setModelIdentifier] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  const handleOpenAdd = () => {
    setEditingModel(null);
    setName('');
    setProvider('openai_compatible');
    setModelIdentifier('gpt-4o');
    setApiUrl('https://api.openai.com/v1');
    setApiToken('');
    setSystemPrompt('Bạn là trợ lý AI thông minh, hỗ trợ xử lý công việc bằng Tiếng Việt.');
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
      if (editingModel) {
        await onUpdateModel(editingModel.id, {
          name,
          provider,
          model_identifier: modelIdentifier,
          api_url: apiUrl,
          api_token: apiToken,
          system_prompt: systemPrompt,
          is_active: isActive,
        });
      } else {
        await onCreateModel({
          name,
          provider,
          model_identifier: modelIdentifier,
          api_url: apiUrl,
          api_token: apiToken,
          system_prompt: systemPrompt,
          is_active: isActive,
        });
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
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <span>Khai Báo AI Token & Mô Hình Chat Tương Thích ChatGPT</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Admin khai báo AI Token (OpenAI, DeepSeek, OpenRouter) kèm theo System Prompt mặc định cho từng Model.
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
                <th className="p-3">Loại Provider</th>
                <th className="p-3">Mã Model (ID)</th>
                <th className="p-3">Endpoint Base URL</th>
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
                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{m.name}</td>
                    <td className="p-3 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold">
                        {m.provider}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{m.model_identifier}</td>
                    <td className="p-3 font-mono text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                      {m.api_url || '(Sử dụng Gemini Server)'}
                    </td>
                    <td className="p-3">
                      {m.provider === 'gemini' ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                          Tích hợp sẵn Gemini
                        </span>
                      ) : m.has_token ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.masked_token}
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          Chưa nhập Token (Demo Mode)
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

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tên Mô Hình hiển thị</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: ChatGPT GPT-4o Open Chat"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Loại Provider</label>
                  <select
                    value={provider}
                    onChange={(e: any) => setProvider(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  >
                    <option value="openai_compatible">OpenAI Compatible (ChatGPT)</option>
                    <option value="gemini">Gemini Server SDK</option>
                    <option value="custom">Custom REST Proxy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Mã Model Identifier</label>
                  <input
                    type="text"
                    required
                    value={modelIdentifier}
                    onChange={(e) => setModelIdentifier(e.target.value)}
                    placeholder="gpt-4o / gpt-4o-mini / deepseek-chat"
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                  />
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
                    <p className="text-[10px] text-slate-400 mt-1">
                      Token được lưu mã hóa an toàn trên cơ sở dữ liệu backend.
                    </p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">System Prompt mặc định</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
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
