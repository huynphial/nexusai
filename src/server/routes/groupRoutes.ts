import { Router, Response } from 'express';
import { query, getOne, run } from '../db';
import { authenticateToken, requireAdmin, CustomRequest } from '../auth';

const router = Router();

router.use(authenticateToken);
router.use(requireAdmin);

// Get all groups with member counts and access rules
router.get('/', async (req: CustomRequest, res: Response) => {
  try {
    const groups = await query(`
      SELECT g.*,
             (SELECT COUNT(*) FROM users WHERE user_group_id = g.id) as member_count
      FROM user_groups g
      ORDER BY g.id ASC
    `);

    // Fetch model access matrix for all groups
    const accessRules = await query(`
      SELECT gma.*, m.name as model_name, m.provider, m.model_identifier
      FROM group_model_access gma
      JOIN ai_models m ON gma.model_id = m.id
    `);

    const result = groups.map((g: any) => ({
      ...g,
      access_rules: accessRules.filter((r: any) => r.group_id === g.id)
    }));

    res.json({ groups: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách nhóm người dùng.' });
  }
});

// Create group
router.post('/', async (req: CustomRequest, res: Response) => {
  try {
    const { name, description, access_rules } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên nhóm người dùng không được để trống.' });
    }

    const existing = await getOne(`SELECT id FROM user_groups WHERE LOWER(name) = LOWER(?)`, [name.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Tên nhóm này đã tồn tại.' });
    }

    const resGroup = await run(
      `INSERT INTO user_groups (name, description) VALUES (?, ?)`,
      [name.trim(), description ? description.trim() : '']
    );

    const groupId = resGroup.lastID;

    // Save model access rules if provided
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

    res.status(201).json({ message: 'Tạo nhóm thành công.', groupId });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tạo nhóm mới.' });
  }
});

// Update group metadata & model access matrix
router.put('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const { name, description, access_rules } = req.body;

    const group = await getOne(`SELECT * FROM user_groups WHERE id = ?`, [groupId]);
    if (!group) {
      return res.status(404).json({ error: 'Nhóm không tồn tại.' });
    }

    if (name) {
      await run(`UPDATE user_groups SET name = ?, description = ? WHERE id = ?`, [
        name.trim(),
        description !== undefined ? description.trim() : group.description,
        groupId
      ]);
    }

    // Replace access rules matrix if provided
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

    res.json({ message: 'Cập nhật nhóm và cấu hình phân quyền mô hình thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi cập nhật nhóm người dùng.' });
  }
});

// Delete group
router.delete('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const groupId = parseInt(req.params.id, 10);
    const memberCount = await getOne(`SELECT COUNT(*) as count FROM users WHERE user_group_id = ?`, [groupId]);

    if (memberCount && memberCount.count > 0) {
      return res.status(400).json({
        error: `Không thể xóa nhóm này vì đang có ${memberCount.count} thành viên đang thuộc nhóm. Hãy chuyển thành viên sang nhóm khác trước.`
      });
    }

    await run(`DELETE FROM user_groups WHERE id = ?`, [groupId]);
    await run(`DELETE FROM group_model_access WHERE group_id = ?`, [groupId]);

    res.json({ message: 'Đã xóa nhóm thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể xóa nhóm.' });
  }
});

export default router;
