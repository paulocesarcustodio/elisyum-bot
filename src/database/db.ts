import { db } from './client.js'
export { db } from './client.js'

export const contactsDb = {
  // Salvar/atualizar contato
  upsert: async (contact: {
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
        name = COALESCE(excluded.name, contacts.name),
        notify = COALESCE(excluded.notify, contacts.notify),
        verified_name = COALESCE(excluded.verified_name, contacts.verified_name),
        phone_number = COALESCE(excluded.phone_number, contacts.phone_number),
        lid = COALESCE(excluded.lid, contacts.lid),
        avatar_url = CASE
          WHEN excluded.avatar_url = '' THEN NULL
          WHEN excluded.avatar_url IS NOT NULL THEN excluded.avatar_url
          ELSE contacts.avatar_url
        END,
        updated_at = CURRENT_TIMESTAMP
    `);

    await stmt.run(
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
  get: async (jid: string) => {
    const stmt = db.prepare(`
      SELECT * FROM contacts
      WHERE jid = ? OR lid = ? OR phone_number = ?
        OR REPLACE(jid, '@s.whatsapp.net', '') = ?
        OR REPLACE(phone_number, '@s.whatsapp.net', '') = ?
    `);
    return await stmt.get(jid, jid, jid, jid, jid) as {
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
  getAll: async () => {
    const stmt = db.prepare('SELECT * FROM contacts ORDER BY updated_at DESC');
    return await stmt.all() as Array<{
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
  count: async () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM contacts');
    const result = await stmt.get() as { count: number };
    return result.count;
  },

  // Verificar se precisa atualizar (mais de 7 dias)
  needsUpdate: async (jid: string): Promise<boolean> => {
    const stmt = db.prepare(`
      SELECT * FROM contacts
      WHERE (jid = ? OR lid = ? OR phone_number = ?)
      AND updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
    `);
    const contact = await stmt.get(jid, jid, jid);
    return !contact;
  }
};

// ============================================
// FUNÇÕES PARA LOGS DE COMANDOS
// ============================================
export const logsDb = {
  // Salvar log de comando
  log: async (data: {
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

    await stmt.run(
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
  getUserLogs: async (userJid: string, limit: number = 50) => {
    const stmt = db.prepare(`
      SELECT * FROM command_logs
      WHERE user_jid = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return await stmt.all(userJid, limit);
  },

  // Buscar logs recentes
  getRecent: async (limit: number = 100) => {
    const stmt = db.prepare(`
      SELECT * FROM command_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return await stmt.all(limit);
  },

  // Estatísticas de comandos mais usados
  getTopCommands: async (limit: number = 10) => {
    const stmt = db.prepare(`
      SELECT command, COUNT(*) as count,
             SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
             SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
      FROM command_logs
      GROUP BY command
      ORDER BY count DESC
      LIMIT ?
    `);
    return await stmt.all(limit) as Array<{
      command: string;
      count: number;
      success_count: number;
      error_count: number;
    }>;
  },

  // Contar total de comandos
  count: async () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM command_logs');
    const result = await stmt.get() as { count: number };
    return result.count;
  },

  // Contar comandos nas últimas 24h
  countLast24h: async () => {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM command_logs
      WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `);
    const result = await stmt.get() as { count: number };
    return result.count;
  }
};

// ============================================
// FUNÇÕES PARA ÁUDIOS SALVOS
// ============================================
export const audiosDb = {
  // Salvar áudio (global)
  save: async (data: {
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
      `);

      await stmt.run(
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
  get: async (audioName: string) => {
    const stmt = db.prepare(`
      SELECT * FROM saved_audios
      WHERE audio_name = ?
    `);
    return await stmt.get(audioName.toLowerCase()) as {
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
  getAllAudios: async (limit: number = 50, offset: number = 0) => {
    const stmt = db.prepare(`
      SELECT audio_name, seconds, created_at, owner_jid
      FROM saved_audios
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    return await stmt.all(limit, offset) as Array<{
      audio_name: string;
      seconds: number | null;
      created_at: string;
      owner_jid: string;
    }>;
  },

  // Contar total de áudios (global)
  count: async () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM saved_audios');
    const result = await stmt.get() as { count: number };
    return result.count;
  },

  // Deletar áudio (global - verifica dono)
  delete: async (audioName: string, requesterId?: string) => {
    const audio = await audiosDb.get(audioName);
    if (audio) {
      // Se requesterId for fornecido, verifica se é o dono
      if (requesterId && audio.owner_jid !== requesterId) {
        throw new Error('Apenas o dono pode deletar este áudio');
      }

    }
    const stmt = db.prepare('DELETE FROM saved_audios WHERE audio_name = ? AND (?::text IS NULL OR owner_jid = ?)');
    await stmt.run(audioName.toLowerCase(), requesterId || null, requesterId || null);
    console.log(`[DB] Áudio deletado globalmente: "${audioName}"`);
  },

  // Renomear áudio (global - verifica dono)
  rename: async (oldName: string, newName: string, requesterId?: string) => {
    const audio = await audiosDb.get(oldName);
    if (audio && requesterId && audio.owner_jid !== requesterId) {
      throw new Error('Apenas o dono pode renomear este áudio');
    }

    const stmt = db.prepare(`
      UPDATE saved_audios
      SET audio_name = ?
      WHERE audio_name = ? AND (?::text IS NULL OR owner_jid = ?)
    `);
    await stmt.run(newName.toLowerCase(), oldName.toLowerCase(), requesterId || null, requesterId || null);
    console.log(`[DB] Áudio renomeado globalmente: "${oldName}" -> "${newName}"`);
  }
};

// ============================================
// FUNÇÕES PARA CACHE DE ASK
// ============================================
export const askCacheDb = {
  // Buscar resposta em cache
  get: async (questionHash: string, userType: string) => {
    const stmt = db.prepare(`
      SELECT * FROM ask_cache
      WHERE question_hash = ? AND user_type = ?
    `);
    const result = await stmt.get(questionHash, userType) as {
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
        SET hit_count = ask_cache.hit_count + 1,
            last_used_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      await updateStmt.run(result.id);
      result.hit_count += 1; // Atualiza objeto retornado
    }

    return result;
  },

  // Salvar resposta no cache
  set: async (questionHash: string, question: string, answer: string, userType: string) => {
    const stmt = db.prepare(`
      INSERT INTO ask_cache
      (question_hash, question, answer, user_type, hit_count, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(question_hash, user_type) DO UPDATE SET
        answer = excluded.answer,
        hit_count = ask_cache.hit_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `);
    await stmt.run(questionHash, question, answer, userType);
  },

  // Limpar cache antigo (mais de 30 dias sem uso)
  cleanOld: async () => {
    const countBefore = await db.prepare('SELECT COUNT(*) as count FROM ask_cache').get() as { count: number };
    const stmt = db.prepare(`
      DELETE FROM ask_cache
      WHERE last_used_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
    `);
    await stmt.run();
    const countAfter = await db.prepare('SELECT COUNT(*) as count FROM ask_cache').get() as { count: number };
    const changes = countBefore.count - countAfter.count;
    if (changes > 0) {
      console.log(`[ASK-CACHE] 🧹 Limpou ${changes} entradas antigas (>30 dias)`);
    }
    return changes;
  },

  // Manter apenas as 500 perguntas mais acessadas
  enforceLimit: async (limit: number = 500) => {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ask_cache');
    const { count } = await countStmt.get() as { count: number };

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
      await stmt.run(limit);
      const countAfter = await db.prepare('SELECT COUNT(*) as count FROM ask_cache').get() as { count: number };
      const changes = countBefore - countAfter.count;
      console.log(`[ASK-CACHE] 🎯 Manteve top ${limit} perguntas, removeu ${changes} entradas`);
      return changes;
    }

    return 0;
  },

  // Estatísticas do cache
  stats: async () => {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ask_cache');
    const { count } = await countStmt.get() as { count: number };

    const topStmt = db.prepare(`
      SELECT question, hit_count, user_type, last_used_at
      FROM ask_cache
      ORDER BY hit_count DESC
      LIMIT 10
    `);
    const topQuestions = await topStmt.all() as Array<{
      question: string;
      hit_count: number;
      user_type: string;
      last_used_at: string;
    }>;

    return { total: count, topQuestions };
  },

  // Contar entradas
  count: async () => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM ask_cache');
    const result = await stmt.get() as { count: number };
    return result.count;
  }
};


export default db;
