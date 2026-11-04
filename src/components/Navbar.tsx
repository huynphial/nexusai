import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bot, LayoutDashboard, LogOut, Moon, Sun, User as UserIcon, Shield, Sparkles } from 'lucide-react';

interface Props {
  activeView: 'chat' | 'dashboard';
  setActiveView: (view: 'chat' | 'dashboard') => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  onOpenLogin: () => void;
}

export const Navbar: React.FC<Props> = ({
  activeView,
  setActiveView,
  darkMode,
  setDarkMode,
  onOpenLogin,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0 z-30 sticky top-0 transition-colors">
      {/* Zone 1: Single text wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('chat');
          }}
          className="flex items-center gap-2 font-extrabold text-lg text-slate-900 dark:text-white tracking-tight whitespace-nowrap"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <span>Local AI</span>
        </a>
      </div>

      {/* Zone 2: Navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
        <button
          onClick={() => setActiveView('chat')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeView === 'chat'
              ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Giao diện Chat LLM</span>
        </button>

        {user && user.role === 'admin' && (
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              activeView === 'dashboard'
                ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard Quản Trị</span>
          </button>
        )}
      </nav>

      {/* Zone 3: 1 primary action / User profile menu */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Dark Mode Toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={darkMode ? 'Chuyển Chế độ Sáng' : 'Chuyển Chế độ Tối'}
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {user ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{user.name}</span>
                {user.role === 'admin' && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Admin
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                {user.group_name || 'Chưa phân nhóm'}
              </span>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors whitespace-nowrap shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenLogin}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Đăng Nhập</span>
          </button>
        )}
      </div>
    </header>
  );
};
