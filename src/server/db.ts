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
      const distWasm = path.resolve(__dirname, file);
      if (fs.existsSync(distWasm)) return distWasm;
      const nodeWasm = path.resolve(__dirname, '../node_modules/sql.js/dist', file);
      if (fs.existsSync(nodeWasm)) return nodeWasm;
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
        tokens_used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await seedDefaults();
    console.log('[Database] WebAssembly SQLite schema initialization & seed complete.');
  } catch (err) {
    console.error('[Database] Schema initialization failed:', err);
  }
}

async function seedDefaults() {
  const existingGroups = await query(`SELECT COUNT(*) as count FROM user_groups`);
  let execGroupId = 1;
  let rdGroupId = 2;
  let generalGroupId = 3;

  if (existingGroups[0].count === 0) {
    const res1 = await run(`INSERT INTO user_groups (name, description) VALUES (?, ?)`, [
      'Ban Giám Đốc (Executive)',
      'Quyền hạn tối đa, truy cập tất cả các mô hình cao cấp với hạn ngạch token lớn.'
    ]);
    execGroupId = res1.lastID;

    const res2 = await run(`INSERT INTO user_groups (name, description) VALUES (?, ?)`, [
      'Phòng R&D & Tech',
      'Truy cập GPT-4o, DeepSeek và Gemini để nghiên cứu và phát triển phần mềm.'
    ]);
    rdGroupId = res2.lastID;

    const res3 = await run(`INSERT INTO user_groups (name, description) VALUES (?, ?)`, [
      'Nhân Viên General',
      'Nhóm người dùng phổ thông, truy cập các mô hình gọn nhẹ GPT-4o Mini & Gemini Flash.'
    ]);
    generalGroupId = res3.lastID;
  } else {
    const groups = await query(`SELECT id, name FROM user_groups`);
    const exec = groups.find((g: any) => g.name.includes('Giám Đốc'));
    const rd = groups.find((g: any) => g.name.includes('R&D'));
    const gen = groups.find((g: any) => g.name.includes('General'));
    if (exec) execGroupId = exec.id;
    if (rd) rdGroupId = rd.id;
    if (gen) generalGroupId = gen.id;
  }

  const existingUsers = await query(`SELECT COUNT(*) as count FROM users`);
  if (existingUsers[0].count === 0) {
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@nexusai.io';
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const hashedAdminPass = await bcrypt.hash(adminPassword, 10);
    const hashedUserPass = await bcrypt.hash('user123', 10);

    await run(`
      INSERT INTO users (name, email, password_hash, role, user_group_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['System Admin', adminEmail, hashedAdminPass, 'admin', execGroupId, 'active']);

    await run(`
      INSERT INTO users (name, email, password_hash, role, user_group_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['Trần Văn R&D', 'tech_lead@nexusai.io', hashedUserPass, 'user', rdGroupId, 'active']);

    await run(`
      INSERT INTO users (name, email, password_hash, role, user_group_id, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['Nguyễn Văn Nhân Viên', 'staff@nexusai.io', hashedUserPass, 'user', generalGroupId, 'active']);
  }

  const existingModels = await query(`SELECT COUNT(*) as count FROM ai_models`);
  if (existingModels[0].count === 0) {
    const geminiRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [
      'Gemini 3.8 Flash (Tích hợp)',
      'gemini',
      'gemini-3.8-flash',
      '',
      '',
      'Bạn là trợ lý AI thông minh NexusAI, hỗ trợ người dùng giải quyết công việc chuyên nghiệp, chu đáo bằng Tiếng Việt.'
    ]);
    const geminiModelId = geminiRes.lastID;

    const gpt4oRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [
      'ChatGPT GPT-4o (OpenAI Compatible)',
      'openai_compatible',
      'gpt-4o',
      'https://api.openai.com/v1',
      '',
      'Bạn là trợ lý AI cao cấp GPT-4o. Phân tích chi tiết và phản hồi chuẩn xác bằng Markdown.'
    ]);
    const gpt4oModelId = gpt4oRes.lastID;

    const gpt4oMiniRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [
      'ChatGPT GPT-4o Mini',
      'openai_compatible',
      'gpt-4o-mini',
      'https://api.openai.com/v1',
      '',
      'Bạn là trợ lý gọn nhẹ GPT-4o Mini, phản hồi nhanh chóng và ngắn gọn.'
    ]);
    const gpt4oMiniModelId = gpt4oMiniRes.lastID;

    const deepseekRes = await run(`
      INSERT INTO ai_models (name, provider, model_identifier, api_url, api_token, system_prompt, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [
      'DeepSeek Chat (OpenAI Format)',
      'openai_compatible',
      'deepseek-chat',
      'https://api.deepseek.com/v1',
      '',
      'Bạn là mô hình suy luận chuyên sâu DeepSeek Chat. Hãy tập trung giải quyết bài toán lập trình và logic.'
    ]);
    const deepseekModelId = deepseekRes.lastID;

    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [execGroupId, geminiModelId, 'day', 5000, 2000000, 500000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [execGroupId, gpt4oModelId, 'day', 5000, 2000000, 500000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [execGroupId, gpt4oMiniModelId, 'day', 10000, 5000000, 1000000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [execGroupId, deepseekModelId, 'day', 5000, 2000000, 500000]);

    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [rdGroupId, geminiModelId, 'day', 500, 500000, 100000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [rdGroupId, deepseekModelId, 'day', 500, 500000, 100000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [rdGroupId, gpt4oModelId, 'day', 200, 200000, 50000]);

    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [generalGroupId, geminiModelId, 'day', 200, 200000, 30000]);
    await run(`INSERT INTO group_model_access (group_id, model_id, rate_limit_period, rate_limit_requests, max_tokens_group, max_tokens_per_user) VALUES (?, ?, ?, ?, ?, ?)`, [generalGroupId, gpt4oMiniModelId, 'day', 100, 100000, 20000]);
  }
}
