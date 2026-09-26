import { Database } from 'bun:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(process.cwd(), 'storage');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bot.db');
export const db = new Database(dbPath);
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA busy_timeout = 5000');

// ============================================
// TABELA DE CONTATOS (substitui NodeCache)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    name TEXT,
    notify TEXT,
    verified_name TEXT,
    phone_number TEXT,
    lid TEXT,
    avatar_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const contactColumns = db.prepare('PRAGMA table_info(contacts)').all() as Array<{ name: string }>;
if (!contactColumns.some(column => column.name === 'avatar_url')) {
  db.run('ALTER TABLE contacts ADD COLUMN avatar_url TEXT');
}

// ============================================
// TABELA DE LOGS DE COMANDOS
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS command_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    user_name TEXT,
    command TEXT NOT NULL,
    args TEXT,
    chat_id TEXT,
    is_group BOOLEAN DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT 1,
    error_message TEXT
  )
`);

// ============================================
// TABELA DE ÁUDIOS SALVOS (GLOBAIS)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS saved_audios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_jid TEXT NOT NULL,
    audio_name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    seconds INTEGER,
    ptt BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// MIGRAÇÃO: Adicionar coluna owner_jid se não existir (para bancos antigos)
try {
  const columns = db.prepare("PRAGMA table_info(saved_audios)").all() as Array<{ name: string }>;
  const hasOwnerJid = columns.some(col => col.name === 'owner_jid');
  
  if (!hasOwnerJid) {
    console.log('[DB] 🔧 Migrando tabela saved_audios: adicionando coluna owner_jid...');
    db.run('ALTER TABLE saved_audios ADD COLUMN owner_jid TEXT NOT NULL DEFAULT ""');
    console.log('[DB] ✅ Migração concluída');
  }
} catch (err) {
  console.log('[DB] ⚠️ Erro na migração:', err);
}

// MIGRAÇÃO: Garantir que audio_name tem constraint UNIQUE
try {
  // Verifica se a constraint UNIQUE existe
  const indexes = db.prepare("PRAGMA index_list(saved_audios)").all() as Array<{ name: string; unique: number }>;
  const hasUniqueConstraint = indexes.some(idx => idx.unique === 1 && idx.name.includes('audio_name'));
  
  if (!hasUniqueConstraint) {
    console.log('[DB] 🔧 Migrando tabela saved_audios: adicionando constraint UNIQUE em audio_name...');
    
    // SQLite não permite adicionar constraints, então precisamos recriar a tabela
    db.run('BEGIN TRANSACTION');
    
    // Criar tabela temporária com a estrutura correta
    db.run(`
      CREATE TABLE saved_audios_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_jid TEXT NOT NULL,
        audio_name TEXT NOT NULL UNIQUE,
        file_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        seconds INTEGER,
        ptt BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Copiar dados da tabela antiga (removendo duplicatas, mantendo o mais recente)
    db.run(`
      INSERT INTO saved_audios_new 
      SELECT id, owner_jid, audio_name, file_path, mime_type, seconds, ptt, created_at
      FROM saved_audios
      WHERE id IN (
        SELECT MAX(id) 
        FROM saved_audios 
        GROUP BY audio_name
      )
    `);
    
    // Remover tabela antiga e renomear a nova
    db.run('DROP TABLE saved_audios');
    db.run('ALTER TABLE saved_audios_new RENAME TO saved_audios');
    
    db.run('COMMIT');
    console.log('[DB] ✅ Migração da constraint UNIQUE concluída');
  }
} catch (err) {
  db.run('ROLLBACK');
  console.log('[DB] ⚠️ Erro na migração da constraint UNIQUE:', err);
}

