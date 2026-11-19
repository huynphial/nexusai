import { spawn } from 'child_process';
import { query, getOne, run } from './db';
import { logger } from './logger';

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export interface McpServerRecord {
  id: number;
  name: string;
  description?: string;
  transport: 'streamable_http' | 'sse' | 'stdio';
  url?: string;
  headers_json?: string;
  command?: string;
  args_json?: string;
  env_json?: string;
  timeout_seconds?: number;
  is_active: number;
  last_status?: string;
  last_error?: string;
  tools_cache_json?: string;
  last_checked_at?: string;
}

export interface McpToolBinding {
  qualifiedName: string;
  originalName: string;
  serverId: number;
  serverName: string;
  description: string;
  rawDescription: string;
  transport: 'streamable_http' | 'sse' | 'stdio';
  inputSchema: Record<string, any>;
}

function safeParseJson<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function sanitizeToolSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
}

// Parse JSON-RPC response from either application/json or text/event-stream SSE body
async function parseHttpMcpResponse(response: Response, targetId?: number | string): Promise<any> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {};
  }

  if (contentType.includes('text/event-stream') || rawText.includes('\ndata:') || rawText.startsWith('data:') || rawText.startsWith('event:')) {
    const lines = rawText.split('\n');
    let lastJson: any = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const dataPart = trimmed.slice(5).trim();
        if (!dataPart || dataPart === '[DONE]') continue;
        try {
          const parsed = JSON.parse(dataPart);
          lastJson = parsed;
          if (targetId !== undefined && parsed.id === targetId) {
            return parsed;
          }
        } catch {
          // ignore partial
        }
      }
    }
    if (lastJson) return lastJson;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`MCP server trả về dữ liệu không hợp lệ (HTTP ${response.status}): ${rawText.slice(0, 200)}`);
  }
}

// 1. Streamable HTTP MCP Transport (POST JSON-RPC 2.0)
async function executeStreamableHttpMcp<T>(
  server: McpServerRecord,
  action: (
    rpc: (method: string, params?: any, isNotification?: boolean) => Promise<any>,
    getStatusCode: () => number
  ) => Promise<T>,
  externalSignal?: AbortSignal
): Promise<T> {
  const url = (server.url || '').trim();
  if (!url) throw new Error('Chưa cấu hình URL cho MCP server.');

  const customHeaders = safeParseJson<Record<string, string>>(server.headers_json, {});
  const timeoutMs = (server.timeout_seconds && server.timeout_seconds > 0 ? server.timeout_seconds : 30) * 1000;
  let sessionId: string | null = null;
  let nextId = 1;
  let lastStatusCode = 200;

  const rpc = async (method: string, params?: any, isNotification = false): Promise<any> => {
    if (externalSignal?.aborted) {
      throw new Error('CLIENT_ABORTED');
    }

    const reqId = isNotification ? undefined : nextId++;
    const payload: any = {
      jsonrpc: '2.0',
      method,
    };
    if (reqId !== undefined) payload.id = reqId;
    if (params !== undefined) payload.params = params;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...customHeaders,
    };
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`MCP timeout (${timeoutMs}ms)`)), timeoutMs);
    const onExtAbort = () => ctrl.abort(externalSignal?.reason || new Error('CLIENT_ABORTED'));
    externalSignal?.addEventListener('abort', onExtAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      lastStatusCode = res.status;

      const returnedSession = res.headers.get('mcp-session-id') || res.headers.get('Mcp-Session-Id');
      if (returnedSession) {
        sessionId = returnedSession;
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        // Some servers return 202/204 for notifications; anything >= 400 is an error unless it's notification
        if (!isNotification) {
          throw new Error(`HTTP ${res.status}: ${errBody || res.statusText}`);
        }
        return null;
      }

      if (isNotification || res.status === 202 || res.status === 204) {
        return null;
      }

      const data = await parseHttpMcpResponse(res, reqId);
      if (data?.error) {
        throw new Error(`MCP RPC Error (${data.error.code}): ${data.error.message}`);
      }
      return data?.result;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExtAbort);
    }
  };

  // Standard MCP Handshake
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'local-ai-mcp-client', version: '1.0.0' },
  });

  await rpc('notifications/initialized', undefined, true).catch(() => null);

  return await action(rpc, () => lastStatusCode);
}

