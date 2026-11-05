import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getOne, query, run } from '../db';
import { generateToken, authenticateToken, CustomRequest } from '../auth';
import { logger } from '../logger';

const router = Router();

// Login
router.post('/login', async (req: CustomRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      logger.debug('Auth', 'Login attempted without email or password');
      return res.status(400).json({ error: 'Vui lòng nhập Email và Mật khẩu.' });
    }

    const user = await getOne(
      `
      SELECT u.*, g.name as group_name
      FROM users u
      LEFT JOIN user_groups g ON u.user_group_id = g.id
      WHERE LOWER(u.email) = LOWER(?)
      `,
      [email.trim()]
    );

    if (!user) {
      logger.debug('Auth', `Login failed: user email "${email}" not found`);
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    if (user.status !== 'active') {
      logger.debug('Auth', `Login failed: user "${email}" account suspended`);
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ Admin.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      logger.debug('Auth', `Login failed: incorrect password for "${email}"`);
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    const authenticatedUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      user_group_id: user.user_group_id,
      group_name: user.group_name || 'Chưa xếp nhóm'
    };

    const token = generateToken(authenticatedUser);

    // Audit log
    await logger.audit(user.id, user.email, 'USER_LOGIN', `Đăng nhập hệ thống thành công (Nhóm: ${user.group_name || 'Chưa xếp'})`, req.ip);

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: authenticatedUser
    });
  } catch (err: any) {
    logger.error('AuthRoute', 'Login Error', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi xử lý đăng nhập.' });
  }
});

// Register (Disabled per system policy: only Admin can create users)
router.post('/register', async (_req: CustomRequest, res: Response) => {
  return res.status(403).json({
    error: 'Tính năng tự đăng ký tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ Quản trị viên hệ thống để được cấp tài khoản sử dụng.'
  });
});

// Current user details
router.get('/me', authenticateToken, async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const user = await getOne(
      `
      SELECT u.id, u.name, u.email, u.role, u.user_group_id, u.status, u.created_at, g.name as group_name
      FROM users u
      LEFT JOIN user_groups g ON u.user_group_id = g.id
      WHERE u.id = ?
      `,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi tải thông tin cá nhân.' });
  }
});

// Change password / profile
router.put('/profile', authenticateToken, async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { name, currentPassword, newPassword } = req.body;

    const user = await getOne(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    let passwordHash = user.password_hash;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại để đổi mật khẩu mới.' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updatedName = name ? name.trim() : user.name;
    await run(`UPDATE users SET name = ?, password_hash = ? WHERE id = ?`, [updatedName, passwordHash, userId]);

    await logger.audit(userId, user.email, 'UPDATE_PROFILE', 'Cập nhật thông tin cá nhân / mật khẩu', req.ip);

    res.json({ message: 'Cập nhật thông tin cá nhân thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi cập nhật hồ sơ.' });
  }
});

export default router;
