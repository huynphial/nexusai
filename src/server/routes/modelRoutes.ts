import { Router, Response } from 'express';
import { query, getOne, run } from '../db';
import { authenticateToken, requireAdmin, CustomRequest } from '../auth';

const router = Router();

router.use(authenticateToken);
router.use(requireAdmin);

// Helper to mask secret API token
function maskToken(token?: string) {
  if (!token) return '';
  if (token.length <= 8) return '••••••••';
  return token.substring(0, 4) + '••••••••' + token.substring(token.length - 4);
}

// Get all AI models
router.get('/', async (req: CustomRequest, res: Response) => {
  try {
    const models = await query(`SELECT * FROM ai_models ORDER BY id DESC`);
    const sanitized = models.map((m: any) => ({
      ...m,
      has_token: !!m.api_token,
      masked_token: maskToken(m.api_token)
    }));
    res.json({ models: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách mô hình AI.' });
  }
});

// Create AI model
router.post('/', async (req: CustomRequest, res: Response) => {
  try {
    const { name, provider, model_identifier, api_url, api_token, system_prompt, is_active } = req.body;
    if (!name || !provider || !model_identifier) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tên hiển thị, Provider và Mã định danh Model.' });
    }

    const result = await run(
      `
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name.trim(),
        provider,
        model_identifier.trim(),
        api_url ? api_url.trim() : '',
        api_token ? api_token.trim() : '',
        system_prompt ? system_prompt.trim() : '',
        is_active !== undefined ? (is_active ? 1 : 0) : 1
      ]
    );

    res.status(201).json({ message: 'Thêm mới mô hình AI thành công.', modelId: result.lastID });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi thêm mới mô hình AI.' });
  }
});

// Update AI model
router.put('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const modelId = parseInt(req.params.id, 10);
    const { name, provider, model_identifier, api_url, api_token, system_prompt, is_active } = req.body;

    const existing = await getOne(`SELECT * FROM ai_models WHERE id = ?`, [modelId]);
    if (!existing) {
      return res.status(404).json({ error: 'Mô hình AI không tồn tại.' });
    }

    // Keep existing token if not provided or left blank in edit
    let updatedToken = existing.api_token;
    if (api_token !== undefined && !api_token.includes('••••')) {
      updatedToken = api_token.trim();
    }

    await run(
      `
      UPDATE ai_models
      SET name = ?, provider = ?, model_identifier = ?, api_url = ?, api_token = ?, system_prompt = ?, is_active = ?
      WHERE id = ?
      `,
      [
        name ? name.trim() : existing.name,
        provider || existing.provider,
        model_identifier ? model_identifier.trim() : existing.model_identifier,
        api_url !== undefined ? api_url.trim() : existing.api_url,
        updatedToken,
        system_prompt !== undefined ? system_prompt.trim() : existing.system_prompt,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        modelId
      ]
    );

    res.json({ message: 'Cập nhật cấu hình mô hình AI thành công.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Lỗi khi cập nhật mô hình AI.' });
  }
});

// Delete AI model
router.delete('/:id', async (req: CustomRequest, res: Response) => {
  try {
    const modelId = parseInt(req.params.id, 10);
    await run(`DELETE FROM ai_models WHERE id = ?`, [modelId]);
    await run(`DELETE FROM group_model_access WHERE model_id = ?`, [modelId]);

    res.json({ message: 'Đã xóa mô hình AI.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể xóa mô hình AI.' });
  }
});

export default router;
