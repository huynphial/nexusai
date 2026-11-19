import React, { useState } from 'react';
import { McpServer, McpToolDefinition, UserGroup } from '../../types';
import {
  Plus,
  Edit2,
  Trash2,
  Plug,
  RefreshCw,
  Wrench,
  CheckCircle,
  XCircle,
  AlertCircle,
  Terminal,
  Globe,
  Radio,
  Play,
  Clock,
  Shield,
} from 'lucide-react';

interface Props {
  servers: McpServer[];
  groups?: UserGroup[];
  onCreateServer: (data: Partial<McpServer>) => Promise<any>;
  onUpdateServer: (id: number, data: Partial<McpServer>) => Promise<any>;
  onDeleteServer: (id: number) => Promise<void>;
  onTestServer: (id: number) => Promise<any>;
  onCallTool: (id: number, data: { toolName: string; arguments?: Record<string, any> }) => Promise<{ isError: boolean; text: string; raw?: any }>;
}

const TRANSPORT_LABELS: Record<string, string> = {
  streamable_http: 'Streamable HTTP',
  sse: 'Legacy SSE',
  stdio: 'Local Stdio',
};

export const McpManagementTab: React.FC<Props> = ({
  servers,
  groups = [],
  onCreateServer,
  onUpdateServer,
  onDeleteServer,
  onTestServer,
  onCallTool,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<'streamable_http' | 'sse' | 'stdio'>('streamable_http');
  const [url, setUrl] = useState('');
  const [headersJson, setHeadersJson] = useState('');
  const [command, setCommand] = useState('');
  const [argsJson, setArgsJson] = useState('[]');
  const [envJson, setEnvJson] = useState('{}');
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30);
  const [allowedGroupIds, setAllowedGroupIds] = useState<number[]>([]);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const [testingId, setTestingId] = useState<number | null>(null);
  const [testNotice, setTestNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tools Viewer / Tester Modal
  const [toolsModalServer, setToolsModalServer] = useState<McpServer | null>(null);
  const [selectedTool, setSelectedTool] = useState<McpToolDefinition | null>(null);
  const [toolArgsInput, setToolArgsInput] = useState('{}');
  const [toolRunning, setToolRunning] = useState(false);
  const [toolOutput, setToolOutput] = useState<{ isError: boolean; text: string } | null>(null);

  const handleOpenAdd = () => {
    setEditingServer(null);
    setName('');
    setDescription('');
    setTransport('streamable_http');
    setUrl('http://localhost:8001/mcp');
    setHeadersJson('');
    setCommand('');
    setArgsJson('[]');
    setEnvJson('{}');
    setTimeoutSeconds(30);
    // Default check groups that already have MCP enabled (e.g. Admin group)
    setAllowedGroupIds(groups.filter((g) => Boolean(g.enable_mcp)).map((g) => g.id));
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (srv: McpServer) => {
    setEditingServer(srv);
    setName(srv.name);
    setDescription(srv.description || '');
    setTransport(srv.transport || 'streamable_http');
    setUrl(srv.url || '');
    setHeadersJson(srv.headers_json || '');
    setCommand(srv.command || '');
    setArgsJson(srv.args_json || '[]');
    setEnvJson(srv.env_json || '{}');
    setTimeoutSeconds(srv.timeout_seconds || 30);
    setAllowedGroupIds(Array.isArray(srv.allowed_group_ids) ? srv.allowed_group_ids : []);
    setIsActive(srv.is_active === 1 || srv.is_active === true);
    setIsModalOpen(true);
  };

  const toggleAllowedGroup = (gId: number) => {
    setAllowedGroupIds((prev) =>
      prev.includes(gId) ? prev.filter((id) => id !== gId) : [...prev, gId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return alert('Vui lòng nhập tên MCP server.');
    }

    setSaving(true);
    setTestNotice(null);
    try {
      const payload: Partial<McpServer> = {
        name: name.trim(),
        description: description.trim(),
        transport,
        url: url.trim(),
        headers_json: headersJson.trim(),
        command: command.trim(),
        args_json: argsJson.trim(),
        env_json: envJson.trim(),
        timeout_seconds: timeoutSeconds,
        allowed_group_ids: allowedGroupIds,
        is_active: isActive ? 1 : 0,
      };

      if (editingServer) {
        await onUpdateServer(editingServer.id, payload);
        setTestNotice({ type: 'success', text: `Đã cập nhật MCP Server "${name.trim()}".` });
      } else {
        const res = await onCreateServer(payload);
        if (res?.sync?.success) {
          setTestNotice({
            type: 'success',
            text: `Đã thêm "${name.trim()}" và đồng bộ thành công ${res.sync.tools?.length || 0} công cụ (${res.sync.latency_ms || 0}ms).`,
          });
        } else {
          setTestNotice({
            type: 'error',
            text: `Đã lưu "${name.trim()}" nhưng chưa kết nối được ngay: ${res?.sync?.error || 'Kiểm tra lại URL/Command.'}`,
          });
        }
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu cấu hình MCP server.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (srv: McpServer) => {
    setTestingId(srv.id);
    setTestNotice(null);
    try {
      const res = await onTestServer(srv.id);
      if (res.success) {
        setTestNotice({
          type: 'success',
          text: `MCP "${srv.name}": Kết nối thành công (${res.tools?.length || 0} công cụ, ${res.latency_ms || 0}ms).`,
        });
      } else {
        setTestNotice({
          type: 'error',
          text: `MCP "${srv.name}" lỗi kết nối: ${res.error || 'Không thể handshake.'}`,
        });
      }
    } catch (err: any) {
      setTestNotice({
        type: 'error',
        text: err.message || 'Lỗi khi kiểm tra kết nối MCP.',
      });
    } finally {
      setTestingId(null);
    }
  };

  const buildExampleArgs = (schema?: Record<string, any>): string => {
    if (!schema || !schema.properties || typeof schema.properties !== 'object') {
      return '{}';
    }
    const sample: Record<string, any> = {};
    for (const [key, prop] of Object.entries<any>(schema.properties)) {
      if (prop?.default !== undefined) {
        sample[key] = prop.default;
      } else if (prop?.type === 'number' || prop?.type === 'integer') {
        sample[key] = 0;
      } else if (prop?.type === 'boolean') {
        sample[key] = false;
      } else if (prop?.type === 'array') {
        sample[key] = [];
      } else if (prop?.type === 'object') {
        sample[key] = {};
      } else {
        sample[key] = '';
      }
    }
    return JSON.stringify(sample, null, 2);
  };

  const handleOpenToolsModal = (srv: McpServer) => {
    setToolsModalServer(srv);
    const firstTool = srv.tools && srv.tools.length > 0 ? srv.tools[0] : null;
    setSelectedTool(firstTool);
    setToolArgsInput(buildExampleArgs(firstTool?.inputSchema));
    setToolOutput(null);
  };

  const handleSelectTool = (tool: McpToolDefinition) => {
    setSelectedTool(tool);
    setToolArgsInput(buildExampleArgs(tool.inputSchema));
    setToolOutput(null);
  };

  const handleRunToolTest = async () => {
    if (!toolsModalServer || !selectedTool) return;
    let parsedArgs: Record<string, any> = {};
    try {
      parsedArgs = toolArgsInput.trim() ? JSON.parse(toolArgsInput) : {};
    } catch {
      return setToolOutput({ isError: true, text: 'Tham số JSON không hợp lệ. Vui lòng kiểm tra cú pháp JSON.' });
    }

    setToolRunning(true);
    setToolOutput(null);
    try {
      const res = await onCallTool(toolsModalServer.id, {
        toolName: selectedTool.name,
        arguments: parsedArgs,
      });
      setToolOutput({ isError: !!res.isError, text: res.text || '(Không có dữ liệu trả về)' });
    } catch (err: any) {
      setToolOutput({ isError: true, text: err.message || 'Lỗi khi gọi tool MCP.' });
    } finally {
      setToolRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Plug className="w-4 h-4 text-indigo-500" />
            <span>Quản Lý MCP Servers (Model Context Protocol)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Khai báo các MCP Server (Streamable HTTP, SSE hoặc Local Stdio) để kết nối và cung cấp Tools tự động cho Ollama, OpenAI-Compatible &amp; Gemini.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm MCP Server</span>
        </button>
      </div>

      {/* Status Notice */}
      {testNotice && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            testNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
          }`}
        >
          {testNotice.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{testNotice.text}</span>
        </div>
      )}

      {/* Servers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Tên MCP Server</th>
                <th className="p-3">Giao Thức (Transport)</th>
                <th className="p-3">Endpoint / Command</th>
                <th className="p-3">Trạng Thái Kết Nối</th>
                <th className="p-3">Công Cụ (Tools)</th>
                <th className="p-3">Nhóm Được Phép</th>
                <th className="p-3">Kích Hoạt</th>
                <th className="p-3 text-center">Hành Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {servers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    Chưa có MCP Server nào được khai báo. Bấm &quot;Thêm MCP Server&quot; để kết nối công cụ cho mô hình AI.
                  </td>
                </tr>
              ) : (
                servers.map((srv) => (
                  <tr key={srv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{srv.name}</div>
                      {srv.description && (
                        <div className="text-[11px] text-slate-400 line-clamp-1">{srv.description}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        {srv.transport === 'stdio' ? (
                          <Terminal className="w-3 h-3" />
                        ) : srv.transport === 'sse' ? (
                          <Radio className="w-3 h-3" />
                        ) : (
                          <Globe className="w-3 h-3" />
                        )}
                        {TRANSPORT_LABELS[srv.transport] || srv.transport}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {srv.transport === 'stdio' ? (
                        <span title={`${srv.command} ${srv.args_json || ''}`}>
                          {srv.command} {srv.args_json && srv.args_json !== '[]' ? srv.args_json : ''}
                        </span>
                      ) : (
                        <span title={srv.url}>{srv.url}</span>
                      )}
                    </td>
                    <td className="p-3">
                      {srv.last_status === 'connected' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                          <CheckCircle className="w-3 h-3" /> Đã kết nối
                        </span>
                      ) : srv.last_status === 'error' ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-semibold border border-red-500/20"
                          title={srv.last_error}
                        >
                          <XCircle className="w-3 h-3" /> Lỗi kết nối
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                          <Clock className="w-3 h-3" /> Chưa kiểm tra
                        </span>
                      )}
                      {srv.last_status === 'error' && srv.last_error && (
                        <div className="text-[10px] text-red-500 mt-1 max-w-[200px] truncate" title={srv.last_error}>
                          {srv.last_error}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleOpenToolsModal(srv)}
                        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                      >
                        <Wrench className="w-3 h-3 text-indigo-500" />
                        <span>{srv.tools_count || 0} tools</span>
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1 max-w-[190px]">
                        {srv.allowed_groups && srv.allowed_groups.length > 0 ? (
                          srv.allowed_groups.map((ag) => (
                            <span
                              key={ag.id}
                              title={
                                ag.enable_mcp
                                  ? `${ag.name} đang BẬT quyền MCP`
                                  : `${ag.name} hiện đang TẮT quyền MCP tổng ở tab Nhóm`
                              }
                              className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                                ag.enable_mcp
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 opacity-75'
                              }`}
                            >
                              {ag.name.replace(/\s*\(.*?\)\s*/g, '')}
                              {!ag.enable_mcp ? ' (Tắt MCP)' : ''}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Chưa cấp cho nhóm nào</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      {srv.is_active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                          <CheckCircle className="w-3.5 h-3.5" /> Bật
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                          <XCircle className="w-3.5 h-3.5" /> Tắt
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleTest(srv)}
                          disabled={testingId === srv.id}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                          title="Kiểm tra kết nối & Đồng bộ danh sách Tools"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testingId === srv.id ? 'animate-spin text-emerald-500' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(srv)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Chỉnh sửa MCP Server"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Bạn có chắc chắn muốn xóa MCP Server "${srv.name}" không?`)) {
                              onDeleteServer(srv.id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Xóa MCP Server"
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

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between font-bold text-base text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3">
              <span>{editingServer ? `Chỉnh sửa MCP Server: ${editingServer.name}` : 'Thêm MCP Server Mới'}</span>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tên MCP Server</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Enterprise Database MCP hoặc Weather Tools"
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Mô tả (Tùy chọn)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả chức năng của các tool trong MCP server này..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Giao thức kết nối (Transport)</label>
                  <select
                    value={transport}
                    onChange={(e: any) => {
                      const next = e.target.value;
                      setTransport(next);
                      if (!editingServer) {
                        if (next === 'streamable_http') setUrl('http://localhost:8001/mcp');
                        if (next === 'sse') setUrl('http://localhost:8001/sse');
                        if (next === 'stdio') {
                          setCommand('npx');
                          setArgsJson('["-y", "@modelcontextprotocol/server-everything"]');
                        }
                      }
                    }}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  >
                    <option value="streamable_http">Streamable HTTP (Khuyên dùng)</option>
                    <option value="sse">Legacy SSE (GET /sse + POST)</option>
                    <option value="stdio">Local Stdio (Subprocess)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Timeout mỗi lệnh (giây)</label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                  />
                </div>
              </div>

              {transport !== 'stdio' ? (
                <>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">MCP Endpoint URL</label>
                    <input
                      type="text"
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={transport === 'sse' ? 'http://localhost:8001/sse' : 'http://localhost:8001/mcp'}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                      Custom HTTP Headers JSON (Tùy chọn, ví dụ Authorization)
                    </label>
                    <textarea
                      value={headersJson}
                      onChange={(e) => setHeadersJson(e.target.value)}
                      rows={2}
                      placeholder='{"Authorization": "Bearer your-token"}'
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-[11px]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Command thực thi</label>
                    <input
                      type="text"
                      required
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="npx hoặc python3 hoặc node"
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Arguments (Mảng JSON)</label>
                    <input
                      type="text"
                      value={argsJson}
                      onChange={(e) => setArgsJson(e.target.value)}
                      placeholder='["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Biến môi trường Env (JSON Object)</label>
                    <textarea
                      value={envJson}
                      onChange={(e) => setEnvJson(e.target.value)}
                      rows={2}
                      placeholder='{"API_KEY": "..."}'
                      className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-[11px]"
                    />
                  </div>
                </>
              )}

              {/* Group Authorization Selector */}
              {groups.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-purple-500" />
                    <span>Phân quyền Nhóm Người Dùng sử dụng MCP này</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Chỉ những nhóm được tích chọn ở đây VÀ đang BẬT quyền MCP tổng (ở tab Quản Lý Nhóm) mới được phép dùng MCP server này.
                  </p>
                  <div className="space-y-1.5">
                    {groups.map((g) => (
                      <label
                        key={g.id}
                        className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allowedGroupIds.includes(g.id)}
                            onChange={() => toggleAllowedGroup(g.id)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-medium text-slate-700 dark:text-slate-300">{g.name}</span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            g.enable_mcp
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {g.enable_mcp ? 'MCP Nhóm: BẬT' : 'MCP Nhóm: TẮT'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="mcpIsActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="mcpIsActiveCheck" className="text-slate-700 dark:text-slate-300 font-semibold cursor-pointer">
                  Kích hoạt MCP Server (Sẵn sàng cung cấp tools cho mô hình AI)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Đang lưu & kết nối...' : 'Lưu MCP Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tools Viewer & Tester Modal */}
      {toolsModalServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between font-bold text-base text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-indigo-500" />
                <span>Công cụ MCP: {toolsModalServer.name}</span>
              </div>
              <button
                onClick={() => setToolsModalServer(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {!toolsModalServer.tools || toolsModalServer.tools.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 space-y-3">
                <p>Chưa có tool nào được đồng bộ từ MCP server này.</p>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onTestServer(toolsModalServer.id);
                    if (res?.server) setToolsModalServer(res.server);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-semibold cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kiểm tra kết nối &amp; Đồng bộ ngay</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 overflow-y-auto flex-1 text-xs">
                {/* Left: Tool List */}
                <div className="md:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl overflow-y-auto max-h-[420px] divide-y divide-slate-200 dark:divide-slate-800">
                  {toolsModalServer.tools.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => handleSelectTool(tool)}
                      className={`w-full text-left p-3 transition-colors cursor-pointer ${
                        selectedTool?.name === tool.name
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 border-l-2 border-indigo-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{tool.name}</div>
                      {tool.description && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {tool.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Right: Tool Inspector & Test Runner */}
                <div className="md:col-span-7 space-y-3">
                  {selectedTool && (
                    <>
                      <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">{selectedTool.name}</div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedTool.description || 'Không có mô tả.'}
                        </p>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Input Schema
                        </label>
                        <pre className="p-2.5 bg-slate-950 text-slate-300 rounded-xl font-mono text-[10px] overflow-x-auto max-h-32">
                          {JSON.stringify(selectedTool.inputSchema || { type: 'object', properties: {} }, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Tham số gọi thử (JSON Arguments)
                        </label>
                        <textarea
                          value={toolArgsInput}
                          onChange={(e) => setToolArgsInput(e.target.value)}
                          rows={4}
                          className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-[11px]"
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleRunToolTest}
                          disabled={toolRunning}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{toolRunning ? 'Đang chạy...' : 'Chạy thử Tool'}</span>
                        </button>
                      </div>

                      {toolOutput && (
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Kết quả trả về {toolOutput.isError ? '(Lỗi)' : '(Thành công)'}
                          </label>
                          <pre
                            className={`p-3 rounded-xl font-mono text-[11px] whitespace-pre-wrap max-h-44 overflow-y-auto border ${
                              toolOutput.isError
                                ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                            }`}
                          >
                            {toolOutput.text}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
