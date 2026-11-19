import { Router, Response } from 'express';
import { query, getOne, run } from '../db';
import { authenticateToken, requireAdmin, CustomRequest } from '../auth';
import { testAndSyncMcpServer, callMcpTool } from '../mcpClient';
import { logger } from '../logger';

const router = Router();
router.use(authenticateToken);
router.use(requireAdmin);

function formatMcpRow(row: any, groupMappings: any[] = []) {
  let tools: any[] = [];
  if (row.tools_cache_json) {
    try {
      const parsed = JSON.parse(row.tools_cache_json);
      if (Array.isArray(parsed)) tools = parsed;
    } catch {
      tools = [];
    }
  }
  const serverGroups = groupMappings.filter((gm) => Number(gm.mcp_server_id) === Number(row.id));
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    transport: row.transport || 'streamable_http',
    url: row.url || '',
    headers_json: row.headers_json || '',
    command: row.command || '',
    args_json: row.args_json || '',
    env_json: row.env_json || '',
    timeout_seconds: row.timeout_seconds || 30,
    is_active: row.is_active ?? 1,
    last_status: row.last_status || 'unknown',
    last_error: row.last_error || '',
    tools,
    tools_count: tools.length,
    allowed_group_ids: serverGroups.map((g) => Number(g.group_id)),
    allowed_groups: serverGroups.map((g) => ({
      id: Number(g.group_id),
      name: g.group_name,
      enable_mcp: g.enable_mcp ? 1 : 0,
    })),
    last_checked_at: row.last_checked_at || null,
    created_at: row.created_at,
  };
}

// Get all MCP servers
router.get('/', async (_req: CustomRequest, res: Response) => {
  try {
    const rows = await query(`SELECT * FROM mcp_servers ORDER BY id DESC`);
    const groupMappings = await query(`
      SELECT gm.mcp_server_id, gm.group_id, ug.name as group_name, COALESCE(ug.enable_mcp, 0) as enable_mcp
      FROM group_mcp_access gm
      JOIN user_groups ug ON gm.group_id = ug.id
      ORDER BY ug.id ASC
    `);
    res.json({ servers: rows.map((r: any) => formatMcpRow(r, groupMappings)) });
  } catch (err: any) {
    logger.error('MCPRoute', 'List MCP servers error', err);
    res.status(500).json({ error: 'Không thể lấy danh sách MCP server.' });
  }
});