// ============================================
// TABELA DE CACHE DE PERGUNTAS (ASK)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS ask_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_hash TEXT NOT NULL UNIQUE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    user_type TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Índices para performance
db.run('CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at)');
db.run('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON command_logs(timestamp)');
db.run('CREATE INDEX IF NOT EXISTS idx_logs_user ON command_logs(user_jid)');
db.run('CREATE INDEX IF NOT EXISTS idx_logs_command ON command_logs(command)');
db.run('CREATE INDEX IF NOT EXISTS idx_audios_owner ON saved_audios(owner_jid)');
db.run('CREATE INDEX IF NOT EXISTS idx_audios_name ON saved_audios(audio_name)');
db.run('CREATE INDEX IF NOT EXISTS idx_ask_hash ON ask_cache(question_hash)');
db.run('CREATE INDEX IF NOT EXISTS idx_ask_last_used ON ask_cache(last_used_at)');
db.run('CREATE INDEX IF NOT EXISTS idx_ask_user_type ON ask_cache(user_type)');
db.run('CREATE INDEX IF NOT EXISTS idx_ask_hit_count ON ask_cache(hit_count)');

// ============================================
// FUNÇÕES PARA CONTATOS
// ============================================
export const contactsDb = {
  // Salvar/atualizar contato
  upsert: (contact: {
    jid: string;
    name?: string;
    notify?: string;
    verifiedName?: string;
    phoneNumber?: string;
    lid?: string;
    imgUrl?: string | null;
  }) => {
    const stmt = db.prepare(`
      INSERT INTO contacts (jid, name, notify, verified_name, phone_number, lid, avatar_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(jid) DO UPDATE SET 
        name = COALESCE(excluded.name, name),
        notify = COALESCE(excluded.notify, notify),
        verified_name = COALESCE(excluded.verified_name, verified_name),
        phone_number = COALESCE(excluded.phone_number, phone_number),
        lid = COALESCE(excluded.lid, lid),
        avatar_url = CASE
          WHEN excluded.avatar_url = '' THEN NULL
          WHEN excluded.avatar_url IS NOT NULL THEN excluded.avatar_url
          ELSE avatar_url
        END,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      contact.jid,
      contact.name || null,
      contact.notify || null,
      contact.verifiedName || null,
      contact.phoneNumber || null,
      contact.lid || null,
      contact.imgUrl === 'removed' ? '' : contact.imgUrl && /^https?:\/\//i.test(contact.imgUrl) ? contact.imgUrl : null
    );
    
    console.log(`[DB] Contato salvo: ${contact.notify || contact.name || contact.jid}`);
  },

  // Buscar contato do cache
  get: (jid: string) => {
    const stmt = db.prepare(`
      SELECT * FROM contacts
      WHERE jid = ? OR lid = ? OR phone_number = ?
        OR REPLACE(jid, '@s.whatsapp.net', '') = ?
        OR REPLACE(phone_number, '@s.whatsapp.net', '') = ?
    `);
    return stmt.get(jid, jid, jid, jid, jid) as {
      jid: string;
      name: string | null;
      notify: string | null;
      verified_name: string | null;
      phone_number: string | null;
      lid: string | null;
      avatar_url: string | null;
      updated_at: string;
    } | undefined;
  },

  // Listar todos os contatos
  getAll: () => {
    const stmt = db.prepare('SELECT * FROM contacts ORDER BY updated_at DESC');
    return stmt.all() as Array<{
      jid: string;
      name: string | null;
      notify: string | null;
      verified_name: string | null;
      phone_number: string | null;
      lid: string | null;
      avatar_url: string | null;
      updated_at: string;
    }>;
  },

  // Contar contatos
  count: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM contacts');
    const result = stmt.get() as { count: number };
    return result.count;
  },

  // Verificar se precisa atualizar (mais de 7 dias)
  needsUpdate: (jid: string): boolean => {
    const stmt = db.prepare(`
      SELECT * FROM contacts 
      WHERE (jid = ? OR lid = ? OR phone_number = ?)
      AND updated_at > datetime('now', '-7 days')
    `);
    const contact = stmt.get(jid, jid, jid);
    return !contact;
  }
};

// ============================================
// FUNÇÕES PARA LOGS DE COMANDOS
// ============================================
export const logsDb = {
  // Salvar log de comando
  log: (data: {
    userJid: string;
    userName?: string;
    command: string;
    args?: string;
    chatId?: string;
    isGroup?: boolean;
    success?: boolean;
    error?: string;
  }) => {
    const stmt = db.prepare(`
      INSERT INTO command_logs (user_jid, user_name, command, args, chat_id, is_group, success, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      data.userJid,
      data.userName || null,
      data.command,
      data.args || null,
      data.chatId || null,
      data.isGroup ? 1 : 0,
      data.success !== false ? 1 : 0,
      data.error || null
    );
  },

  // Buscar logs de um usuário
  getUserLogs: (userJid: string, limit: number = 50) => {
    const stmt = db.prepare(`
      SELECT * FROM command_logs 
      WHERE user_jid = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(userJid, limit);
  },

  // Buscar logs recentes
  getRecent: (limit: number = 100) => {
    const stmt = db.prepare(`
      SELECT * FROM command_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  },

  // Estatísticas de comandos mais usados
  getTopCommands: (limit: number = 10) => {
    const stmt = db.prepare(`
      SELECT command, COUNT(*) as count, 
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
             SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
      FROM command_logs 
      GROUP BY command 
      ORDER BY count DESC 
      LIMIT ?
    `);
    return stmt.all(limit) as Array<{
      command: string;
      count: number;
      success_count: number;
      error_count: number;
    }>;
  },

  // Contar total de comandos
  count: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM command_logs');
    const result = stmt.get() as { count: number };
    return result.count;
  },

  // Contar comandos nas últimas 24h
  countLast24h: () => {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM command_logs 
      WHERE timestamp > datetime('now', '-24 hours')
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }
};

// ============================================
// FUNÇÕES PARA ÁUDIOS SALVOS
// ============================================
export const audiosDb = {
  // Salvar áudio (global)
  save: (data: {
    ownerJid: string;
    audioName: string;
    filePath: string;
    mimeType: string;
    seconds?: number;
    ptt?: boolean;
  }) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO saved_audios 
        (owner_jid, audio_name, file_path, mime_type, seconds, ptt)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(audio_name) DO UPDATE SET 
          file_path = excluded.file_path,
          mime_type = excluded.mime_type,
          seconds = excluded.seconds,
          ptt = excluded.ptt,
          owner_jid = excluded.owner_jid,
          created_at = CURRENT_TIMESTAMP
      `);
      
      stmt.run(
        data.ownerJid,
        data.audioName.toLowerCase(),
        data.filePath,
        data.mimeType,
        data.seconds || null,
        data.ptt ? 1 : 0
      );
      
      console.log(`[DB] Áudio salvo globalmente: "${data.audioName}" por ${data.ownerJid}`);
    } catch (error: any) {
      console.error('[DB] Erro ao salvar áudio:', error);
      if (error.message?.includes('ON CONFLICT') || error.message?.includes('UNIQUE constraint')) {
        throw new Error('Erro no banco de dados: constraint UNIQUE ausente. Execute a migração do banco.');
      }
      throw error;
    }
  },

  // Buscar áudio por nome (global)
  get: (audioName: string) => {
    const stmt = db.prepare(`
      SELECT * FROM saved_audios 
      WHERE audio_name = ?
    `);
    return stmt.get(audioName.toLowerCase()) as {
      id: number;
      owner_jid: string;
      audio_name: string;
      file_path: string;
      mime_type: string;
      seconds: number | null;
      ptt: number;
      created_at: string;
    } | undefined;
  },

  // Listar todos os áudios (global)
  getAllAudios: (limit: number = 50, offset: number = 0) => {
    const stmt = db.prepare(`
      SELECT audio_name, seconds, created_at, owner_jid 
      FROM saved_audios 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as Array<{
      audio_name: string;
      seconds: number | null;
      created_at: string;
      owner_jid: string;
    }>;
  },

  // Contar total de áudios (global)
  count: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM saved_audios');
    const result = stmt.get() as { count: number };
    return result.count;
  },

  // Deletar áudio (global - verifica dono)
  delete: (audioName: string, requesterId?: string) => {
    const audio = audiosDb.get(audioName);
    if (audio) {
      // Se requesterId for fornecido, verifica se é o dono
      if (requesterId && audio.owner_jid !== requesterId) {
        throw new Error('Apenas o dono pode deletar este áudio');
      }
      
      // Remove arquivo físico
      try {
        const fs = require('fs');
        if (fs.existsSync(audio.file_path)) {
          fs.unlinkSync(audio.file_path);
        }
      } catch (err) {
        console.error(`[DB] Erro ao deletar arquivo: ${err}`);
      }
    }
    
    const stmt = db.prepare('DELETE FROM saved_audios WHERE audio_name = ?');
    stmt.run(audioName.toLowerCase());
    console.log(`[DB] Áudio deletado globalmente: "${audioName}"`);
  },

  // Renomear áudio (global - verifica dono)
  rename: (oldName: string, newName: string, requesterId?: string) => {
    const audio = audiosDb.get(oldName);
    if (audio && requesterId && audio.owner_jid !== requesterId) {
      throw new Error('Apenas o dono pode renomear este áudio');
    }
    
    const stmt = db.prepare(`
      UPDATE saved_audios 
      SET audio_name = ? 
      WHERE audio_name = ?
    `);
    stmt.run(newName.toLowerCase(), oldName.toLowerCase());
    console.log(`[DB] Áudio renomeado globalmente: "${oldName}" -> "${newName}"`);
  }
};

