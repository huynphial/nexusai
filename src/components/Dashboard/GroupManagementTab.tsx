import React, { useState } from 'react';
import { UserGroup, AIModel, GroupModelAccess } from '../../types';
import { Plus, Edit2, Trash2, Shield, Sliders, CheckSquare, Square, Zap, Clock } from 'lucide-react';

interface Props {
  groups: UserGroup[];
  allModels: AIModel[];
  onCreateGroup: (data: any) => Promise<void>;
  onUpdateGroup: (id: number, data: any) => Promise<void>;
  onDeleteGroup: (id: number) => Promise<void>;
}

export const GroupManagementTab: React.FC<Props> = ({
  groups,
  allModels,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Access rules matrix mapping model_id -> rule
  const [accessRulesMap, setAccessRulesMap] = useState<Record<number, GroupModelAccess>>({});
  const [loading, setLoading] = useState(false);

  const handleOpenAdd = () => {
    setEditingGroup(null);
    setName('');
    setDescription('');
    // Default matrix with all active models enabled
    const initialMap: Record<number, GroupModelAccess> = {};
    allModels.forEach((m) => {
      initialMap[m.id] = {
        group_id: 0,
        model_id: m.id,
        rate_limit_period: 'day',
        rate_limit_requests: 500,
        max_tokens_group: 500000,
        max_tokens_per_user: 100000,
      };
    });
    setAccessRulesMap(initialMap);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (g: UserGroup) => {
    setEditingGroup(g);
    setName(g.name);
    setDescription(g.description || '');

    const currentMap: Record<number, GroupModelAccess> = {};
    if (g.access_rules) {
      g.access_rules.forEach((r) => {
        currentMap[r.model_id] = { ...r };
      });
    }
    setAccessRulesMap(currentMap);
    setIsModalOpen(true);
  };

  const toggleModelSelection = (modelId: number) => {
    setAccessRulesMap((prev) => {
      const copy = { ...prev };
      if (copy[modelId]) {
        delete copy[modelId];
      } else {
        copy[modelId] = {
          group_id: editingGroup?.id || 0,
          model_id: modelId,
          rate_limit_period: 'day',
          rate_limit_requests: 500,
          max_tokens_group: 500000,
          max_tokens_per_user: 100000,
        };
      }
      return copy;
    });
  };

  const updateRuleField = (modelId: number, field: keyof GroupModelAccess, value: any) => {
    setAccessRulesMap((prev) => {
      if (!prev[modelId]) return prev;
      return {
        ...prev,
        [modelId]: {
          ...prev[modelId],
          [field]: value,
        },
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('Vui lòng nhập tên nhóm.');

    setLoading(true);
    const rulesArray = Object.values(accessRulesMap);

    try {
      if (editingGroup) {
        await onUpdateGroup(editingGroup.id, {
          name,
          description,
          access_rules: rulesArray,
        });
      } else {
        await onCreateGroup({
          name,
          description,
          access_rules: rulesArray,
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu nhóm.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            <span>Quản Lý Nhóm Người Dùng & Ma Trận Rate Limit</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Phân quyền mô hình AI và thiết lập giới hạn Token (Giờ / Ngày / Tuần / Tháng) cho từng nhóm.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Nhóm Mới</span>
        </button>
      </div>

      {/* Groups List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((g) => {
          const isAdminGroup = g.name.toLowerCase().includes('admin') || g.name.toLowerCase().includes('quản trị');
          return (
            <div
              key={g.id}
              className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4 ${
                isAdminGroup
                  ? 'border-amber-300/80 dark:border-amber-900/50'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                      isAdminGroup
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                    }`}>
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{g.name}</h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {g.member_count || 0} thành viên
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(g)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Chỉnh sửa phân quyền mô hình & Quota"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!isAdminGroup && (
                      <button
                        onClick={() => {
                          if (confirm(`Bạn có chắc chắn muốn xóa nhóm "${g.name}" không?`)) {
                            onDeleteGroup(g.id);
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Xóa nhóm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Clear Privilege Badge */}
                <div className="mt-2.5">
                  {isAdminGroup ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/20 text-[10px]">
                      👑 Quyền Quản Trị: Vào Dashboard Quản Trị & Chat LLM
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-bold border border-indigo-500/20 text-[10px]">
                      💬 Quyền Người Dùng: Chỉ được phép Chat LLM
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">
                  {g.description || 'Chưa có mô tả cho nhóm này.'}
                </p>

              {/* Assigned Models Matrix List */}
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Mô hình được cấp quyền & Quota:</span>
                </div>

                {(!g.access_rules || g.access_rules.length === 0) ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                    Chưa được cấp quyền truy cập mô hình nào.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {g.access_rules.map((rule) => (
                      <div
                        key={rule.model_id}
                        className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[11px] border border-slate-200 dark:border-slate-700/60"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                          <span className="text-indigo-600 dark:text-indigo-400">{rule.model_name || `Model #${rule.model_id}`}</span>
                          <span className="font-mono text-[10px] uppercase text-purple-600 dark:text-purple-400">
                            /{rule.rate_limit_period}
                          </span>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                          <div>Lượt yêu cầu: <b className="text-slate-700 dark:text-slate-300 font-mono">{rule.rate_limit_requests.toLocaleString()}</b></div>
                          <div>User Max: <b className="text-slate-700 dark:text-slate-300 font-mono">{rule.max_tokens_per_user.toLocaleString()} tk</b></div>
                          <div className="col-span-2">Group Max: <b className="text-slate-700 dark:text-slate-300 font-mono">{rule.max_tokens_group.toLocaleString()} tokens</b></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>

      {/* Group Create/Edit Modal with Matrix */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between font-bold text-base text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">
              <span>{editingGroup ? `Cấu hình Nhóm: ${editingGroup.name}` : 'Thêm Nhóm Người Dùng Mới'}</span>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tên Nhóm người dùng</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Phòng R&D & AI"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Mô tả mục đích nhóm</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả chức năng hoặc giới hạn của nhóm này..."
                  rows={2}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              {/* Rate Limit Matrix Section */}
              <div className="pt-2">
                <div className="font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-500" />
                  <span>Cấu hình Ma trận Gán Model & Giới hạn Rate Limit / Token Quota:</span>
                </div>

                <div className="space-y-3">
                  {allModels.map((m) => {
                    const isAssigned = !!accessRulesMap[m.id];
                    const rule = accessRulesMap[m.id];

                    return (
                      <div
                        key={m.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isAssigned
                            ? 'bg-indigo-50/50 dark:bg-slate-800/80 border-indigo-300 dark:border-indigo-900'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => toggleModelSelection(m.id)}
                            className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600"
                          >
                            {isAssigned ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span>{m.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {m.model_identifier}
                            </span>
                          </button>
                        </div>

                        {/* Config fields if assigned */}
                        {isAssigned && rule && (
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                            <div>
                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 font-medium">Chu kỳ giới hạn</label>
                              <select
                                value={rule.rate_limit_period}
                                onChange={(e: any) => updateRuleField(m.id, 'rate_limit_period', e.target.value)}
                                className="w-full p-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                              >
                                <option value="hour">Theo Giờ</option>
                                <option value="day">Theo Ngày</option>
                                <option value="week">Theo Tuần</option>
                                <option value="month">Theo Tháng</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 font-medium">Max lượt gọi</label>
                              <input
                                type="number"
                                min={1}
                                value={rule.rate_limit_requests}
                                onChange={(e) => updateRuleField(m.id, 'rate_limit_requests', Number(e.target.value))}
                                className="w-full p-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 font-medium">Group Max Tokens</label>
                              <input
                                type="number"
                                min={100}
                                value={rule.max_tokens_group}
                                onChange={(e) => updateRuleField(m.id, 'max_tokens_group', Number(e.target.value))}
                                className="w-full p-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 font-medium">User Max Tokens</label>
                              <input
                                type="number"
                                min={100}
                                value={rule.max_tokens_per_user}
                                onChange={(e) => updateRuleField(m.id, 'max_tokens_per_user', Number(e.target.value))}
                                className="w-full p-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                  {loading ? 'Đang lưu...' : 'Lưu lại Nhóm & Ma Trận'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
