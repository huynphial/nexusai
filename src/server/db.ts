import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_TYPE = process.env.DB_TYPE || 'sqlite';
const DB_FILE = process.env.DB_FILE || './data/database.sqlite';

const dataDir = path.dirname(path.resolve(DB_FILE));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.resolve(DB_FILE);

let dbInstance: SqlJsDatabase | null = null;

async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs({
    locateFile: (file) => {
      // 1. Check process.cwd() node_modules (development)
      const cwdNodeWasm = path.resolve(process.cwd(), 'node_modules/sql.js/dist', file);
      if (fs.existsSync(cwdNodeWasm)) return cwdNodeWasm;

      // 2. Check current __dirname (production dist/ folder)
      const currentDirWasm = path.resolve(__dirname, file);
      if (fs.existsSync(currentDirWasm)) return currentDirWasm;

      // 3. Check dist directory relative
      const distWasm = path.resolve(process.cwd(), 'dist', file);
      if (fs.existsSync(distWasm)) return distWasm;

      return file;
    }
  });

  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (e) {
      console.warn('[Database] Existing database file corrupted or unreadable, initializing fresh DB.', e);
      dbInstance = new SQL.Database();
      saveDb(dbInstance);
    }
  } else {
    dbInstance = new SQL.Database();
    saveDb(dbInstance);
  }

  return dbInstance;
}

function saveDb(db: SqlJsDatabase) {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('[Database] Failed to save database file:', err);
  }
}

// Promisified Database API
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export async function getOne(sql: string, params: any[] = []): Promise<any> {
  const rows = await query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  const db = await getDb();
  db.run(sql, params);
  saveDb(db);

  const lastIdRes = db.exec("SELECT last_insert_rowid() as id");
  const lastID = (lastIdRes[0]?.values[0]?.[0] as number) || 0;
  const changes = db.getRowsModified();

  return { lastID, changes };
}