// 2. Legacy HTTP+SSE MCP Transport (GET /sse -> endpoint event + POST messages)
async function executeSseMcp<T>(
  server: McpServerRecord,
  action: (
    rpc: (method: string, params?: any, isNotification?: boolean) => Promise<any>,
    getStatusCode: () => number
  ) => Promise<T>,
  externalSignal?: AbortSignal
): Promise<T> {
  const sseUrl = (server.url || '').trim();
  if (!sseUrl) throw new Error('Chưa cấu hình SSE URL cho MCP server.');
  if (externalSignal?.aborted) throw new Error('CLIENT_ABORTED');

  const customHeaders = safeParseJson<Record<string, string>>(server.headers_json, {});
  const timeoutMs = (server.timeout_seconds && server.timeout_seconds > 0 ? server.timeout_seconds : 30) * 1000;

  const ctrl = new AbortController();
  const globalTimer = setTimeout(() => ctrl.abort(new Error(`MCP SSE timeout (${timeoutMs}ms)`)), timeoutMs);
  const onExtAbort = () => ctrl.abort(externalSignal?.reason || new Error('CLIENT_ABORTED'));
  externalSignal?.addEventListener('abort', onExtAbort, { once: true });

  let postEndpoint = '';
  const pendingResolvers = new Map<number | string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  let nextId = 1;
  let lastStatusCode = 200;

  try {
    const res = await fetch(sseUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...customHeaders,
      },
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Không thể kết nối SSE tới ${sseUrl} (HTTP ${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let endpointReadyResolve!: (ep: string) => void;
    let endpointReadyReject!: (err: any) => void;
    const endpointPromise = new Promise<string>((resolve, reject) => {
      endpointReadyResolve = resolve;
      endpointReadyReject = reject;
    });

    // Background SSE reader
    (async () => {
      let buffer = '';
      let currentEvent = 'message';
      let currentDataLines: string[] = [];

      const dispatchEvent = () => {
        if (currentDataLines.length === 0) return;
        const dataStr = currentDataLines.join('\n').trim();
        currentDataLines = [];

        if (currentEvent === 'endpoint') {
          try {
            const resolvedUrl = new URL(dataStr, sseUrl).toString();
            endpointReadyResolve(resolvedUrl);
          } catch {
            endpointReadyReject(new Error(`Endpoint SSE không hợp lệ: ${dataStr}`));
          }
          currentEvent = 'message';
          return;
        }

        if (dataStr && dataStr.startsWith('{')) {
          try {
            const msg = JSON.parse(dataStr);
            if (msg.id !== undefined && pendingResolvers.has(msg.id)) {
              const handler = pendingResolvers.get(msg.id)!;
              pendingResolvers.delete(msg.id);
              if (msg.error) {
                handler.reject(new Error(`MCP RPC Error (${msg.error.code}): ${msg.error.message}`));
              } else {
                handler.resolve(msg.result);
              }
            }
          } catch {
            // ignore non-json message
          }
        }
        currentEvent = 'message';
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '');
            if (line === '') {
              dispatchEvent();
            } else if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              currentDataLines.push(line.slice(5).trimStart());
            }
          }
        }
      } catch (readErr) {
        endpointReadyReject(readErr);
        for (const [, p] of pendingResolvers) {
          p.reject(readErr);
        }
        pendingResolvers.clear();
      }
    })();

    postEndpoint = await endpointPromise;

    const rpc = async (method: string, params?: any, isNotification = false): Promise<any> => {
      const reqId = isNotification ? undefined : nextId++;
      const payload: any = { jsonrpc: '2.0', method };
      if (reqId !== undefined) payload.id = reqId;
      if (params !== undefined) payload.params = params;

      let waitPromise: Promise<any> = Promise.resolve(null);
      if (reqId !== undefined) {
        waitPromise = new Promise((resolve, reject) => {
          pendingResolvers.set(reqId, { resolve, reject });
        });
      }

      const postRes = await fetch(postEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...customHeaders,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      lastStatusCode = postRes.status;

      if (!postRes.ok && !isNotification) {
        if (reqId !== undefined) pendingResolvers.delete(reqId);
        const errText = await postRes.text().catch(() => '');
        throw new Error(`HTTP ${postRes.status} khi gọi ${postEndpoint}: ${errText}`);
      }

      // Some SSE servers return JSON directly in POST body instead of SSE event
      const ct = (postRes.headers.get('content-type') || '').toLowerCase();
      if (!isNotification && ct.includes('application/json')) {
        const directJson = await postRes.json().catch(() => null);
        if (directJson && (directJson.result !== undefined || directJson.error !== undefined)) {
          if (reqId !== undefined) pendingResolvers.delete(reqId);
          if (directJson.error) throw new Error(`MCP RPC Error: ${directJson.error.message}`);
          return directJson.result;
        }
      }

      const sseResult = await waitPromise;
      // Normalize 202 Accepted on SSE POST as 200 OK once RPC result completes cleanly
      if (lastStatusCode === 202) lastStatusCode = 200;
      return sseResult;
    };

    await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'local-ai-mcp-client', version: '1.0.0' },
    });
    await rpc('notifications/initialized', undefined, true).catch(() => null);

    return await action(rpc, () => lastStatusCode);
  } finally {
    clearTimeout(globalTimer);
    externalSignal?.removeEventListener('abort', onExtAbort);
    ctrl.abort();
  }
}

