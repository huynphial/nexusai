import React, { useEffect, useState } from 'react';
import { SystemEnvInfo } from '../../types';
import { api } from '../../api';
import { Database, FileCode, Server, ShieldCheck, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export const SystemEnvTab: React.FC = () => {
  const [info, setInfo] = useState<SystemEnvInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnv = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSystemEnv();
      setInfo(data);
    } catch (err: any) {
      setError(err.message || 'Không thể tải cấu hình .env.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnv();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-500" />
            <span>Trạng Thái Cấu Hình File `.env` & Database Connection</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hệ thống tự động đọc file `.env` để cấu hình Loại Database (SQLite / PostgreSQL), Cổng Server, Khóa JWT Secret và Tài khoản Admin mặc định.
          </p>
        </div>

        <button
          onClick={fetchEnv}
          className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-colors"
          title="Tải lại thông số"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-2xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : info ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Database Configuration Card */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              <Database className="w-5 h-5" />
              <span>Cơ Sở Dữ Liệu (Database Engine)</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">DB_TYPE (.env):</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 uppercase">
                  {info.env.DB_TYPE}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Đường dẫn tệp SQLite (DB_FILE):</span>
                <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  {info.env.DB_FILE}
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Trạng thái kết nối:</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Đã kết nối & Đã Khởi tạo Schema
                </span>
              </div>
            </div>
          </div>

          {/* Server & Secrets Configuration Card */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-bold text-sm">
              <Server className="w-5 h-5" />
              <span>Server & Cấu Hình Môi Trường</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Cổng Server (PORT):</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {info.env.PORT}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">Admin Email mặc định:</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {info.env.DEFAULT_ADMIN_EMAIL}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">JWT Secret Security:</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Đã thiết lập an toàn
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-slate-400">Khóa Server Gemini API:</span>
                {info.env.HAS_GEMINI_API_KEY ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Khóa hợp lệ trong runtime
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                    Sử dụng fallback / Cần Secrets
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
