import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getOne, query, run } from '../db';
import { generateToken, authenticateToken, CustomRequest } from '../auth';

const router = Router();

// Login
router.post('/login', async (req: CustomRequest, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
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
      return res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ Admin.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
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

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: authenticatedUser
    });
  } catch (err: any) {
    console.error('[AuthRoute] Login Error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi xử lý đăng nhập.' });
  }
});

// Register (open demo registration - assigns to General Group by default)
router.post('/register', async (req: CustomRequest, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Họ tên, Email và Mật khẩu.' });
    }

    const existingUser = await getOne(`SELECT id FROM users WHERE LOWER(email) = LOWER(?)`, [email.trim()]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email này đã được đăng ký sử dụng.' });
    }

    // Default to group 3 (General Group) or first group
    const defaultGroup = await getOne(`SELECT id FROM user_groups ORDER BY id ASC LIMIT 1`);
    const groupId = defaultGroup ? defaultGroup.id : 1;

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO users (name, email, password_hash, role, user_group_id, status) VALUES (?, ?, ?, 'user', ?, 'active')`,
      [name.trim(), email.trim(), hashedPassword, groupId]
    );

    const newUser = await getOne(
      `SELECT u.*, g.name as group_name FROM users u LEFT JOIN user_groups g ON u.user_group_id = g.id WHERE u.id = ?`,
      [result.lastID]
    );

    const authenticatedUser = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      user_group_id: newUser.user_group_id,
      group_name: newUser.group_name || 'Chưa xếp nhóm'
    };

    const token = generateToken(authenticatedUser);

    res.status(201).json({
      message: 'Đăng ký tài khoản thành công',
      token,
      user: authenticatedUser
    });
  } catch (err: any) {
    console.error('[AuthRoute] Register Error:', err);
    res.status(500).json({ error: 'Lỗi hệ thống khi đăng ký.' });
  }
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
    const userId = req.user?.id;
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

    res.json({ message: 'Cập nhật thông tin cá nhân thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi cập nhật hồ sơ.' });
  }
});

export default router;
