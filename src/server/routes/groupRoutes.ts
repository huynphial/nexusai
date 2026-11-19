import { Router, Response } from 'express';
import { query, getOne, run } from '../db';
import { authenticateToken, requireAdmin, CustomRequest } from '../auth';
import { logger } from '../logger';

const router = Router();

router.use(authenticateToken);
router.use(requireAdmin);

// Get all groups with member counts and access rules
router.get('/', async (req: CustomRequest, res: Response) => {
  try {
    const groups = await query(`
      SELECT g.*,
             (SELECT COUNT(*) FROM users WHERE user_group_id = g.id) as member_count,
             (SELECT name FROM ai_models WHERE id = g.default_model_id) as default_model_name
      FROM user_groups g
      ORDER BY g.id ASC
    `);

    const accessRules = await query(`
      SELECT gma.*, m.name as model_name, m.provider, m.model_identifier
      FROM group_model_access gma
      JOIN ai_models m ON gma.model_id = m.id
    `);

    const mcpAccessRows = await query(`
      SELECT gm.group_id, gm.mcp_server_id, ms.name, ms.transport, ms.is_active
      FROM group_mcp_access gm
      JOIN mcp_servers ms ON gm.mcp_server_id = ms.id
      ORDER BY ms.id ASC
    `);

    const result = groups.map((g: any) => {
      const groupMcps = mcpAccessRows.filter((r: any) => r.group_id === g.id);
      return {
        ...g,
        enable_mcp: g.enable_mcp ? 1 : 0,
        access_rules: accessRules.filter((r: any) => r.group_id === g.id),
        mcp_server_ids: groupMcps.map((r: any) => Number(r.mcp_server_id)),
        mcp_servers: groupMcps.map((r: any) => ({
          id: Number(r.mcp_server_id),
          name: r.name,
          transport: r.transport,
          is_active: r.is_active,
        })),
      };
    });

    res.json({ groups: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách nhóm người dùng.' });
  }
});

// Create group
router.post('/', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const { name, description, default_model_id, enable_debug_thinking, enable_mcp, mcp_server_ids, access_rules } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên nhóm người dùng không được để trống.' });
    }

    const existing = await getOne(`SELECT id FROM user_groups WHERE LOWER(name) = LOWER(?)`, [name.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Tên nhóm này đã tồn tại.' });
    }

    const resGroup = await run(
      `INSERT INTO user_groups (name, description, default_model_id, enable_debug_thinking, enable_mcp) VALUES (?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description ? description.trim() : '',
        default_model_id ? Number(default_model_id) : null,
        enable_debug_thinking ? 1 : 0,
        enable_mcp ? 1 : 0
      ]
    );

    const groupId = resGroup.lastID;

    if (Array.isArray(access_rules)) {
      for (const rule of access_rules) {
        if (rule.model_id) {
          await run(
            `
            INSERT INTO group_model_access
            (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
              groupId,
              rule.model_id,
              rule.rate_limit_period || 'day',
              rule.rate_limit_requests || 500,
              rule.max_tokens_group || 500000,
              rule.max_tokens_per_user || 100000
            ]
          );
        }
      }
    }

    if (Array.isArray(mcp_server_ids)) {
      const uniqueIds = Array.from(new Set(mcp_server_ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)));
      for (const mcpId of uniqueIds) {
        await run(
          `INSERT OR IGNORE INTO group_mcp_access (group_id, mcp_server_id) VALUES (?, ?)`,
          [groupId, mcpId]
        );
      }
    }

    await logger.audit(adminId, adminEmail, 'ADMIN_CREATE_GROUP', `Tạo nhóm người dùng mới "${name}" (#${groupId}, MCP: ${enable_mcp ? 'BẬT' : 'TẮT'})`, req.ip);

    res.status(201).json({ message: 'Tạo nhóm thành công.', groupId });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tạo nhóm mới.' });
  }
});

// Update group metadata & model access matrix
router.put('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const groupId = parseInt(req.params.id, 10);
    const { name, description, default_model_id, enable_debug_thinking, enable_mcp, mcp_server_ids, access_rules } = req.body;

    const group = await getOne(`SELECT * FROM user_groups WHERE id = ?`, [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Nhóm không tồn tại.' });
    }

    const updatedDefaultModelId = default_model_id !== undefined
      ? (default_model_id ? Number(default_model_id) : null)
      : group.default_model_id;

    const updatedDebugThinking = enable_debug_thinking !== undefined
      ? (enable_debug_thinking ? 1 : 0)
      : (group.enable_debug_thinking || 0);

    const updatedEnableMcp = enable_mcp !== undefined
      ? (enable_mcp ? 1 : 0)
      : (group.enable_mcp || 0);

    await run(`UPDATE user_groups SET name = ?, description = ?, default_model_id = ?, enable_debug_thinking = ?, enable_mcp = ? WHERE id = ?`, [
      name ? name.trim() : group.name,
      description !== undefined ? description.trim() : group.description,
      updatedDefaultModelId,
      updatedDebugThinking,
      updatedEnableMcp,
      groupId
    ]);

    if (Array.isArray(access_rules)) {
      await run(`DELETE FROM group_model_access WHERE group_id = ?`, [groupId]);

      for (const rule of access_rules) {
        if (rule.model_id) {
          await run(
            `
            INSERT INTO group_model_access
            (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
              groupId,
              rule.model_id,
              rule.rate_limit_period || 'day',
              rule.rate_limit_requests || 500,
              rule.max_tokens_group || 500000,
              rule.max_tokens_per_user || 100000
            ]
          );
        }
      }
    }

    if (Array.isArray(mcp_server_ids)) {
      await run(`DELETE FROM group_mcp_access WHERE group_id = ?`, [groupId]);
      const uniqueIds = Array.from(new Set(mcp_server_ids.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)));
      for (const mcpId of uniqueIds) {
        await run(
          `INSERT OR IGNORE INTO group_mcp_access (group_id, mcp_server_id) VALUES (?, ?)`,
          [groupId, mcpId]
        );
      }
    }

    await logger.audit(
      adminId,
      adminEmail,
      'ADMIN_UPDATE_GROUP',
      `Cập nhật nhóm & phân quyền cho nhóm #${groupId} (${name || group.name}) [MCP: ${updatedEnableMcp ? 'BẬT' : 'TẮT'}]`,
      req.ip
    );

    res.json({ message: 'Cập nhật nhóm và cấu hình phân quyền thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi cập nhật nhóm người dùng.' });
  }
});

// Delete group
router.delete('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const groupId = parseInt(req.params.id, 10);
    const memberCount = await getOne(`SELECT COUNT(*) as count FROM users WHERE user_group_id = ?`, [groupId]);

    if (memberCount && memberCount.count > 0) {
      return res.status(400).json({
        error: `Không thể xóa nhóm này vì đang có ${memberCount.count} thành viên đang thuộc nhóm. Hãy chuyển thành viên sang nhóm khác trước.`
      });
    }

    const group = await getOne(`SELECT name FROM user_groups WHERE id = ?`, [groupId]);

    await run(`DELETE FROM user_groups WHERE id = ?`, [groupId]);
    await run(`DELETE FROM group_model_access WHERE group_id = ?`, [groupId]);
    await run(`DELETE FROM group_mcp_access WHERE group_id = ?`, [groupId]);

    await logger.audit(adminId, adminEmail, 'ADMIN_DELETE_GROUP', `Xóa nhóm #${groupId} (${group?.name || 'N/A'})`, req.ip);

    res.json({ message: 'Đã xóa nhóm thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể xóa nhóm.' });
  }
});

export default router;
