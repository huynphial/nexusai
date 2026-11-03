export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  user_group_id: number;
  group_name?: string;
  status: 'active' | 'suspended';
  created_at?: string;
  total_tokens?: number;
}

export interface UserGroup {
  id: number;
  name: string;
  description: string;
  created_at?: string;
  member_count?: number;
  access_rules?: GroupModelAccess[];
}

export interface AIModel {
  id: number;
  name: string;
  provider: 'openai_compatible' | 'gemini' | 'custom';
  model_identifier: string;
  api_url?: string;
  api_token?: string;
  masked_token?: string;
  has_token?: boolean;
  system_prompt?: string;
  is_active: number | boolean;
  created_at?: string;
}

export interface GroupModelAccess {
  id?: number;
  group_id: number;
  model_id: number;
  model_name?: string;
  provider?: string;
  model_identifier?: string;
  rate_limit_period: 'hour' | 'day' | 'week' | 'month';
  rate_limit_requests: number;
  max_tokens_group: number;
  max_tokens_per_user: number;
}

export interface ModelWithQuota extends AIModel {
  rate_limit_period?: string;
  rate_limit_requests?: number;
  max_tokens_group?: number;
  max_tokens_per_user?: number;
  allowed?: boolean;
  disallow_reason?: string;
  quota?: {
    user_requests: number;
    user_tokens: number;
    group_tokens: number;
    rate_limit_requests: number;
    max_tokens_per_user: number;
    max_tokens_group: number;
    period: string;
  };
}

export interface ChatSession {
  id: number;
  user_id: number;
  model_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  model_name?: string;
  provider?: string;
  model_identifier?: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  tokens_used: number;
  created_at: string;
}

export interface DashboardStats {
  overview: {
    total_users: number;
    total_groups: number;
    total_models: number;
    total_messages: number;
    tokens_today: number;
    tokens_month: number;
  };
  tokens_by_model: Array<{ model_name: string; provider: string; total_tokens: number }>;
  tokens_by_group: Array<{ group_name: string; total_tokens: number }>;
  daily_trend: Array<{ date: string; tokens: number }>;
  recent_logs: Array<{
    id: number;
    tokens_count: number;
    timestamp: string;
    user_name: string;
    user_email: string;
    group_name: string;
    model_name: string;
  }>;
}

export interface AuditLog {
  id: number;
  user_id: number;
  user_email: string;
  action: string;
  details: string;
  ip_address: string;
  timestamp: string;
}

export interface SystemEnvInfo {
  env: {
    NODE_ENV: string;
    DB_TYPE: string;
    DB_FILE: string;
    PORT: string;
    DEFAULT_ADMIN_EMAIL: string;
    HAS_GEMINI_API_KEY: boolean;
    JWT_SECRET_CONFIGURED: boolean;
    DEBUG_LOG_ENABLED: boolean;
  };
  status: string;
  timestamp: string;
}
