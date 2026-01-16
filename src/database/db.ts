import { Database } from 'bun:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.join(process.cwd(), 'storage');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'bot.db');
export const db = new Database(dbPath);

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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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

// Índices para performance
db.run('CREATE INDEX IF NOT EXISTS idx_contacts_updated ON contacts(updated_at)');
db.run('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON command_logs(timestamp)');
db.run('CREATE INDEX IF NOT EXISTS idx_logs_user ON command_logs(user_jid)');
db.run('CREATE INDEX IF NOT EXISTS idx_logs_command ON command_logs(command)');
db.run('CREATE INDEX IF NOT EXISTS idx_audios_owner ON saved_audios(owner_jid)');
db.run('CREATE INDEX IF NOT EXISTS idx_audios_name ON saved_audios(audio_name)');

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
  }) => {
    const stmt = db.prepare(`
      INSERT INTO contacts (jid, name, notify, verified_name, phone_number, lid, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(jid) DO UPDATE SET 
        name = COALESCE(excluded.name, name),
        notify = COALESCE(excluded.notify, notify),
        verified_name = COALESCE(excluded.verified_name, verified_name),
        phone_number = COALESCE(excluded.phone_number, phone_number),
        lid = COALESCE(excluded.lid, lid),
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      contact.jid,
      contact.name || null,
      contact.notify || null,
      contact.verifiedName || null,
      contact.phoneNumber || null,
      contact.lid || null
    );
    
    console.log(`[DB] Contato salvo: ${contact.notify || contact.name || contact.jid}`);
  },

  // Buscar contato do cache
  get: (jid: string) => {
    const stmt = db.prepare('SELECT * FROM contacts WHERE jid = ? OR lid = ? OR phone_number = ?');
    return stmt.get(jid, jid, jid) as {
      jid: string;
      name: string | null;
      notify: string | null;
      verified_name: string | null;
      phone_number: string | null;
      lid: string | null;
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

console.log('[DB] 🗄️ Banco de dados SQLite inicializado:', dbPath);

export default db;