// 3. Stdio Local Process MCP Transport (spawn command + JSON-RPC over stdin/stdout)
async function executeStdioMcp<T>(
  server: McpServerRecord,
  action: (
    rpc: (method: string, params?: any, isNotification?: boolean) => Promise<any>,
    getStatusCode: () => number
  ) => Promise<T>,
  externalSignal?: AbortSignal
): Promise<T> {
  const command = (server.command || '').trim();
  if (!command) throw new Error('Chưa cấu hình Command cho MCP server (stdio).');
  if (externalSignal?.aborted) throw new Error('CLIENT_ABORTED');

  const args = safeParseJson<string[]>(server.args_json, []);
  const customEnv = safeParseJson<Record<string, string>>(server.env_json, {});
  const timeoutMs = (server.timeout_seconds && server.timeout_seconds > 0 ? server.timeout_seconds : 30) * 1000;

  const child = spawn(command, Array.isArray(args) ? args : [], {
    env: { ...process.env, ...customEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pendingResolvers = new Map<number | string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  let nextId = 1;
  let stderrLog = '';

  const onExtAbort = () => {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    for (const [, p] of pendingResolvers) {
      p.reject(new Error('CLIENT_ABORTED'));
    }
    pendingResolvers.clear();
  };
  externalSignal?.addEventListener('abort', onExtAbort, { once: true });

  const timer = setTimeout(() => {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    for (const [, p] of pendingResolvers) {
      p.reject(new Error(`MCP stdio timeout (${timeoutMs}ms). ${stderrLog ? `Stderr: ${stderrLog.slice(0, 200)}` : ''}`));
    }
    pendingResolvers.clear();
  }, timeoutMs);

  let stdoutBuffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf-8');
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && pendingResolvers.has(msg.id)) {
          const handler = pendingResolvers.get(msg.id)!;
          pendingResolvers.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(`MCP RPC Error (${msg.error.code}): ${msg.error.message}`));
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch {
        // ignore non-JSON stdout logs
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderrLog += chunk.toString('utf-8');
  });

  child.on('error', (err) => {
    for (const [, p] of pendingResolvers) {
      p.reject(new Error(`Không thể khởi chạy lệnh "${command}": ${err.message}`));
    }
    pendingResolvers.clear();
  });

  child.on('exit', (code) => {
    if (pendingResolvers.size > 0) {
      for (const [, p] of pendingResolvers) {
        p.reject(new Error(`Tiến trình MCP thoát sớm (code ${code}). ${stderrLog.slice(0, 200)}`));
      }
      pendingResolvers.clear();
    }
  });

  try {
    const rpc = (method: string, params?: any, isNotification = false): Promise<any> => {
      const reqId = isNotification ? undefined : nextId++;
      const payload: any = { jsonrpc: '2.0', method };
      if (reqId !== undefined) payload.id = reqId;
      if (params !== undefined) payload.params = params;

      let waitPromise: Promise<any> = Promise.resolve(null);
      if (reqId !== undefined) {
        waitPromise = new Promise((resolve, reject) => {
          pendingResolvers.set(reqId, { resolve, reject });
        });
      }

      child.stdin.write(JSON.stringify(payload) + '\n');
      return waitPromise;
    };

    await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'local-ai-mcp-client', version: '1.0.0' },
    });
    await rpc('notifications/initialized', undefined, true);

    return await action(rpc, () => 200);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExtAbort);
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
}