// Create MCP server
router.post('/', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const {
      name,
      description,
      transport = 'streamable_http',
      url,
      headers_json,
      command,
      args_json,
      env_json,
      timeout_seconds,
      is_active,
      allowed_group_ids,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập tên MCP server.' });
    }

    if ((transport === 'streamable_http' || transport === 'sse') && (!url || !url.trim())) {
      return res.status(400).json({ error: 'Vui lòng nhập Endpoint URL cho MCP server.' });
    }

    if (transport === 'stdio' && (!command || !command.trim())) {
      return res.status(400).json({ error: 'Vui lòng nhập Command thực thi cho MCP server (stdio).' });
    }

    if (headers_json && headers_json.trim()) {
      try {
        JSON.parse(headers_json);
      } catch {
        return res.status(400).json({ error: 'Custom Headers phải là JSON hợp lệ.' });
      }
    }

    if (args_json && args_json.trim()) {
      try {
        const parsedArgs = JSON.parse(args_json);
        if (!Array.isArray(parsedArgs)) {
          return res.status(400).json({ error: 'Arguments (args) phải là một mảng JSON, ví dụ: ["-y", "@modelcontextprotocol/server-everything"].' });
        }
      } catch {
        return res.status(400).json({ error: 'Arguments (args) phải là JSON mảng hợp lệ.' });
      }
    }

    if (env_json && env_json.trim()) {
      try {
        JSON.parse(env_json);
      } catch {
        return res.status(400).json({ error: 'Biến môi trường (Env) phải là JSON object hợp lệ.' });
      }
    }

    const result = await run(
      `
      INSERT INTO mcp_servers (name, description, transport, url, headers_json, command, args_json, env_json, timeout_seconds, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name.trim(),
        description ? description.trim() : '',
        transport,
        url ? url.trim() : '',
        headers_json ? headers_json.trim() : '',
        command ? command.trim() : '',
        args_json ? args_json.trim() : '[]',
        env_json ? env_json.trim() : '{}',
        timeout_seconds ? Math.max(5, Number(timeout_seconds)) : 30,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
      ]
    );

    const serverId = result.lastID;

    if (Array.isArray(allowed_group_ids)) {
      const uniqueGroupIds = Array.from(new Set(allowed_group_ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)));
      for (const gId of uniqueGroupIds) {
        await run(`INSERT OR IGNORE INTO group_mcp_access (group_id, mcp_server_id) VALUES (?, ?)`, [gId, serverId]);
      }
    }

    await logger.audit(adminId, adminEmail, 'ADMIN_CREATE_MCP', `Thêm MCP Server "${name.trim()}" (${transport})`, req.ip);

    // Attempt initial connection & tool discovery
    const syncRes = await testAndSyncMcpServer(serverId);
    const createdRow = await getOne(`SELECT * FROM mcp_servers WHERE id = ?`, [serverId]);
    const groupMappings = await query(`
      SELECT gm.mcp_server_id, gm.group_id, ug.name as group_name, COALESCE(ug.enable_mcp, 0) as enable_mcp
      FROM group_mcp_access gm
      JOIN user_groups ug ON gm.group_id = ug.id
      WHERE gm.mcp_server_id = ?
    `, [serverId]);

    res.status(201).json({
      message: syncRes.success
        ? `Đã thêm MCP server và đồng bộ ${syncRes.tools.length} công cụ.`
        : 'Đã thêm MCP server (chưa kết nối được ngay, vui lòng kiểm tra lại cấu hình/server).',
      server: createdRow ? formatMcpRow(createdRow, groupMappings) : null,
      sync: syncRes,
    });
  } catch (err: any) {
    logger.error('MCPRoute', 'Create MCP server error', err);
    res.status(500).json({ error: 'Lỗi khi thêm MCP server.' });
  }
});

// Update MCP server
router.put('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const serverId = parseInt(req.params.id, 10);

    const existing = await getOne(`SELECT * FROM mcp_servers WHERE id = ?`, [serverId]);
    if (!existing) {
      return res.status(404).json({ error: 'MCP server không tồn tại.' });
    }

    const {
      name,
      description,
      transport,
      url,
      headers_json,
      command,
      args_json,
      env_json,
      timeout_seconds,
      is_active,
      allowed_group_ids,
    } = req.body;

    if (headers_json && headers_json.trim()) {
      try {
        JSON.parse(headers_json);
      } catch {
        return res.status(400).json({ error: 'Custom Headers phải là JSON hợp lệ.' });
      }
    }

    if (args_json && args_json.trim()) {
      try {
        const parsedArgs = JSON.parse(args_json);
        if (!Array.isArray(parsedArgs)) {
          return res.status(400).json({ error: 'Arguments (args) phải là JSON mảng hợp lệ.' });
        }
      } catch {
        return res.status(400).json({ error: 'Arguments (args) phải là JSON mảng hợp lệ.' });
      }
    }

    if (env_json && env_json.trim()) {
      try {
        JSON.parse(env_json);
      } catch {
        return res.status(400).json({ error: 'Biến môi trường (Env) phải là JSON object hợp lệ.' });
      }
    }

    const nextTransport = transport || existing.transport;
    const nextUrl = url !== undefined ? url.trim() : existing.url;
    const nextCommand = command !== undefined ? command.trim() : existing.command;
    const endpointChanged =
      nextTransport !== existing.transport ||
      nextUrl !== existing.url ||
      nextCommand !== existing.command ||
      (args_json !== undefined && args_json.trim() !== (existing.args_json || ''));

    await run(
      `
      UPDATE mcp_servers
      SET name = ?, description = ?, transport = ?, url = ?, headers_json = ?,
          command = ?, args_json = ?, env_json = ?, timeout_seconds = ?, is_active = ?,
          last_status = ?, tools_cache_json = ?
      WHERE id = ?
      `,
      [
        name ? name.trim() : existing.name,
        description !== undefined ? description.trim() : existing.description,
        nextTransport,
        nextUrl,
        headers_json !== undefined ? headers_json.trim() : existing.headers_json,
        nextCommand,
        args_json !== undefined ? args_json.trim() : existing.args_json,
        env_json !== undefined ? env_json.trim() : existing.env_json,
        timeout_seconds !== undefined ? Math.max(5, Number(timeout_seconds)) : (existing.timeout_seconds || 30),
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        endpointChanged ? 'unknown' : existing.last_status,
        endpointChanged ? null : existing.tools_cache_json,
        serverId,
      ]
    );

    if (Array.isArray(allowed_group_ids)) {
      await run(`DELETE FROM group_mcp_access WHERE mcp_server_id = ?`, [serverId]);
      const uniqueGroupIds = Array.from(new Set(allowed_group_ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)));
      for (const gId of uniqueGroupIds) {
        await run(`INSERT OR IGNORE INTO group_mcp_access (group_id, mcp_server_id) VALUES (?, ?)`, [gId, serverId]);
      }
    }

    await logger.audit(adminId, adminEmail, 'ADMIN_UPDATE_MCP', `Cập nhật MCP Server #${serverId} (${name || existing.name})`, req.ip);

    const updated = await getOne(`SELECT * FROM mcp_servers WHERE id = ?`, [serverId]);
    const groupMappings = await query(`
      SELECT gm.mcp_server_id, gm.group_id, ug.name as group_name, COALESCE(ug.enable_mcp, 0) as enable_mcp
      FROM group_mcp_access gm
      JOIN user_groups ug ON gm.group_id = ug.id
      WHERE gm.mcp_server_id = ?
    `, [serverId]);
    res.json({ message: 'Cập nhật MCP server thành công.', server: updated ? formatMcpRow(updated, groupMappings) : null });
  } catch (err: any) {
    logger.error('MCPRoute', 'Update MCP server error', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật MCP server.' });
  }
});

