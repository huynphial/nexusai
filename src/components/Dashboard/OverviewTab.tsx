import React from 'react';
import { DashboardStats } from '../../types';
import { Users, Shield, Cpu, MessageSquare, Zap, TrendingUp, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';

interface Props {
  stats: DashboardStats | null;
  loading: boolean;
}

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];

export const OverviewTab: React.FC<Props> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        Đang tải thông tin dữ liệu thống kê Dashboard...
      </div>
    );
  }

  const { overview, tokens_by_model, tokens_by_group, daily_trend, recent_logs } = stats;

  return (
    <div className="space-y-6">
      {/* 1. Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 text-indigo-500 mb-1 text-xs font-semibold">
            <Users className="w-4 h-4" />
            <span>Người dùng</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {overview.total_users.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 text-purple-500 mb-1 text-xs font-semibold">
            <Shield className="w-4 h-4" />
            <span>Nhóm người dùng</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {overview.total_groups.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 text-blue-500 mb-1 text-xs font-semibold">
            <Cpu className="w-4 h-4" />
            <span>Mô hình AI Active</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {overview.total_models.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 text-emerald-500 mb-1 text-xs font-semibold">
            <MessageSquare className="w-4 h-4" />
            <span>Tổng số tin nhắn</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {overview.total_messages.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 text-amber-500 mb-1 text-xs font-semibold">
            <Zap className="w-4 h-4" />
            <span>Token hôm nay</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {overview.tokens_today.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 text-pink-500 mb-1 text-xs font-semibold">
            <TrendingUp className="w-4 h-4" />
            <span>Token trong tháng</span>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {overview.tokens_month.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 2. Visual Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Consumption by AI Model */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            <span>Phân bổ tiêu thụ Token theo Mô hình AI</span>
          </h3>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokens_by_model} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="model_name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="total_tokens" fill="#6366f1" radius={[6, 6, 0, 0]} name="Số Token tiêu thụ" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Token Consumption by User Group */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            <span>Phân bổ tiêu thụ Token theo Nhóm người dùng</span>
          </h3>

          <div className="h-64 flex items-center justify-center">
            {tokens_by_group.length === 0 ? (
              <p className="text-xs text-slate-400">Chưa có dữ liệu tiêu thụ.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tokens_by_group}
                    dataKey="total_tokens"
                    nameKey="group_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {tokens_by_group.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 3. Recent Activity Logs Table */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" />
          <span>Nhật ký truy vấn Chat & Tiêu thụ Quota gần đây</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Thời gian</th>
                <th className="p-3">Người dùng</th>
                <th className="p-3">Nhóm</th>
                <th className="p-3">Mô hình AI</th>
                <th className="p-3 text-right">Số Token</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {recent_logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400">
                    Chưa có lượt truy vấn nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                recent_logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-500 dark:text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                      {log.user_name}
                      <span className="block text-[10px] font-normal text-slate-400">{log.user_email}</span>
                    </td>
                    <td className="p-3 font-medium text-purple-600 dark:text-purple-400">{log.group_name}</td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{log.model_name}</td>
                    <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {log.tokens_count.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
