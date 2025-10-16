# Melhorias para Trazer Nomes de Usuários no Sticker

## 📋 Resumo das Mudanças

Foram realizadas melhorias para garantir que o nome do usuário seja exibido corretamente na figurinha ao invés de apenas "Membro do grupo". O sistema agora segue uma **cascata de prioridades** para obter o melhor nome disponível.

## 🔍 Estratégia de Obtenção de Nomes

O sistema tenta obter o nome seguindo esta ordem de prioridade:

### 1️⃣ **Push Name (Nome em tempo real)**
- Nome enviado pelo contato na própria mensagem
- Disponível em `message.quotedMessage.wa_message.pushName`
- **Prioridade mais alta** pois é o nome que a pessoa está usando naquele momento

### 2️⃣ **Banco de Dados (Cache local)**
- Nome salvo automaticamente quando o usuário manda mensagens
- Armazenado via evento `contacts.update` ou ao receber mensagens
- Persiste entre sessões do bot

### 3️⃣ **Agenda de Contatos do Cliente**
- `notify` - Nome que o próprio contato definiu para si mesmo no WhatsApp
- `name` - Nome salvo na agenda do dispositivo
- `verifiedName` - Nome verificado (contas de negócios)

### 4️⃣ **Fallback**
- Se nenhum nome for encontrado, exibe "Membro do grupo"

## 📝 Arquivos Modificados

### 1. `src/commands/sticker.functions.commands.ts`
**Alteração**: Reordenação da lógica de busca de nomes

**Antes**: Buscava no banco → pushName → contatos
**Depois**: pushName → banco → contatos (ordem otimizada)

```typescript
// Obter nome do autor - Estratégia optimizada
let authorName = 'Membro do grupo';
try {
    const quotedSender = message.quotedMessage!.sender;
    const userController = new UserController();

    // 1. Tenta obter o pushName da mensagem original (nome enviado pelo contato)
    let pushName = message.quotedMessage?.wa_message?.pushName;
    if (pushName && pushName.trim().length > 0) {
        authorName = pushName.trim();
    } else {
        // 2. Busca o nome do banco de dados
        const user = await userController.getUser(quotedSender);
        if (user && user.name && user.name.trim().length > 0) {
            authorName = user.name;
        } else {
            // 3. Consulta a agenda de contatos do cliente
            const contact = (client as any).contacts?.[quotedSender];
            if (contact) {
                const contactName = contact.notify || contact.name || contact.verifiedName;
                if (contactName && contactName.trim().length > 0) {
                    authorName = contactName.trim();
                }
            }
        }
    }
} catch (err) {
    console.log(`[STICKER] Erro ao buscar nome:`, err);
}
```

### 2. `src/events/contacts-update.event.ts`
**Alteração**: Captura agora múltiplas formas de nomes

**Antes**: Capturava apenas `notify`
**Depois**: Captura `notify` → `name` → `verifiedName`

```typescript
export async function contactsUpdate(contacts: Partial<Contact>[]) {
    try {
        const userController = new UserController()
        
        for (const contact of contacts) {
            if (!contact.id) continue
            
            // Prioridade de nomes: notify > name > verifiedName
            const nameToSave = contact.notify || contact.name || contact.verifiedName
            
            if (nameToSave && nameToSave.trim().length > 0) {
                await userController.setName(contact.id, nameToSave.trim())
                console.log(`[CONTACTS] Nome atualizado: ${nameToSave} (${contact.id})`)
            }
        }
    } catch (err: any) {
        showConsoleError(err, "CONTACTS.UPDATE")
    }
}
```

## 🔄 Fluxo de Dados

```
┌─────────────────────────────────────┐
│  Usuário manda mensagem citada      │
└────────────────┬────────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │ Evento: message-received   │
    │ Salva: pushName no banco   │
    └────────────┬───────────────┘
                 │
    ┌────────────▼───────────────┐
    │ Evento: contacts.update    │
    │ Atualiza: notify/name/etc  │
    └────────────┬───────────────┘
                 │
    ┌────────────▼──────────────────────┐
    │ Comando: !s (criar sticker)       │
    │ 1. pushName (tempo real)          │
    │ 2. BD (notify/name)               │
    │ 3. contacts (notify/name/verified)│
    │ 4. Fallback: "Membro do grupo"    │
    └────────────┬──────────────────────┘
                 │
                 ▼
    ┌────────────────────────────┐
    │  Sticker com nome correto  │
    └────────────────────────────┘
```

## ✅ Benefícios

- ✨ **Melhor UX**: Figurinhas mostram nome real do usuário, não genérico
- 🔄 **Múltiplas fontes**: Captura nome de várias APIs do Baileys
- 💾 **Cache local**: Reutiliza nomes previamente capturados
- 🛡️ **Fallback seguro**: Sempre tem um nome para exibir
- 📱 **Suporte a Business**: Reconhece `verifiedName` de contas de negócios

## 🧪 Testando

1. **Mande uma mensagem** no grupo para que o bot capture seu `pushName`
2. **Cite uma mensagem sua** e use `/s` para criar um sticker
3. **Verifique** se o sticker mostra seu nome real

## 📚 Referências do Baileys

- **Contact Interface**: https://baileys.wiki/docs/api/interfaces/Contact
  - `notify`: Nome que o contato definiu para si
  - `name`: Nome salvo na agenda
  - `verifiedName`: Nome verificado (Business)

- **WAMessage**: Contém o `pushName` do remetente

## 🚀 Próximos passos (Opcional)

Se desejar ainda mais precisão, pode-se:
1. Consultar metadados do grupo para pegar nome do participante
2. Adicionar cache em memória com TTL para nomes frequentes
3. Criar endpoint de configuração manual de nomes