async function withMcpClient<T>(
  server: McpServerRecord,
  action: (
    rpc: (method: string, params?: any, isNotification?: boolean) => Promise<any>,
    getStatusCode: () => number
  ) => Promise<T>,
  externalSignal?: AbortSignal
): Promise<T> {
  if (server.transport === 'sse') {
    return executeSseMcp(server, action, externalSignal);
  }
  if (server.transport === 'stdio') {
    return executeStdioMcp(server, action, externalSignal);
  }
  return executeStreamableHttpMcp(server, action, externalSignal);
}

// Discover & list tools from a single MCP server
export async function discoverMcpTools(server: McpServerRecord): Promise<McpToolSchema[]> {
  return await withMcpClient(server, async (rpc) => {
    const result = await rpc('tools/list', {});
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map((t: any) => ({
      name: String(t.name),
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));
  });
}

// Test connection, refresh cached tools in DB, and return result
export async function testAndSyncMcpServer(serverId: number): Promise<{
  success: boolean;
  tools: McpToolSchema[];
  error?: string;
  latencyMs: number;
}> {
  const server = (await getOne(`SELECT * FROM mcp_servers WHERE id = ?`, [serverId])) as McpServerRecord | null;
  if (!server) {
    throw new Error('MCP server không tồn tại.');
  }

  const start = Date.now();
  try {
    const tools = await discoverMcpTools(server);
    const latencyMs = Date.now() - start;

    await run(
      `UPDATE mcp_servers
       SET last_status = 'connected', last_error = NULL, tools_cache_json = ?, last_checked_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(tools), serverId]
    );

    logger.info('MCPClient', `Synced MCP server #${serverId} (${server.name}): ${tools.length} tools (${latencyMs}ms)`);
    return { success: true, tools, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const errMsg = err.message || 'Lỗi kết nối MCP server';
    await run(
      `UPDATE mcp_servers
       SET last_status = 'error', last_error = ?, last_checked_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errMsg, serverId]
    );
    logger.warn('MCPClient', `Failed testing MCP server #${serverId} (${server.name}): ${errMsg}`);
    return { success: false, tools: [], error: errMsg, latencyMs };
  }
}

// Execute a single tool call on a given MCP server
export async function callMcpTool(
  serverId: number,
  toolName: string,
  args: Record<string, any> = {},
  externalSignal?: AbortSignal
): Promise<{
  text: string;
  isError: boolean;
  raw: any;
  statusCode: number;
  transport: string;
  latencyMs: number;
}> {
  const t0 = Date.now();
  const server = (await getOne(`SELECT * FROM mcp_servers WHERE id = ?`, [serverId])) as McpServerRecord | null;
  if (!server) {
    return {
      text: `Lỗi: MCP server #${serverId} không tồn tại.`,
      isError: true,
      raw: null,
      statusCode: 404,
      transport: 'unknown',
      latencyMs: Date.now() - t0,
    };
  }

  try {
    const { result, statusCode } = await withMcpClient(
      server,
      async (rpc, getStatusCode) => {
        const res = await rpc('tools/call', {
          name: toolName,
          arguments: args || {},
        });
        return { result: res, statusCode: getStatusCode() };
      },
      externalSignal
    );

    const contentArr = Array.isArray(result?.content) ? result.content : [];
    const textParts = contentArr.map((item: any) => {
      if (typeof item === 'string') return item;
      if (item?.type === 'text' && typeof item.text === 'string') return item.text;
      if (item?.type === 'resource' && item.resource?.text) return item.resource.text;
      return JSON.stringify(item);
    });

    const formattedText = textParts.length > 0 ? textParts.join('\n') : JSON.stringify(result ?? {});
    const isErr = Boolean(result?.isError);
    return {
      text: formattedText,
      isError: isErr,
      raw: result,
      statusCode: statusCode || (isErr ? 500 : 200),
      transport: server.transport,
      latencyMs: Date.now() - t0,
    };
  } catch (err: any) {
    if (err.message === 'CLIENT_ABORTED' || externalSignal?.aborted) {
      throw err;
    }
    const httpMatch = /^HTTP\s+(\d{3})/i.exec(err.message || '');
    const parsedStatus = httpMatch ? parseInt(httpMatch[1], 10) : 500;
    logger.error('MCPClient', `Tool call "${toolName}" on MCP #${serverId} failed: ${err.message}`, err);
    return {
      text: `Lỗi khi thực thi công cụ MCP "${toolName}": ${err.message}`,
      isError: true,
      raw: null,
      statusCode: parsedStatus,
      transport: server.transport,
      latencyMs: Date.now() - t0,
    };
  }
}

// Resolve group-level MCP permissions (must have group.enable_mcp = 1 AND specific servers assigned)
export async function getGroupMcpAccess(groupId?: number | null): Promise<{
  groupEnableMcp: boolean;
  allowedServerIds: number[];
}> {
  if (!groupId) {
    return { groupEnableMcp: false, allowedServerIds: [] };
  }

  const group = await getOne(`SELECT enable_mcp FROM user_groups WHERE id = ?`, [groupId]);
  if (!group || !group.enable_mcp) {
    return { groupEnableMcp: false, allowedServerIds: [] };
  }

  const rows = await query(`SELECT mcp_server_id FROM group_mcp_access WHERE group_id = ?`, [groupId]);
  return {
    groupEnableMcp: true,
    allowedServerIds: rows.map((r: any) => Number(r.mcp_server_id)),
  };
}

// Get all active MCP tool bindings for an AI model, strictly filtered by user group authorization
export async function getMcpToolBindingsForModel(
  selectedServerIds?: number[] | null,
  groupId?: number | null
): Promise<McpToolBinding[]> {
  const { groupEnableMcp, allowedServerIds } = await getGroupMcpAccess(groupId);
  if (!groupEnableMcp || allowedServerIds.length === 0) {
    return [];
  }

  const servers = (await query(`SELECT * FROM mcp_servers WHERE is_active = 1 ORDER BY id ASC`)) as McpServerRecord[];
  if (!servers || servers.length === 0) return [];

  // Intersect group-authorized MCP server IDs with model-level selection (if model specifies specific IDs)
  const effectiveServerIds =
    Array.isArray(selectedServerIds) && selectedServerIds.length > 0
      ? selectedServerIds.filter((id) => allowedServerIds.includes(id))
      : allowedServerIds;

  if (effectiveServerIds.length === 0) {
    return [];
  }

  const filtered = servers.filter((s) => effectiveServerIds.includes(s.id));
  if (filtered.length === 0) {
    return [];
  }

  const bindings: McpToolBinding[] = [];

  for (const srv of filtered) {
    let tools = safeParseJson<McpToolSchema[]>(srv.tools_cache_json, []);

    // If cache is empty and server hasn't errored just now, attempt live discovery once
    if (tools.length === 0 && srv.last_status !== 'error') {
      try {
        tools = await discoverMcpTools(srv);
        await run(
          `UPDATE mcp_servers
           SET last_status = 'connected', last_error = NULL, tools_cache_json = ?, last_checked_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(tools), srv.id]
        );
      } catch (err: any) {
        logger.warn('MCPClient', `Auto-discovery skipped for "${srv.name}": ${err.message}`);
        await run(
          `UPDATE mcp_servers SET last_status = 'error', last_error = ?, last_checked_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [err.message || 'Kết nối thất bại', srv.id]
        );
        continue;
      }
    }

    for (const tool of tools) {
      const qualifiedName = `mcp_${srv.id}__${sanitizeToolSegment(tool.name)}`;
      bindings.push({
        qualifiedName,
        originalName: tool.name,
        serverId: srv.id,
        serverName: srv.name,
        description: tool.description ? `[${srv.name}] ${tool.description}` : `[${srv.name}] Công cụ ${tool.name}`,
        rawDescription: tool.description || '',
        transport: srv.transport || 'streamable_http',
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : { type: 'object', properties: {} },
      });
    }
  }

  return bindings;
}
