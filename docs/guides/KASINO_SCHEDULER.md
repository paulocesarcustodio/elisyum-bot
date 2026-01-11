# Agendamento Automático - Kasino no Sabadaço

## Descrição

Sistema de agendamento automático que busca e envia o vídeo "Kasino no Sabadaço" para todos os grupos do bot todo sábado às 12:00 (horário de Brasília).

## Funcionalidades

### Envio Automático
- **Frequência**: Todo sábado às 12:00
- **Timezone**: America/Sao_Paulo (Horário de Brasília)
- **Busca**: Procura automaticamente pelo vídeo "Kasino no Sabadaço" no YouTube
- **Envio**: Envia para todos os grupos sem mensagem de contexto
- **Delay**: 2 segundos entre cada envio para evitar bloqueio

### Validações
- Verifica se o vídeo foi encontrado
- Verifica se não é uma transmissão ao vivo
- Gera thumbnail automaticamente para o vídeo
- Tratamento de erros por grupo (falha em um não afeta os outros)

## Comando de Teste

Para testar o envio manualmente (apenas administradores do bot):

```
!testkasino
```

Este comando:
- Busca o vídeo "Kasino no Sabadaço"
- Envia para todos os grupos
- Retorna estatísticas de sucesso/falha

## Logs

O sistema gera logs detalhados:

```
[Scheduler] 📅 Inicializando agendamentos...
[Scheduler] ✅ Agendamento do vídeo Kasino configurado para sábados às 12:00
[Scheduler] 🎥 Iniciando busca do vídeo Kasino no Sabadaço...
[Scheduler] ✅ Vídeo encontrado: [Título do vídeo]
[Scheduler] 📥 Baixando vídeo...
[Scheduler] ✅ Vídeo baixado com sucesso! Tamanho: XX.XX MB
[Scheduler] 📤 Enviando vídeo para X grupos...
[Scheduler] ✅ Enviado para: [Nome do Grupo]
[Scheduler] 🎉 Processo concluído!
[Scheduler] 📊 Enviado com sucesso: X
[Scheduler] ⚠️ Erros: X
```

## Arquivos Criados/Modificados

### Novos Arquivos
- `src/services/scheduler.service.ts` - Serviço de agendamento

### Arquivos Modificados
- `src/socket.ts` - Inicialização do scheduler
- `src/commands/admin.list.commands.ts` - Comando de teste
- `src/commands/admin.functions.commands.ts` - Função do comando de teste

## Dependências

- `node-cron` - Para agendamento de tarefas
- `@types/node-cron` - Tipos TypeScript

## Configuração

O agendamento é configurado automaticamente quando o bot inicia. Nenhuma configuração adicional é necessária.

### Alterando o Horário

Para alterar o horário do envio, edite o arquivo `src/services/scheduler.service.ts`:

```typescript
// Todo sábado às 12:00 (horário de Brasília)
cron.schedule('0 12 * * 6', async () => {
    await this.sendKasinoVideo()
}, {
    timezone: 'America/Sao_Paulo'
})
```

Formato do cron: `minuto hora * * dia_da_semana`
- Minuto: 0-59
- Hora: 0-23
- Dia da semana: 0-6 (0 = Domingo, 6 = Sábado)

### Exemplos de Horários

- Todo sábado às 10:00: `'0 10 * * 6'`
- Todo sábado às 18:00: `'0 18 * * 6'`
- Todo domingo às 12:00: `'0 12 * * 0'`
- Toda sexta às 20:00: `'0 20 * * 5'`

## Notas

- O vídeo é enviado sem nenhuma mensagem de contexto, apenas o vídeo puro
- O sistema respeita as configurações de mensagens efêmeras de cada grupo
- Se o vídeo for muito grande, pode demorar mais tempo para baixar e enviar
- Certifique-se de que o bot tem permissão para enviar vídeos em todos os grupos
