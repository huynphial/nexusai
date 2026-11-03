import { run } from './db';

export function isDebugEnabled(): boolean {
  return process.env.DEBUG_LOG === 'true' || process.env.DEBUG === 'true';
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

// Mask sensitive authorization tokens in debug payloads
export function maskSensitiveData(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    return obj.replace(/(Bearer\s+)[A-Za-z0-9_\-\.\/]+/gi, '$1••••••••');
  }
  if (typeof obj !== 'object') return obj;

  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key in copy) {
    if (
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('key') ||
      key.toLowerCase().includes('password') ||
      key.toLowerCase().includes('authorization')
    ) {
      if (typeof copy[key] === 'string') {
        const val = copy[key];
        copy[key] = val.length > 8 ? val.substring(0, 4) + '••••' + val.substring(val.length - 4) : '••••••••';
      }
    } else if (typeof copy[key] === 'object' && copy[key] !== null) {
      copy[key] = maskSensitiveData(copy[key]);
    }
  }
  return copy;
}

export const logger = {
  info: (category: string, message: string, data?: any) => {
    const timestamp = formatTimestamp();
    console.log(`[${timestamp}] [INFO] [${category}] ${message}`, data ? maskSensitiveData(data) : '');
  },

  debug: (category: string, message: string, data?: any) => {
    if (!isDebugEnabled()) return;
    const timestamp = formatTimestamp();
    console.log(`\x1b[36m[${timestamp}] [DEBUG] [${category}]\x1b[0m ${message}`, data ? maskSensitiveData(data) : '');
  },

  apiDebug: (
    provider: string,
    url: string,
    payload: any,
    responseStatus: number,
    responseSnippet: any,
    durationMs: number
  ) => {
    if (!isDebugEnabled()) return;
    const timestamp = formatTimestamp();
    console.log(
      `\x1b[35m[${timestamp}] [API_DEBUG] [${provider.toUpperCase()}]\x1b[0m URL: ${url} | Status: ${responseStatus} | Latency: ${durationMs}ms\n` +
      `  \x1b[33m[Payload]:\x1b[0m ${JSON.stringify(maskSensitiveData(payload))}\n` +
      `  \x1b[32m[Response]:\x1b[0m ${JSON.stringify(maskSensitiveData(responseSnippet))}`
    );
  },

  audit: async (
    userId: number,
    userEmail: string,
    action: string,
    details: string,
    ipAddress: string = '127.0.0.1'
  ) => {
    const timestamp = formatTimestamp();
    // Print to console stdout
    console.log(
      `\x1b[33m[${timestamp}] [AUDIT_LOG]\x1b[0m User: ${userEmail} (#${userId}) | Action: ${action} | Details: ${details}`
    );

    // Persist in audit_logs database table
    try {
      await run(
        `INSERT INTO audit_logs (user_id, user_email, action, details, ip_address) VALUES (?, ?, ?, ?, ?)`,
        [userId, userEmail, action, details, ipAddress]
      );
    } catch (err) {
      console.error('[Logger] Failed to persist audit log in database:', err);
    }
  },

  error: (category: string, message: string, err?: any) => {
    const timestamp = formatTimestamp();
    console.error(`\x1b[31m[${timestamp}] [ERROR] [${category}]\x1b[0m ${message}`, err || '');
  }
};
