# Sistema de Patch Notes Automático

## Como funciona

O bot agora possui um sistema automático que detecta novas versões e envia as patch notes para todos os grupos.

### Fluxo de funcionamento

1. **Ao iniciar**: O bot aguarda 5 segundos após estar pronto
2. **Verifica versão**: Compara a versão atual (`package.json`) com a última notificada (`storage/last-version.json`)
3. **Busca patch notes**: Extrai as notas da versão atual do `CHANGELOG.md`
4. **Envia para grupos**: Envia a mensagem com patch notes em todos os grupos cadastrados
5. **Reação**: Adiciona uma reação 📌 na mensagem
6. **Salva versão**: Registra a versão como notificada para não enviar novamente

### Como adicionar uma nova versão com patch notes

1. **Atualize a versão** no `package.json`:
   ```json
   {
     "version": "3.4.8"
   }
   ```

2. **Adicione as patch notes** no `docs/releases/CHANGELOG.md`:
   ```markdown
   ## 3.4.8 - DD/MM/AAAA

   ### MELHORIAS
   - Nova funcionalidade X
   - Otimização em Y

   ### CORREÇÕES
   - Corrigido bug Z
   ```

3. **Inicie o bot**: As patch notes serão enviadas automaticamente na primeira inicialização

### Formato das patch notes

A mensagem enviada segue este formato:
```
🤖 *ELISYUM BOT - Atualização vX.X.X*

[Conteúdo das patch notes do CHANGELOG]

_Mensagem automática de atualização_
```

### Arquivos importantes

- `/src/helpers/patch-notes.helper.ts` - Lógica do sistema
- `/storage/last-version.json` - Registra última versão notificada
- `/docs/releases/CHANGELOG.md` - Onde ficam as patch notes
- `/package.json` - Versão atual do bot

### Forçar reenvio de patch notes

Se precisar reenviar as patch notes da versão atual:

1. Delete o arquivo `storage/last-version.json`
2. Reinicie o bot

### Desabilitar temporariamente

Para desabilitar o envio automático, comente a chamada em `/src/socket.ts`:

```typescript
// setTimeout(() => {
//     checkAndNotifyPatchNotes(client).catch(err => {
//         console.error('[Socket] Erro ao verificar patch notes:', err)
//     })
// }, 5000)
```
