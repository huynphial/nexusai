import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'nexus_llm_secret_key_2026_super_secure';

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  user_group_id: number;
  group_name?: string;
}

export interface CustomRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      user_group_id: user.user_group_id,
      group_name: user.group_name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function authenticateToken(req: CustomRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Chưa đăng nhập. Vui lòng cung cấp JWT Token.' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    req.user = user as AuthenticatedUser;
    next();
  });
}

export function requireAdmin(req: CustomRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Quyền truy cập bị từ chối. Chỉ dành cho Quản trị viên (Admin).' });
  }
  next();
}