// Initialize Schema & Seed Data
export async function initDatabase() {
  try {
    // 1. Users table
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        user_group_id INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. User Groups table
    await run(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. AI Models table
    await run(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_identifier TEXT NOT NULL,
        api_url TEXT,
        api_token TEXT,
        system_prompt TEXT,
        timeout_seconds INTEGER DEFAULT 60,
        enable_stream INTEGER DEFAULT 1,
        enable_thinking INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. Group Model Access table
    await run(`
      CREATE TABLE IF NOT EXISTS group_model_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        rate_limit_period TEXT NOT NULL DEFAULT 'day',
        rate_limit_requests INTEGER NOT NULL DEFAULT 500,
        max_tokens_group INTEGER NOT NULL DEFAULT 500000,
        max_tokens_per_user INTEGER NOT NULL DEFAULT 100000,
        UNIQUE(group_id, model_id)
      )
    `);

    // 5. Chat Sessions table
    await run(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Chat Messages table
    await run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        thinking_content TEXT,
        x_choices TEXT,
        tokens_used INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        tokens_per_second REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await run(`ALTER TABLE chat_messages ADD COLUMN x_choices TEXT`);
    } catch {
      // Column might already exist
    }

    // 7. Token Usage Logs table
    await run(`
      CREATE TABLE IF NOT EXISTS token_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        tokens_count INTEGER NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 8. User Action Audit Logs table
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        user_email TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        ip_address TEXT DEFAULT '127.0.0.1',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Schema dynamic migrations for existing database
    try {
      const modelCols = await query(`PRAGMA table_info(ai_models)`);
      const modelColNames = modelCols.map((c: any) => c.name);
      if (!modelColNames.includes('timeout_seconds')) {
        await run(`ALTER TABLE ai_models ADD COLUMN timeout_seconds INTEGER DEFAULT 60`);
      }
      if (!modelColNames.includes('enable_stream')) {
        await run(`ALTER TABLE ai_models ADD COLUMN enable_stream INTEGER DEFAULT 1`);
      }
      if (!modelColNames.includes('enable_thinking')) {
        await run(`ALTER TABLE ai_models ADD COLUMN enable_thinking INTEGER DEFAULT 1`);
      }

      const msgCols = await query(`PRAGMA table_info(chat_messages)`);
      const msgColNames = msgCols.map((c: any) => c.name);
      if (!msgColNames.includes('thinking_content')) {
        await run(`ALTER TABLE chat_messages ADD COLUMN thinking_content TEXT`);
      }
      if (!msgColNames.includes('latency_ms')) {
        await run(`ALTER TABLE chat_messages ADD COLUMN latency_ms INTEGER DEFAULT 0`);
      }
      if (!msgColNames.includes('tokens_per_second')) {
        await run(`ALTER TABLE chat_messages ADD COLUMN tokens_per_second REAL DEFAULT 0`);
      }
      if (!msgColNames.includes('progress_steps')) {
        await run(`ALTER TABLE chat_messages ADD COLUMN progress_steps TEXT`);
      }

      const groupCols = await query(`PRAGMA table_info(user_groups)`);
      const groupColNames = groupCols.map((c: any) => c.name);
      if (!groupColNames.includes('default_model_id')) {
        await run(`ALTER TABLE user_groups ADD COLUMN default_model_id INTEGER`);
      }
    } catch (migErr) {
      console.warn('[Database] Column migration notice:', migErr);
    }

    await seedDefaults();
    console.log('[Database] WebAssembly SQLite schema initialization & seed complete.');
  } catch (err) {
    console.error('[Database] Schema initialization failed:', err);
  }
}

async function seedDefaults() {
  // Ensure the 2 simplified groups exist: Nhóm Quản Trị (Admin) & Nhóm Người Dùng (User)
  let adminGroup = await getOne(`SELECT * FROM user_groups WHERE name LIKE '%Quản Trị%' OR name LIKE '%Admin%' LIMIT 1`);
  if (!adminGroup) {
    const res = await run(
      `INSERT INTO user_groups (name, description) VALUES (?, ?)`,
      [
        'Nhóm Quản Trị (Admin)',
        'Quyền quản trị toàn diện hệ thống Local AI, toàn quyền truy cập Dashboard, cấu hình mô hình, hạn ngạch và chat.'
      ]
    );
    adminGroup = { id: res.lastID, name: 'Nhóm Quản Trị (Admin)' };
  } else {
    await run(
      `UPDATE user_groups SET name = ?, description = ? WHERE id = ?`,
      [
        'Nhóm Quản Trị (Admin)',
        'Quyền quản trị toàn diện hệ thống Local AI, toàn quyền truy cập Dashboard, cấu hình mô hình, hạn ngạch và chat.',
        adminGroup.id
      ]
    );
  }

  let userGroup = await getOne(`SELECT * FROM user_groups WHERE (name LIKE '%Người Dùng%' OR name LIKE '%User%' OR name LIKE '%General%') AND id != ? LIMIT 1`, [adminGroup.id]);
  if (!userGroup) {
    const res = await run(
      `INSERT INTO user_groups (name, description) VALUES (?, ?)`,
      [
        'Nhóm Người Dùng (User)',
        'Nhóm người dùng thông thường, chỉ được phép sử dụng giao diện Chat LLM với các mô hình được phân quyền, không truy cập giao diện quản trị.'
      ]
    );
    userGroup = { id: res.lastID, name: 'Nhóm Người Dùng (User)' };
  } else {
    await run(
      `UPDATE user_groups SET name = ?, description = ? WHERE id = ?`,
      [
        'Nhóm Người Dùng (User)',
        'Nhóm người dùng thông thường, chỉ được phép sử dụng giao diện Chat LLM với các mô hình được phân quyền, không truy cập giao diện quản trị.',
        userGroup.id
      ]
    );
  }

  // Remove any redundant legacy groups beyond the 2 standard groups
  await run(`DELETE FROM user_groups WHERE id NOT IN (?, ?)`, [adminGroup.id, userGroup.id]);

  // Synchronize existing users: admin role -> adminGroup, user role -> userGroup
  await run(`UPDATE users SET user_group_id = ? WHERE role = 'admin'`, [adminGroup.id]);
  await run(`UPDATE users SET user_group_id = ? WHERE role = 'user' OR role IS NULL`, [userGroup.id]);

  const existingUsers = await query(`SELECT COUNT(*) as count FROM users`);
  if (existingUsers[0].count === 0) {
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@nexusai.io';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const hashedAdminPass = await bcrypt.hash(adminPassword, 10);

    // Initial Admin Account
    await run(`
      INSERT INTO users (name, email, password_hash, role, user_group_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['System Admin', adminEmail, hashedAdminPass, 'admin', adminGroup.id, 'active']);
  }

  const existingModels = await query(`SELECT COUNT(*) as count FROM ai_models`);
  if (existingModels[0].count === 0) {
    const geminiRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, timeout_seconds, enable_stream, enable_thinking, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 60, 1, 1, 1)
    `, [
      'Gemini 3.8 Flash',
      'gemini',
      'gemini-3.8-flash',
      '',
      '',
      'Bạn là trợ lý trí tuệ nhân tạo Local AI, hỗ trợ người dùng giải quyết công việc chuyên nghiệp, chu đáo bằng Tiếng Việt.'
    ]);
    const geminiModelId = geminiRes.lastID;

    const gpt4oRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, timeout_seconds, enable_stream, enable_thinking, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 120, 1, 1, 1)
    `, [
      'GPT-4o',
      'openai_compatible',
      'gpt-4o',
      'https://api.openai.com/v1',
      '',
      'Bạn là trợ lý AI cao cấp GPT-4o. Phân tích chi tiết và phản hồi chuẩn xác bằng Markdown.'
    ]);
    const gpt4oModelId = gpt4oRes.lastID;

    const gpt4oMiniRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, timeout_seconds, enable_stream, enable_thinking, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 60, 1, 0, 1)
    `, [
      'GPT-4o Mini',
      'openai_compatible',
      'gpt-4o-mini',
      'https://api.openai.com/v1',
      '',
      'Bạn là trợ lý gọn nhẹ GPT-4o Mini, phản hồi nhanh chóng và ngắn gọn.'
    ]);
    const gpt4oMiniModelId = gpt4oMiniRes.lastID;

    const deepseekRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, timeout_seconds, enable_stream, enable_thinking, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 120, 1, 1, 1)
    `, [
      'DeepSeek R1 / Chat',
      'openai_compatible',
      'deepseek-chat',
      'https://api.deepseek.com/v1',
      '',
      'Bạn là mô hình suy luận chuyên sâu DeepSeek. Hãy phân tích kỹ lưỡng các bài toán và phản hồi rõ ràng.'
    ]);
    const deepseekModelId = deepseekRes.lastID;

    // Assign to Admin Group (Generous Quota)
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [adminGroup.id, geminiModelId, 'day', 10000, 10000000, 2000000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [adminGroup.id, gpt4oModelId, 'day', 10000, 10000000, 2000000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [adminGroup.id, gpt4oMiniModelId, 'day', 20000, 20000000, 5000000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [adminGroup.id, deepseekModelId, 'day', 10000, 10000000, 2000000]);

    // Assign to User Group (Standard Quota)
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [userGroup.id, geminiModelId, 'day', 1000, 1000000, 200000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [userGroup.id, gpt4oModelId, 'day', 500, 500000, 100000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [userGroup.id, gpt4oMiniModelId, 'day', 2000, 2000000, 300000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [userGroup.id, deepseekModelId, 'day', 500, 500000, 100000]);
  } else {
    // If models exist, ensure all active models are assigned to both Admin and User group if not already
    const allModels = await query(`SELECT id FROM ai_models`);
    for (const m of allModels) {
      const adminHas = await getOne(`SELECT id FROM group_model_access WHERE group_id = ? AND model_id = ?`, [adminGroup.id, m.id]);
      if (!adminHas) {
        await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, 'day', 10000, 10000000, 2000000)`, [adminGroup.id, m.id]);
      }
      const userHas = await getOne(`SELECT id FROM group_model_access WHERE group_id = ? AND model_id = ?`, [userGroup.id, m.id]);
      if (!userHas) {
        await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, 'day', 1000, 1000000, 200000)`, [userGroup.id, m.id]);
      }
    }
  }

  // Ensure at least one step_progress model is available for demonstration & testing
  const existingStepProgress = await getOne(`SELECT * FROM ai_models WHERE provider = 'step_progress' LIMIT 1`);
  if (!existingStepProgress) {
    const stepModelRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, timeout_seconds, enable_stream, enable_thinking, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 120, 1, 1, 1)
    `, [
      'Progress Gateway / RAG (Qwen 3 8B)',
      'step_progress',
      'qwen3:8b',
      'http://localhost:8000/v1',
      '',
      'Bạn là mô hình RAG nội bộ Local AI với khả năng phân tích yêu cầu, truy vấn cơ sở dữ liệu (Data Warehouse) và tổng hợp kết quả.'
    ]);
    const stepModelId = stepModelRes.lastID;

    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, 'day', 10000, 10000000, 2000000)`, [adminGroup.id, stepModelId]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, 'day', 1000, 1000000, 200000)`, [userGroup.id, stepModelId]);
  }
}
