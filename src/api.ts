import { User, UserGroup, AIModel, ModelWithQuota, ChatSession, ChatMessage, DashboardStats, SystemEnvInfo } from './types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('nexus_jwt_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Có lỗi xảy ra khi gọi dịch vụ.');
  }

  return data as T;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  register: (data: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMe: () => request<{ user: User }>('/auth/me'),

  updateProfile: (data: { name?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ message: string }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Users (Admin)
  getUsers: () => request<{ users: User[] }>('/users'),
  createUser: (userData: Partial<User> & { password: string }) =>
    request<{ user: User }>('/users', { method: 'POST', body: JSON.stringify(userData) }),
  updateUser: (id: number, userData: Partial<User> & { newPassword?: string }) =>
    request<{ message: string }>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(userData) }),
  deleteUser: (id: number) => request<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),

  // User Groups (Admin)
  getGroups: () => request<{ groups: UserGroup[] }>('/groups'),
  createGroup: (groupData: { name: string; description?: string; access_rules?: any[] }) =>
    request<{ groupId: number }>('/groups', { method: 'POST', body: JSON.stringify(groupData) }),
  updateGroup: (id: number, groupData: { name?: string; description?: string; access_rules?: any[] }) =>
    request<{ message: string }>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(groupData) }),
  deleteGroup: (id: number) => request<{ message: string }>(`/groups/${id}`, { method: 'DELETE' }),

  // AI Models (Admin)
  getModels: () => request<{ models: AIModel[] }>('/admin/models'),
  createModel: (modelData: Partial<AIModel>) =>
    request<{ modelId: number }>('/admin/models', { method: 'POST', body: JSON.stringify(modelData) }),
  updateModel: (id: number, modelData: Partial<AIModel>) =>
    request<{ message: string }>(`/admin/models/${id}`, { method: 'PUT', body: JSON.stringify(modelData) }),
  deleteModel: (id: number) => request<{ message: string }>(`/admin/models/${id}`, { method: 'DELETE' }),

  // Chat
  getAvailableModels: () => request<{ models: ModelWithQuota[] }>('/chat/available-models'),
  getSessions: () => request<{ sessions: ChatSession[] }>('/chat/sessions'),
  createSession: (data: { model_id: number; title?: string }) =>
    request<{ session: ChatSession }>('/chat/sessions', { method: 'POST', body: JSON.stringify(data) }),
  deleteSession: (id: number) => request<{ message: string }>(`/chat/sessions/${id}`, { method: 'DELETE' }),
  getSessionMessages: (sessionId: number) => request<{ messages: ChatMessage[] }>(`/chat/sessions/${sessionId}/messages`),
  sendMessage: (data: { session_id?: number; model_id?: number; prompt: string }) =>
    request<{ session_id: number; message: ChatMessage; updated_quota?: any }>('/chat/send', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Dashboard
  getDashboardStats: () => request<DashboardStats>('/dashboard/stats'),
  getSystemEnv: () => request<SystemEnvInfo>('/dashboard/system-env'),
};
