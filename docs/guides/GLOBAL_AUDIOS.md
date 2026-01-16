# Sistema de Áudios Global

## 📋 Resumo das Mudanças

O sistema de áudios foi **completamente reformulado** para funcionar de forma **global e compartilhada**:

### ✅ Antes (Sistema Privado)
- Cada usuário tinha sua própria coleção de áudios
- Áudios eram privados e isolados por usuário
- Usuário A não podia acessar áudios do Usuário B
- Nomes de áudios podiam se repetir entre usuários

### 🌐 Agora (Sistema Global)
- **Todos os áudios são compartilhados** entre todos os usuários
- Qualquer pessoa pode reproduzir qualquer áudio salvo
- Nomes de áudios são únicos globalmente (não podem repetir)
- Sistema de permissões: apenas o criador pode editar/deletar seus áudios

---

## 🔄 Mudanças Técnicas

### Banco de Dados
```sql
-- ANTES
CREATE TABLE saved_audios (
  user_jid TEXT NOT NULL,
  audio_name TEXT NOT NULL,
  UNIQUE(user_jid, audio_name)  -- Nome único por usuário
)

-- AGORA
CREATE TABLE saved_audios (
  owner_jid TEXT NOT NULL,       -- Dono do áudio
  audio_name TEXT NOT NULL UNIQUE, -- Nome único globalmente
  ...
)
```

### Funções Modificadas

#### `audiosDb.save()`
- **Antes**: `audiosDb.save({ userJid, audioName, ... })`
- **Agora**: `audiosDb.save({ ownerJid, audioName, ... })`
- **Comportamento**: Verifica se o nome já existe globalmente antes de salvar

#### `audiosDb.get()`
- **Antes**: `audiosDb.get(userJid, audioName)` - busca por usuário
- **Agora**: `audiosDb.get(audioName)` - busca global

#### `audiosDb.getAllAudios()`
- **Antes**: `audiosDb.getUserAudios(userJid, limit, offset)` - lista de um usuário
- **Agora**: `audiosDb.getAllAudios(limit, offset)` - lista global

#### `audiosDb.count()`
- **Antes**: `audiosDb.count(userJid)` - contagem por usuário
- **Agora**: `audiosDb.count()` - contagem global

#### `audiosDb.delete()`
- **Antes**: `audiosDb.delete(userJid, audioName)` - deleta qualquer áudio do usuário
- **Agora**: `audiosDb.delete(audioName, requesterId)` - **verifica se é o dono**

#### `audiosDb.rename()`
- **Antes**: `audiosDb.rename(userJid, oldName, newName)` - renomeia qualquer áudio do usuário
- **Agora**: `audiosDb.rename(oldName, newName, requesterId)` - **verifica se é o dono**

---

## 🎮 Comandos Atualizados

### `!save nome-do-audio`
**Comportamento novo**:
- Verifica se já existe um áudio com esse nome globalmente
- Se existir, retorna erro: "Já existe um áudio com o nome..."
- Se não existir, salva o áudio e marca você como dono

**Mensagens**:
- ✅ Sucesso: "💾 Áudio salvo com sucesso! Nome: **nome**"
- ❌ Erro: "Já existe um áudio com o nome **nome**. Escolha outro nome!"

### `!audio nome-do-audio`
**Comportamento novo**:
- Busca em TODOS os áudios salvos (não apenas seus)
- Qualquer pessoa pode reproduzir qualquer áudio
- Usa busca fuzzy se não encontrar match exato

**Mensagens**:
- ❌ Erro: "Áudio não encontrado. Use **!audios** para ver todos os áudios disponíveis."

### `!audios [página]`
**Comportamento novo**:
- Lista TODOS os áudios disponíveis no bot
- Não mostra mais apenas "seus áudios"
- Mostra 20 áudios por página

**Mensagens**:
- Título: "🎵 **Áudios disponíveis**" (antes era "Seus áudios salvos")
- Vazio: "Ainda não há nenhum áudio salvo." (antes era "Você ainda não salvou...")

### `!delete nome-do-audio`
**Comportamento novo**:
- **VERIFICA SE VOCÊ É O DONO** antes de deletar
- Se não for o dono, retorna erro
- Apenas o criador pode deletar

**Mensagens**:
- ✅ Sucesso: "🗑️ Áudio deletado! O áudio **nome** foi removido permanentemente."
- ❌ Erro: "Você não pode deletar este áudio! Apenas o criador pode deletá-lo."

### `!rename nome-antigo | nome-novo`
**Comportamento novo**:
- **VERIFICA SE VOCÊ É O DONO** antes de renomear
- Verifica se o novo nome já existe globalmente
- Apenas o criador pode renomear