// ============================================
// FUNÇÕES PARA CACHE DE ASK
// ============================================
export const askCacheDb = {
  // Buscar resposta em cache
  get: (questionHash: string, userType: string) => {
    const stmt = db.prepare(`
      SELECT * FROM ask_cache 
      WHERE question_hash = ? AND user_type = ?
    `);
    const result = stmt.get(questionHash, userType) as {
      id: number;
      question_hash: string;
      question: string;
      answer: string;
      user_type: string;
      hit_count: number;
      created_at: string;
      last_used_at: string;
    } | undefined;
    
    // Se encontrou, incrementa hit_count e atualiza last_used_at
    if (result) {
      const updateStmt = db.prepare(`
        UPDATE ask_cache 
        SET hit_count = hit_count + 1, 
            last_used_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      updateStmt.run(result.id);
      result.hit_count += 1; // Atualiza objeto retornado
    }
    
    return result;
  },

  // Salvar resposta no cache
  set: (questionHash: string, question: string, answer: string, userType: string) => {
    const stmt = db.prepare(`
      INSERT INTO ask_cache 
      (question_hash, question, answer, user_type, hit_count, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(question_hash) DO UPDATE SET 
        answer = excluded.answer,
        hit_count = hit_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `);
    stmt.run(questionHash, question, answer, userType);
  },

  // Limpar cache antigo (mais de 30 dias sem uso)
  cleanOld: () => {
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM ask_cache').get() as { count: number };
    const stmt = db.prepare(`
      DELETE FROM ask_cache 
      WHERE last_used_at < datetime('now', '-30 days')
    `);
    stmt.run();
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM ask_cache').get() as { count: number };
    const changes = countBefore.count - countAfter.count;
    if (changes > 0) {
      console.log(`[ASK-CACHE] 🧹 Limpou ${changes} entradas antigas (>30 dias)`);
    }
    return changes;
  },

  // Manter apenas as 500 perguntas mais acessadas
  enforceLimit: (limit: number = 500) => {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ask_cache');
    const { count } = countStmt.get() as { count: number };
    
    if (count > limit) {
      const countBefore = count;
      const stmt = db.prepare(`
        DELETE FROM ask_cache 
        WHERE id NOT IN (
          SELECT id FROM ask_cache 
          ORDER BY hit_count DESC, last_used_at DESC 
          LIMIT ?
        )
      `);
      stmt.run(limit);
      const countAfter = db.prepare('SELECT COUNT(*) as count FROM ask_cache').get() as { count: number };
      const changes = countBefore - countAfter.count;
      console.log(`[ASK-CACHE] 🎯 Manteve top ${limit} perguntas, removeu ${changes} entradas`);
      return changes;
    }
    
    return 0;
  },

  // Estatísticas do cache
  stats: () => {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ask_cache');
    const { count } = countStmt.get() as { count: number };
    
    const topStmt = db.prepare(`
      SELECT question, hit_count, user_type, last_used_at 
      FROM ask_cache 
      ORDER BY hit_count DESC 
      LIMIT 10
    `);
    const topQuestions = topStmt.all() as Array<{
      question: string;
      hit_count: number;
      user_type: string;
      last_used_at: string;
    }>;
    
    return { total: count, topQuestions };
  },

  // Contar entradas
  count: () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM ask_cache');
    const result = stmt.get() as { count: number };
    return result.count;
  }
};

// ============================================
// TABELAS PARA USUÁRIOS (migração NeDB → SQLite)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    commands INTEGER DEFAULT 0,
    received_welcome INTEGER DEFAULT 0,
    owner INTEGER DEFAULT 0,
    command_rate_limited INTEGER DEFAULT 0,
    command_rate_expire_limited INTEGER DEFAULT 0,
    command_rate_cmds INTEGER DEFAULT 1,
    command_rate_expire_cmds INTEGER DEFAULT 0,
    help_level TEXT DEFAULT 'detailed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ============================================
// TABELAS PARA GRUPOS (migração NeDB → SQLite)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS groups_data (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    description TEXT,
    commands_executed INTEGER DEFAULT 0,
    owner TEXT,
    restricted INTEGER DEFAULT 0,
    expiration INTEGER,
    muted INTEGER DEFAULT 0,
    muted_members TEXT DEFAULT '[]',
    welcome_status INTEGER DEFAULT 0,
    welcome_msg TEXT DEFAULT '',
    antifake_status INTEGER DEFAULT 0,
    antifake_exceptions TEXT DEFAULT '{"prefixes":["55"],"numbers":[]}',
    antilink_status INTEGER DEFAULT 0,
    antilink_exceptions TEXT DEFAULT '[]',
    antiflood_status INTEGER DEFAULT 0,
    antiflood_max_messages INTEGER DEFAULT 10,
    antiflood_interval INTEGER DEFAULT 10,
    auto_reply_status INTEGER DEFAULT 0,
    auto_reply_config TEXT DEFAULT '[]',
    autosticker INTEGER DEFAULT 0,
    block_cmds TEXT DEFAULT '[]',
    blacklist TEXT DEFAULT '[]',
    word_filter TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// ============================================
// TABELAS PARA PARTICIPANTES (migração NeDB → SQLite)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS participants (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    registered_since TEXT,
    commands INTEGER DEFAULT 0,
    admin INTEGER DEFAULT 0,
    msgs INTEGER DEFAULT 0,
    image INTEGER DEFAULT 0,
    audio INTEGER DEFAULT 0,
    sticker INTEGER DEFAULT 0,
    video INTEGER DEFAULT 0,
    text_count INTEGER DEFAULT 0,
    other INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,
    antiflood_expire INTEGER DEFAULT 0,
    antiflood_msgs INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id)
  )
`);

// ============================================
// TABELA PARA SESSION STORE (migração NeDB → SQLite)
// ============================================
db.run(`
  CREATE TABLE IF NOT EXISTS session_store (
    key TEXT PRIMARY KEY,
    data TEXT
  )
`);

// ============================================
// ÍNDICES
// ============================================
db.run('CREATE INDEX IF NOT EXISTS idx_participants_group ON participants(group_id)');
db.run('CREATE INDEX IF NOT EXISTS idx_participants_admin ON participants(group_id, admin)');

console.log('[DB] 🗄️ Banco de dados SQLite inicializado:', dbPath);

export default db;
