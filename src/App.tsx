import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { LoginModal } from './components/LoginModal';
import { DashboardMain } from './components/Dashboard/DashboardMain';
import { ChatSession, ChatMessage, ModelWithQuota, ProgressStep, ProgressSummary } from './types';
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
        api.getAvailableModels().catch(() => ({ models: [], default_model_id: null })),
        api.getSessions().catch(() => ({ sessions: [] })),
      ]);

      const modelsList = modelsRes.models || [];
      setAvailableModels(modelsList);

      const defaultId = modelsRes.default_model_id;
      if (modelsList.length > 0 && !selectedModelId) {
        const preferredModel = (defaultId && modelsList.find((m) => m.id === defaultId)) || modelsList[0];
        setSelectedModelId(preferredModel.id);
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
    // When creating a new chat session, automatically pick the group's default model
    const defaultModel = availableModels.find((m) => m.is_default) || availableModels[0];
    if (defaultModel) {
      setSelectedModelId(defaultModel.id);
    }
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

  const [streamingData, setStreamingData] = useState<{
    content: string;
    thinking?: string;
    isThinking?: boolean;
    progress_steps?: ProgressStep[];
    progress_summary?: ProgressSummary;
  } | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const isPausedRef = useRef(false);
  const pauseResolverRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // If user role is not admin, keep in chat view
  useEffect(() => {
    if (user && user.role !== 'admin' && activeView === 'dashboard') {
      setActiveView('chat');
    }
  }, [user, activeView]);

  const handleCancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (pauseResolverRef.current) {
      pauseResolverRef.current();
      pauseResolverRef.current = null;
    }
    isPausedRef.current = false;
    setIsStreamPaused(false);

    if (streamingData && (streamingData.content || streamingData.thinking || streamingData.progress_steps?.length)) {
      const partialMsg: ChatMessage = {
        id: Date.now(),
        session_id: activeSessionId || 0,
        sender: 'assistant',
        content: streamingData.content || '(Đã dừng tiến trình)',
        thinking_content: streamingData.thinking || undefined,
        progress_steps: streamingData.progress_steps || undefined,
        progress_summary: streamingData.progress_summary || undefined,
        tokens_used: Math.ceil(((streamingData.content || '').length + (streamingData.thinking || '').length) / 4),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, partialMsg]);
    }

    setStreamingData(null);
    setSendingMessage(false);
  };

  const handleTogglePauseStream = () => {
    if (isStreamPaused) {
      // Resume
      isPausedRef.current = false;
      setIsStreamPaused(false);
      if (pauseResolverRef.current) {
        pauseResolverRef.current();
        pauseResolverRef.current = null;
      }
    } else {
      // Pause
      isPausedRef.current = true;
      setIsStreamPaused(true);
    }
  };

  const handleSendMessage = async (promptText: string) => {
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }

    if (!selectedModelId) {
      setChatError('Vui lòng chọn mô hình AI để bắt đầu chat.');
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    isPausedRef.current = false;
    setIsStreamPaused(false);

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
        enable_thinking: thinkingEnabled,
      },
      {
        onChunk: async (chunk) => {
          // If paused, wait until user resumes or cancels
          if (isPausedRef.current) {
            await new Promise<void>((resolve) => {
              pauseResolverRef.current = resolve;
            });
          }

          if (chunk.type === 'progress') {
            setStreamingData((prev) => {
              const currentSteps = prev?.progress_steps ? [...prev.progress_steps] : [];
              if (chunk.step) {
                const idx = currentSteps.findIndex((s) => s.id === chunk.step!.id);
                if (idx >= 0) {
                  currentSteps[idx] = { ...currentSteps[idx], ...chunk.step };
                } else {
                  currentSteps.push(chunk.step);
                }
              } else if (chunk.summary?.steps) {
                for (const s of chunk.summary.steps) {
                  const idx = currentSteps.findIndex((item) => item.id === s.id);
                  if (idx >= 0) currentSteps[idx] = { ...currentSteps[idx], ...s };
                  else currentSteps.push(s);
                }
              }

              return {
                content: prev?.content || accumulatedContent,
                thinking: prev?.thinking || accumulatedThinking,
                isThinking: prev?.isThinking ?? false,
                progress_steps: currentSteps,
                progress_summary: chunk.summary || prev?.progress_summary,
              };
            });
          } else if (chunk.type === 'thinking') {
            accumulatedThinking += chunk.text || '';
            setStreamingData((prev) => ({
              content: accumulatedContent,
              thinking: accumulatedThinking,
              isThinking: true,
              progress_steps: prev?.progress_steps,
              progress_summary: prev?.progress_summary,
            }));
          } else {
            accumulatedContent += chunk.text || '';
            setStreamingData((prev) => ({
              content: accumulatedContent,
              thinking: accumulatedThinking,
              isThinking: false,
              progress_steps: prev?.progress_steps,
              progress_summary: prev?.progress_summary,
            }));
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
          setIsStreamPaused(false);
          abortControllerRef.current = null;

          const updatedModels = await api.getAvailableModels();
          setAvailableModels(updatedModels.models || []);
        },
        onError: (errStr) => {
          if (!errStr.includes('abort') && !errStr.includes('The user aborted')) {
            setChatError(errStr);
          }
          setStreamingData(null);
          setSendingMessage(false);
          setIsStreamPaused(false);
          abortControllerRef.current = null;
        },
      },
      abortController.signal
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

          {/* Chat Window with Dropdown, Thinking Toggle, Pause, and Cancel */}
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
            onCancelStream={handleCancelStream}
            onTogglePauseStream={handleTogglePauseStream}
            isStreamPaused={isStreamPaused}
            thinkingEnabled={thinkingEnabled}
            onToggleThinking={() => setThinkingEnabled((prev) => !prev)}
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