**Mensagens**:
- ✅ Sucesso: "✏️ Áudio renomeado! De: **antigo** → Para: **novo**"
- ❌ Erro (não é dono): "Você não pode renomear este áudio! Apenas o criador pode renomeá-lo."
- ❌ Erro (nome existe): "Já existe um áudio com o nome **novo**."

---

## 🔒 Sistema de Permissões

### Ações Públicas (Todos Podem)
- ✅ Reproduzir qualquer áudio com `!audio`
- ✅ Listar todos os áudios com `!audios`
- ✅ Salvar novos áudios com `!save`

### Ações Restritas (Apenas o Dono)
- 🔒 Deletar áudio com `!delete` - verifica `owner_jid`
- 🔒 Renomear áudio com `!rename` - verifica `owner_jid`

### Como Funciona
```typescript
// Exemplo de verificação de permissão
const audio = audiosDb.get(audioName)

if (audio.owner_jid !== message.sender) {
  throw new Error('Você não pode deletar este áudio! Apenas o criador pode deletá-lo.')
}
```

---

## 📦 Migração de Dados

### Script: `scripts/migrate-audios-to-global.ts`

O script de migração:
1. Detecta automaticamente se a migração é necessária
2. Cria tabela temporária com nova estrutura
3. Copia dados, **mantendo apenas o primeiro áudio de cada nome** (por data de criação)
4. Remove duplicatas automaticamente
5. Atualiza índices do banco

### Como Executar
```bash
bun run scripts/migrate-audios-to-global.ts
```

### Output Esperado
```
[MIGRAÇÃO] Iniciando migração de áudios para sistema global...
[MIGRAÇÃO] 📊 Estrutura antiga detectada. Iniciando migração...
[MIGRAÇÃO] 🔨 Tabela temporária criada
[MIGRAÇÃO] 📦 X/Y áudios migrados (duplicatas removidas)
[MIGRAÇÃO] 🗑️ Tabela antiga removida
[MIGRAÇÃO] ✏️ Tabela renomeada
[MIGRAÇÃO] 🔍 Índices recriados
[MIGRAÇÃO] ✅ Migração concluída com sucesso!
```

---

## 🚀 Deploy

### Passos para Produção

1. **Fazer backup do banco de dados**
   ```bash
   cp storage/bot.db storage/bot.db.backup
   ```

2. **Fazer pull das mudanças**
   ```bash
   git pull origin main
   ```

3. **Instalar dependências**
   ```bash
   bun install
   ```

4. **Executar migração**
   ```bash
   bun run scripts/migrate-audios-to-global.ts
   ```

5. **Compilar**
   ```bash
   bun run build
   ```

6. **Reiniciar bot**
   ```bash
   bun start
   ```

---

## ⚠️ Notas Importantes

### Conflitos de Nomes
- Se dois usuários tinham áudios com o mesmo nome, a migração **mantém apenas o mais antigo**
- Recomenda-se avisar usuários para verificar seus áudios após migração
- Nomes agora são únicos globalmente - não é mais possível ter duplicatas

### Comportamento em Grupos
- Em grupos, qualquer membro pode usar qualquer áudio
- Útil para memes e áudios compartilhados
- Apenas quem salvou pode deletar/renomear

### Performance
- Índices otimizados para busca rápida por nome
- Índice no `owner_jid` para verificação de permissões
- Busca fuzzy continua funcionando para facilitar uso

---

## 🐛 Troubleshooting

### Erro: "Já existe um áudio com o nome..."
**Causa**: Nome já está sendo usado globalmente  
**Solução**: Use `!audios` para ver lista completa e escolha outro nome

### Erro: "Você não pode deletar este áudio!"
**Causa**: Você não é o dono do áudio  
**Solução**: Apenas o criador pode deletar. Entre em contato com quem criou o áudio

### Banco não migrou
**Causa**: Erro durante migração  
**Solução**: 
1. Restaure backup: `cp storage/bot.db.backup storage/bot.db`
2. Execute migração novamente
3. Verifique logs de erro

### Performance lenta
**Causa**: Muitos áudios sem índices  
**Solução**: Verifique se os índices foram criados:
```bash
sqlite3 storage/bot.db ".indexes saved_audios"
```

---

## 📝 Changelog

### v3.5.0 - Sistema de Áudios Global

**🌐 Features**
- Áudios agora são compartilhados globalmente
- Sistema de permissões baseado em dono
- Nomes únicos globalmente

**🔧 Changes**
- `user_jid` → `owner_jid` no banco
- Funções do `audiosDb` atualizadas para modo global
- Mensagens dos comandos refletem novo comportamento

**🐛 Fixes**
- Previne duplicação de nomes de áudios
- Garante que apenas donos podem editar/deletar

**📦 Migration**
- Script automático de migração incluído
- Mantém histórico de ownership
- Remove duplicatas automaticamente
