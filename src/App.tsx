import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { LoginModal } from './components/LoginModal';
import { DashboardMain } from './components/Dashboard/DashboardMain';
import { ChatSession, ChatMessage, ModelWithQuota } from './types';
import { api } from './api';
import { Menu } from 'lucide-react';

function MainContent() {
  const { user } = useAuth();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('nexus_theme') === 'dark';
  });

  const [activeView, setActiveView] = useState<'chat' | 'dashboard'>('chat');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Chat State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelWithQuota[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);

  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  // Sync dark mode class on <html> element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('nexus_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('nexus_theme', 'light');
    }
  }, [darkMode]);

  // Load available models & sessions when user changes or app mounts
  const loadChatData = async () => {
    if (!user) {
      setSessions([]);
      setAvailableModels([]);
      setMessages([]);
      setActiveSessionId(null);
      setSelectedModelId(null);
      return;
    }

    try {
      const [modelsRes, sessionsRes] = await Promise.all([
        api.getAvailableModels().catch(() => ({ models: [] })),
        api.getSessions().catch(() => ({ sessions: [] })),
      ]);

      const modelsList = modelsRes.models || [];
      setAvailableModels(modelsList);

      if (modelsList.length > 0 && !selectedModelId) {
        setSelectedModelId(modelsList[0].id);
      }

      const sessionsList = sessionsRes.sessions || [];
      setSessions(sessionsList);

      if (sessionsList.length > 0 && !activeSessionId) {
        setActiveSessionId(sessionsList[0].id);
      }
    } catch (err) {
      console.error('[App] Failed to load initial chat data:', err);
    }
  };

  useEffect(() => {
    loadChatData();
  }, [user]);

  // Load messages when activeSessionId changes
  useEffect(() => {
    if (!activeSessionId || !user) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const res = await api.getSessionMessages(activeSessionId);
        setMessages(res.messages || []);
      } catch (err) {
        console.error('[App] Error fetching messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [activeSessionId, user]);

  const handleSelectSession = (id: number) => {
    setActiveSessionId(id);
    setChatError(null);
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setSelectedModelId(session.model_id);
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setChatError(null);
  };

  const handleDeleteSession = async (id: number) => {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        handleNewChat();
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xóa cuộc trò chuyện.');
    }
  };

  const [streamingData, setStreamingData] = useState<{ content: string; thinking?: string; isThinking?: boolean } | null>(null);

  // If user role is not admin, keep in chat view
  useEffect(() => {
    if (user && user.role !== 'admin' && activeView === 'dashboard') {
      setActiveView('chat');
    }
  }, [user, activeView]);

  const handleSendMessage = async (promptText: string) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }

    if (!selectedModelId) {
      setChatError('Vui lòng chọn mô hình AI để bắt đầu chat.');
      return;
    }

    setSendingMessage(true);
    setChatError(null);
    setStreamingData({ content: '', thinking: '', isThinking: true });

    // Optimistic user message append
    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      session_id: activeSessionId || 0,
      sender: 'user',
      content: promptText,
      tokens_used: 0,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    let accumulatedContent = '';
    let accumulatedThinking = '';

    await api.streamMessage(
      {
        session_id: activeSessionId || undefined,
        model_id: selectedModelId,
        prompt: promptText,
      },
      {
        onChunk: (chunk) => {
          if (chunk.type === 'thinking') {
            accumulatedThinking += chunk.text;
            setStreamingData({
              content: accumulatedContent,
              thinking: accumulatedThinking,
              isThinking: true,
            });
          } else {
            accumulatedContent += chunk.text;
            setStreamingData({
              content: accumulatedContent,
              thinking: accumulatedThinking,
              isThinking: false,
            });
          }
        },
        onDone: async (res) => {
          if (!activeSessionId && res.session_id) {
            setActiveSessionId(res.session_id);
            const updatedSessions = await api.getSessions();
            setSessions(updatedSessions.sessions || []);
          }
          setMessages((prev) => [...prev, res.message]);
          setStreamingData(null);
          setSendingMessage(false);

          const updatedModels = await api.getAvailableModels();
          setAvailableModels(updatedModels.models || []);
        },
        onError: (errStr) => {
          setChatError(errStr);
          setStreamingData(null);
          setSendingMessage(false);
        },
      }
    );
  };

  const selectedModelObj = availableModels.find((m) => m.id === selectedModelId);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onOpenLogin={() => setIsLoginModalOpen(true)}
      />

      {/* Main Workspace Body */}
      {activeView === 'dashboard' && user?.role === 'admin' ? (
        <DashboardMain />
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile Sidebar Toggle Button */}
          <button
            onClick={() => setSidebarMobileOpen(true)}
            className="lg:hidden absolute top-2 left-2 z-20 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-slate-700 dark:text-slate-200"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Sidebar */}
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={handleDeleteSession}
            availableModels={availableModels}
            selectedModelId={selectedModelId}
            onSelectModel={(id) => {
              setSelectedModelId(id);
              setChatError(null);
            }}
            isOpen={sidebarMobileOpen}
            onCloseMobile={() => setSidebarMobileOpen(false)}
          />

          {/* Chat Window with Dropdown & Streaming Performance */}
          <ChatWindow
            messages={messages}
            loading={sendingMessage || loadingMessages}
            onSendMessage={handleSendMessage}
            availableModels={availableModels}
            selectedModel={selectedModelObj}
            onSelectModel={(id) => {
              setSelectedModelId(id);
              setChatError(null);
            }}
            errorMsg={chatError}
            onClearError={() => setChatError(null)}
            streamingData={streamingData}
          />
        </div>
      )}

      {/* Login & Register Modal */}
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
