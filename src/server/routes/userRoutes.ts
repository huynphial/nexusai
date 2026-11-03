import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, getOne, run } from '../db';
import { authenticateToken, requireAdmin, CustomRequest } from '../auth';
import { logger } from '../logger';

const router = Router();

router.use(authenticateToken);
router.use(requireAdmin);

// Get all users
router.get('/', async (req: CustomRequest, res: Response) => {
  try {
    const users = await query(`
      SELECT u.id, u.name, u.email, u.role, u.user_group_id, u.status, u.created_at,
             g.name as group_name,
             COALESCE((SELECT SUM(tokens_count) FROM token_usage_logs WHERE user_id = u.id), 0) as total_tokens
      FROM users u
      LEFT JOIN user_groups g ON u.user_group_id = g.id
      ORDER BY u.id DESC
    `);
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách người dùng.' });
  }
});

// Create user
router.post('/', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const { name, email, password, role, user_group_id } = req.body;

    if (!name || !email || !password || !user_group_id) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên, email, mật khẩu và nhóm người dùng.' });
    }

    const existing = await getOne(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`, [email.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Email này đã tồn tại trong hệ thống.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO users (name, email, password_hash, role, user_group_id, status) VALUES (?, ?, ?, ?, ?, 'active')`,
      [name.trim(), email.trim(), hashedPassword, role || 'user', user_group_id]
    );

    const newUser = await getOne(
      `SELECT u.id, u.name, u.email, u.role, u.user_group_id, u.status, u.created_at, g.name as group_name
       FROM users u LEFT JOIN user_groups g ON u.user_group_id = g.id WHERE u.id = ?`,
      [result.lastID]
    );

    await logger.audit(adminId, adminEmail, 'ADMIN_CREATE_USER', `Tạo người dùng mới: ${email} (${role})`, req.ip);

    res.status(201).json({ message: 'Tạo người dùng thành công.', user: newUser });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể tạo người dùng mới.' });
  }
});

// Update user
router.put('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const targetUserId = parseInt(req.params.id, 10);
    const { name, email, role, user_group_id, status, newPassword } = req.body;

    const user = await getOne(`SELECT * FROM users WHERE id = ?`, [targetUserId]);
    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại.' });
    }

    let passwordHash = user.password_hash;
    if (newPassword && newPassword.trim().length > 0) {
      passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    }

    await run(
      `
      UPDATE users
      SET name = ?, email = ?, role = ?, user_group_id = ?, status = ?, password_hash = ?
      WHERE id = ?
      `,
      [
        name ? name.trim() : user.name,
        email ? email.trim() : user.email,
        role || user.role,
        user_group_id || user.user_group_id,
        status || user.status,
        passwordHash,
        targetUserId
      ]
    );

    await logger.audit(adminId, adminEmail, 'ADMIN_UPDATE_USER', `Cập nhật tài khoản #${targetUserId} (${email || user.email})`, req.ip);

    res.json({ message: 'Cập nhật thông tin người dùng thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi cập nhật thông tin người dùng.' });
  }
});

// Delete user
router.delete('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const adminId = req.user?.id!;
    const adminEmail = req.user?.email!;
    const targetUserId = parseInt(req.params.id, 10);

    if (adminId === targetUserId) {
      return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản Admin đang đăng nhập!' });
    }

    const targetUser = await getOne(`SELECT email FROM users WHERE id = ?`, [targetUserId]);

    await run(`DELETE FROM users WHERE id = ?`, [targetUserId]);
    await run(`DELETE FROM token_usage_logs WHERE user_id = ?`, [targetUserId]);

    await logger.audit(adminId, adminEmail, 'ADMIN_DELETE_USER', `Xóa tài khoản #${targetUserId} (${targetUser?.email || 'N/A'})`, req.ip);

    res.json({ message: 'Đã xóa người dùng thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể xóa người dùng.' });
  }
});

export default router;
