import React, { useState, useEffect } from 'react';
import { User, UserGroup, AIModel, DashboardStats, McpServer } from '../../types';
import { api } from '../../api';
import { APP_CONFIG } from '../../config/appConfig';
import { OverviewTab } from './OverviewTab';
import { UserManagementTab } from './UserManagementTab';
import { GroupManagementTab } from './GroupManagementTab';
import { ModelManagementTab } from './ModelManagementTab';
import { McpManagementTab } from './McpManagementTab';
import { SystemEnvTab } from './SystemEnvTab';
import { AuditLogsTab } from './AuditLogsTab';
import { LayoutDashboard, Users, Shield, Cpu, FileCode, RefreshCw, ShieldCheck, Plug } from 'lucide-react';

export const DashboardMain: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'groups' | 'models' | 'mcp' | 'audit' | 'env'>('overview');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, groupsRes, modelsRes, mcpRes] = await Promise.all([
        api.getDashboardStats().catch(() => null),
        api.getUsers().then((r) => r.users).catch(() => []),
        api.getGroups().then((r) => r.groups).catch(() => []),
        api.getModels().then((r) => r.models).catch(() => []),
        api.getMcpServers().then((r) => r.servers).catch(() => []),
      ]);

      if (statsRes) setStats(statsRes);
      setUsers(usersRes);
      setGroups(groupsRes);
      setModels(modelsRes);
      setMcpServers(mcpRes);
    } catch (err) {
      console.error('[DashboardMain] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // User CRUD handlers
  const handleCreateUser = async (data: any) => {
    await api.createUser(data);
    await loadAllData();
  };

  const handleUpdateUser = async (id: number, data: any) => {
    await api.updateUser(id, data);
    await loadAllData();
  };

  const handleDeleteUser = async (id: number) => {
    await api.deleteUser(id);
    await loadAllData();
  };

  // Group CRUD handlers
  const handleCreateGroup = async (data: any) => {
    await api.createGroup(data);
    await loadAllData();
  };

  const handleUpdateGroup = async (id: number, data: any) => {
    await api.updateGroup(id, data);
    await loadAllData();
  };

  const handleDeleteGroup = async (id: number) => {
    await api.deleteGroup(id);
    await loadAllData();
  };

  // Model CRUD handlers
  const handleCreateModel = async (data: any) => {
    await api.createModel(data);
    await loadAllData();
  };

  const handleUpdateModel = async (id: number, data: any) => {
    await api.updateModel(id, data);
    await loadAllData();
  };

  const handleDeleteModel = async (id: number) => {
    await api.deleteModel(id);
    await loadAllData();
  };

  // MCP Server CRUD handlers
  const handleCreateMcpServer = async (data: Partial<McpServer>) => {
    const res = await api.createMcpServer(data);
    await loadAllData();
    return res;
  };

  const handleUpdateMcpServer = async (id: number, data: Partial<McpServer>) => {
    const res = await api.updateMcpServer(id, data);
    await loadAllData();
    return res;
  };

  const handleDeleteMcpServer = async (id: number) => {
    await api.deleteMcpServer(id);
    await loadAllData();
  };

  const handleTestMcpServer = async (id: number) => {
    const res = await api.testMcpServer(id);
    await loadAllData();
    return res;
  };

  const handleCallMcpTool = async (id: number, data: { toolName: string; arguments?: Record<string, any> }) => {
    return await api.callMcpTool(id, data);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 lg:p-6 space-y-6">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Dashboard Quản Trị Hệ Thống {APP_CONFIG.appName}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Quản lý tập trung Mô hình Chat LLM, Khai báo ChatGPT Token, Phân quyền Nhóm, Rate Limit & Audit Logs.
          </p>
        </div>

        <button
          onClick={loadAllData}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Tải lại dữ liệu</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Tổng Quan & Biểu Đồ</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'users'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Quản Lý Người Dùng ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'groups'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Quản Lý Nhóm & Rate Limit ({groups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('models')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'models'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Khai Báo Mô Hình & AI Token ({models.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'mcp'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Plug className="w-3.5 h-3.5 text-cyan-500" />
          <span>Quản Lý MCP Servers ({mcpServers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          <span>Nhật Ký Thao Tác Audit</span>
        </button>

        <button
          onClick={() => setActiveTab('env')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'env'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Cấu Hình .env & Database</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && <OverviewTab stats={stats} loading={loading} />}

      {activeTab === 'users' && (
        <UserManagementTab
          users={users}
          groups={groups}
          onCreateUser={handleCreateUser}
          onUpdateUser={handleUpdateUser}
          onDeleteUser={handleDeleteUser}
        />
      )}

      {activeTab === 'groups' && (
        <GroupManagementTab
          groups={groups}
          allModels={models}
          allMcpServers={mcpServers}
          onCreateGroup={handleCreateGroup}
          onUpdateGroup={handleUpdateGroup}
          onDeleteGroup={handleDeleteGroup}
        />
      )}

      {activeTab === 'models' && (
        <ModelManagementTab
          models={models}
          mcpServers={mcpServers}
          onCreateModel={handleCreateModel}
          onUpdateModel={handleUpdateModel}
          onDeleteModel={handleDeleteModel}
        />
      )}

      {activeTab === 'mcp' && (
        <McpManagementTab
          servers={mcpServers}
          groups={groups}
          onCreateServer={handleCreateMcpServer}
          onUpdateServer={handleUpdateMcpServer}
          onDeleteServer={handleDeleteMcpServer}
          onTestServer={handleTestMcpServer}
          onCallTool={handleCallMcpTool}
        />
      )}

      {activeTab === 'audit' && <AuditLogsTab />}

      {activeTab === 'env' && <SystemEnvTab />}
    </div>
  );
};