// Test MCP connection & synchronize available tools
router.post('/:id/test', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const serverId = parseInt(req.params.id, 10);

    const result = await testAndSyncMcpServer(serverId);
    await logger.audit(
      adminId,
      adminEmail,
      'ADMIN_TEST_MCP',
      `Kiểm tra kết nối MCP #${serverId}: ${result.success ? `Thành công (${result.tools.length} tools)` : `Lỗi: ${result.error}`}`,
      req.ip
    );

    const updated = await getOne(`SELECT * FROM mcp_servers WHERE id = ?`, [serverId]);
    res.json({
      ...result,
      server: updated ? formatMcpRow(updated) : null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Không thể kiểm tra kết nối MCP.' });
  }
});

// Test-execute a specific MCP tool
router.post('/:id/call-tool', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const serverId = parseInt(req.params.id, 10);
    const { toolName, arguments: toolArgs } = req.body;

    if (!toolName) {
      return res.status(400).json({ error: 'Vui lòng chỉ định tên công cụ (toolName).' });
    }

    const result = await callMcpTool(serverId, toolName, toolArgs || {});
    await logger.audit(adminId, adminEmail, 'ADMIN_CALL_MCP_TOOL', `Chạy thử công cụ "${toolName}" trên MCP #${serverId}`, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ isError: true, text: err.message || 'Lỗi khi gọi công cụ MCP.' });
  }
});

// Delete MCP server
router.delete('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const serverId = parseInt(req.params.id, 10);

    const server = await getOne(`SELECT name FROM mcp_servers WHERE id = ?`, [serverId]);
    await run(`DELETE FROM mcp_servers WHERE id = ?`, [serverId]);
    await run(`DELETE FROM group_mcp_access WHERE mcp_server_id = ?`, [serverId]);

    await logger.audit(adminId, adminEmail, 'ADMIN_DELETE_MCP', `Xóa MCP Server #${serverId} (${server?.name || 'N/A'})`, req.ip);
    res.json({ message: 'Đã xóa MCP server.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể xóa MCP server.' });
  }
});

export default router;
