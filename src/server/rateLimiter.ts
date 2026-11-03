import { getOne, query, run } from './db';

export interface RateLimitStatus {
  allowed: boolean;
  reason?: string;
  usage?: {
    user_requests: number;
    user_tokens: number;
    group_tokens: number;
    rate_limit_requests: number;
    max_tokens_per_user: number;
    max_tokens_group: number;
    period: string;
  };
}

export async function checkRateLimitAndQuota(
  userId: number,
  groupId: number,
  modelId: number
): Promise<RateLimitStatus> {
  // 1. Fetch access configuration
  const accessRule = await getOne(
    `SELECT * FROM group_model_access WHERE group_id = ? AND model_id = ?`,
    [groupId, modelId]
  );

  if (!accessRule) {
    return {
      allowed: false,
      reason: 'Nhóm người dùng của bạn không được phân quyền truy cập mô hình AI này. Vui lòng liên hệ Admin.'
    };
  }

  const period = accessRule.rate_limit_period || 'day'; // 'hour', 'day', 'week', 'month'
  const maxRequests = accessRule.rate_limit_requests;
  const maxTokensGroup = accessRule.max_tokens_group;
  const maxTokensUser = accessRule.max_tokens_per_user;

  // Calculate cutoff timestamp for SQLite
  let modifier = '-1 day';
  let periodVN = 'ngày';
  if (period === 'hour') {
    modifier = '-1 hour';
    periodVN = 'giờ';
  } else if (period === 'day') {
    modifier = '-1 day';
    periodVN = 'ngày';
  } else if (period === 'week') {
    modifier = '-7 day';
    periodVN = 'tuần';
  } else if (period === 'month') {
    modifier = '-30 day';
    periodVN = 'tháng';
  }

  // 2. Fetch User request count & token count in window
  const userUsage = await getOne(
    `
    SELECT COUNT(*) as req_count, COALESCE(SUM(tokens_count), 0) as token_sum
    FROM token_usage_logs
    WHERE user_id = ? AND model_id = ? AND timestamp >= datetime('now', ?)
    `,
    [userId, modelId, modifier]
  );

  // 3. Fetch Group token count in window
  const groupUsage = await getOne(
    `
    SELECT COALESCE(SUM(tokens_count), 0) as token_sum
    FROM token_usage_logs
    WHERE group_id = ? AND model_id = ? AND timestamp >= datetime('now', ?)
    `,
    [groupId, modelId, modifier]
  );

  const userRequests = userUsage ? userUsage.req_count : 0;
  const userTokens = userUsage ? userUsage.token_sum : 0;
  const groupTokens = groupUsage ? groupUsage.token_sum : 0;

  const usageStats = {
    user_requests: userRequests,
    user_tokens: userTokens,
    group_tokens: groupTokens,
    rate_limit_requests: maxRequests,
    max_tokens_per_user: maxTokensUser,
    max_tokens_group: maxTokensGroup,
    period: periodVN
  };

  // Check 1: User request rate limit
  if (userRequests >= maxRequests) {
    return {
      allowed: false,
      reason: `Bạn đã đạt giới hạn ${maxRequests.toLocaleString()} lượt yêu cầu/${periodVN} cho mô hình này!`,
      usage: usageStats
    };
  }

  // Check 2: Group max tokens limit
  if (groupTokens >= maxTokensGroup) {
    return {
      allowed: false,
      reason: `Toàn nhóm của bạn đã sử dụng hết hạn ngạch ${maxTokensGroup.toLocaleString()} tokens/${periodVN} cho mô hình này!`,
      usage: usageStats
    };
  }

  // Check 3: Individual User max tokens limit
  if (userTokens >= maxTokensUser) {
    return {
      allowed: false,
      reason: `Tài khoản cá nhân của bạn đã vượt quá giới hạn ${maxTokensUser.toLocaleString()} tokens/${periodVN} cho mô hình này!`,
      usage: usageStats
    };
  }

  return {
    allowed: true,
    usage: usageStats
  };
}

export async function logTokenUsage(
  userId: number,
  groupId: number,
  modelId: number,
  tokensCount: number
) {
  try {
    await run(
      `INSERT INTO token_usage_logs (user_id, group_id, model_id, tokens_count) VALUES (?, ?, ?, ?)`,
      [userId, groupId, modelId, Math.max(1, tokensCount)]
    );
  } catch (err) {
    console.error('[RateLimiter] Failed to log token usage:', err);
  }
}
