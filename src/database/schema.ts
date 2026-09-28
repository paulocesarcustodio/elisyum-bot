import { sql } from 'drizzle-orm'
import { pgTable, pgSchema, text, integer, serial, bigint, boolean, jsonb, timestamp, uuid, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core'

const time = (name: string) => timestamp(name, {withTimezone:true, mode:'string'})
export const botAccounts = pgTable('bot_accounts', {
    id:text('id').primaryKey(), config:jsonb('config').$type<Record<string,unknown>>().notNull().default({}),
    generation:integer('generation').notNull().default(0), updatedAt:time('updated_at').notNull().defaultNow()
})
export const identities = pgTable('identities', {
    id:uuid('id').primaryKey().defaultRandom(), accountId:text('account_id').notNull().references(()=>botAccounts.id),
    primaryJid:text('primary_jid').notNull(), createdAt:time('created_at').notNull().defaultNow()
}, t=>[uniqueIndex('identity_primary_unique').on(t.accountId,t.primaryJid)])
export const identityAliases = pgTable('identity_aliases', {
    accountId:text('account_id').notNull().references(()=>botAccounts.id), alias:text('alias').notNull(),
    identityId:uuid('identity_id').notNull().references(()=>identities.id,{onDelete:'cascade'}),
    source:text('source').notNull(), updatedAt:time('updated_at').notNull().defaultNow()
}, t=>[primaryKey({columns:[t.accountId,t.alias]}),index('identity_alias_identity').on(t.identityId)])
export const roleGrants = pgTable('role_grants', {
    accountId:text('account_id').notNull().references(()=>botAccounts.id), identityId:uuid('identity_id').notNull().references(()=>identities.id,{onDelete:'cascade'}),
    scope:text('scope').notNull(), role:text('role').notNull(), updatedAt:time('updated_at').notNull().defaultNow()
},t=>[primaryKey({columns:[t.accountId,t.identityId,t.scope,t.role]})])
// Existing counters/options are retained for a lossless import. Removed commands
// do not regain behavior merely because their historical columns still exist.
export const contacts = pgTable('contacts', {
    jid:text('jid').primaryKey(),name:text('name'),notify:text('notify'),verifiedName:text('verified_name'),
    phoneNumber:text('phone_number'),lid:text('lid'),avatarUrl:text('avatar_url'),updatedAt:time('updated_at').defaultNow()
},t=>[index('contacts_lid').on(t.lid),index('contacts_phone').on(t.phoneNumber)])
export const users = pgTable('users', {
    id:text('id').primaryKey(),name:text('name').default(''),commands:integer('commands').default(0),
    receivedWelcome:integer('received_welcome').default(0),owner:integer('owner').default(0),
    commandRateLimited:integer('command_rate_limited').default(0),commandRateExpireLimited:bigint('command_rate_expire_limited',{mode:'number'}).default(0),
    commandRateCmds:integer('command_rate_cmds').default(1),commandRateExpireCmds:bigint('command_rate_expire_cmds',{mode:'number'}).default(0),
    helpLevel:text('help_level').default('detailed'),createdAt:time('created_at').defaultNow()
})
export const groups = pgTable('groups_data', {
    id:text('id').primaryKey(),name:text('name').default(''),description:text('description'),commandsExecuted:integer('commands_executed').default(0),
    owner:text('owner'),restricted:integer('restricted').default(0),expiration:integer('expiration'),muted:integer('muted').default(0),mutedMembers:text('muted_members').default('[]'),
    welcomeStatus:integer('welcome_status').default(0),welcomeMsg:text('welcome_msg').default(''),antifakeStatus:integer('antifake_status').default(0),
    antifakeExceptions:text('antifake_exceptions').default('{"prefixes":["55"],"numbers":[]}'),antilinkStatus:integer('antilink_status').default(0),antilinkExceptions:text('antilink_exceptions').default('[]'),
    antifloodStatus:integer('antiflood_status').default(0),antifloodMaxMessages:integer('antiflood_max_messages').default(10),antifloodInterval:integer('antiflood_interval').default(10),
    autoReplyStatus:integer('auto_reply_status').default(0),autoReplyConfig:text('auto_reply_config').default('[]'),autosticker:integer('autosticker').default(0),
    blockCmds:text('block_cmds').default('[]'),blacklist:text('blacklist').default('[]'),wordFilter:text('word_filter').default('[]'),createdAt:time('created_at').defaultNow()
})
export const memberships = pgTable('participants', {
    groupId:text('group_id').notNull().references(()=>groups.id,{onDelete:'cascade'}),userId:text('user_id').notNull(),registeredSince:text('registered_since'),
    commands:integer('commands').default(0),admin:integer('admin').default(0),msgs:integer('msgs').default(0),image:integer('image').default(0),audio:integer('audio').default(0),
    sticker:integer('sticker').default(0),video:integer('video').default(0),textCount:integer('text_count').default(0),other:integer('other').default(0),warnings:integer('warnings').default(0),
    antifloodExpire:bigint('antiflood_expire',{mode:'number'}).default(0),antifloodMsgs:integer('antiflood_msgs').default(0),createdAt:time('created_at').defaultNow()
},t=>[primaryKey({columns:[t.groupId,t.userId]}),index('participants_admin').on(t.groupId,t.admin)])
export const mediaAssets = pgTable('media_assets', {
    key:text('key').primaryKey(),hash:text('hash').notNull(),size:bigint('size',{mode:'number'}).notNull(),mimeType:text('mime_type').notNull(),
    createdAt:time('created_at').notNull().defaultNow(),expiresAt:time('expires_at')
})
export const savedAudios = pgTable('saved_audios', {
    id:serial('id').primaryKey(),ownerJid:text('owner_jid').notNull(),audioName:text('audio_name').notNull().unique(),filePath:text('file_path').notNull(),
    blobKey:text('blob_key').references(()=>mediaAssets.key),mimeType:text('mime_type').notNull(),seconds:integer('seconds'),ptt:integer('ptt').default(0),createdAt:time('created_at').defaultNow()
},t=>[index('audios_owner').on(t.ownerJid)])
export const commandLogs = pgTable('command_logs', {
    id:serial('id').primaryKey(),userJid:text('user_jid').notNull(),userName:text('user_name'),command:text('command').notNull(),args:text('args'),chatId:text('chat_id'),
    isGroup:integer('is_group').default(0),timestamp:time('timestamp').defaultNow(),success:integer('success').default(1),errorMessage:text('error_message')
},t=>[index('logs_user_time').on(t.userJid,t.timestamp)])
export const askCache = pgTable('ask_cache', {
    id:serial('id').primaryKey(),questionHash:text('question_hash').notNull(),question:text('question').notNull(),answer:text('answer').notNull(),userType:text('user_type').notNull(),
    hitCount:integer('hit_count').default(1),createdAt:time('created_at').defaultNow(),lastUsedAt:time('last_used_at').defaultNow()
},t=>[uniqueIndex('ask_cache_question_role').on(t.questionHash,t.userType)])
export const commandOperations = pgTable('command_operations', {
    id:uuid('id').primaryKey().defaultRandom(),accountId:text('account_id').notNull().references(()=>botAccounts.id),conversationId:text('conversation_id').notNull(),actorId:text('actor_id').notNull(),
    command:text('command'),source:text('source').notNull(),status:text('status').notNull().default('pending'),request:jsonb('request'),result:jsonb('result'),
    effectsStarted:boolean('effects_started').notNull().default(false),attempts:integer('attempts').notNull().default(0),error:text('error'),
    createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow(),expiresAt:time('expires_at').notNull()
},t=>[index('operations_status').on(t.status,t.createdAt)])
export const inbox = pgTable('inbox', {
    key:text('key').primaryKey(),operationId:uuid('operation_id').notNull().unique().references(()=>commandOperations.id),accountId:text('account_id').notNull(),
    conversationId:text('conversation_id').notNull(),messageId:text('message_id').notNull(),payload:text('payload').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[index('inbox_conversation').on(t.accountId,t.conversationId,t.createdAt)])
export const outbox = pgTable('outbox', {
    id:uuid('id').primaryKey().defaultRandom(),operationId:uuid('operation_id').notNull().references(()=>commandOperations.id),sequence:integer('sequence').notNull(),
    method:text('method').notNull(),payload:text('payload').notNull(),status:text('status').notNull().default('prepared'),result:text('result'),error:text('error'),
    createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow()
},t=>[uniqueIndex('outbox_operation_sequence').on(t.operationId,t.sequence)])
export const confirmations = pgTable('confirmations', {
    id:uuid('id').primaryKey().defaultRandom(),accountId:text('account_id').notNull(),conversationId:text('conversation_id').notNull(),actorId:text('actor_id').notNull(),
    command:text('command').notNull(),payload:text('payload').notNull(),operationId:uuid('operation_id'),status:text('status').notNull().default('pending'),
    expiresAt:time('expires_at').notNull(),createdAt:time('created_at').notNull().defaultNow()
},t=>[uniqueIndex('one_pending_confirmation').on(t.accountId,t.conversationId,t.actorId).where(sql`${t.status} = 'pending'`)])
export const auditEvents = pgTable('audit_events', {
    id:bigint('id',{mode:'number'}).primaryKey().generatedAlwaysAsIdentity(),operationId:uuid('operation_id'),event:text('event').notNull(),stage:text('stage'),durationMs:integer('duration_ms'),
    details:jsonb('details').$type<Record<string,unknown>>().notNull().default({}),createdAt:time('created_at').notNull().defaultNow()
},t=>[index('audit_operation').on(t.operationId,t.createdAt)])
export const admissionWindows = pgTable('admission_windows', {
    key:text('key').notNull(),window:bigint('window',{mode:'number'}).notNull(),count:integer('count').notNull().default(1)
},t=>[primaryKey({columns:[t.key,t.window]})])
export const transportMessages = pgTable('transport_messages', {
    accountId:text('account_id').notNull(),conversationId:text('conversation_id').notNull(),id:text('id').notNull(),payload:text('payload').notNull(),expiresAt:time('expires_at').notNull()
},t=>[primaryKey({columns:[t.accountId,t.conversationId,t.id]})])
export const mediaJobs = pgTable('media_jobs', {
    attempt:integer('attempt').notNull().default(0),
    id:uuid('id').primaryKey().defaultRandom(),ownerId:text('owner_id').notNull(),operation:text('operation').notNull(),input:jsonb('input').notNull(),
    status:text('status').notNull().default('queued'),result:jsonb('result'),error:text('error'),progress:integer('progress').notNull().default(0),
    createdAt:time('created_at').notNull().defaultNow(),updatedAt:time('updated_at').notNull().defaultNow(),expiresAt:time('expires_at').notNull()
})
export const authPrivate = pgSchema('auth_private')
export const sessionKeys = authPrivate.table('session_keys', {
    accountId:text('account_id').notNull().references(()=>botAccounts.id),key:text('key').notNull(),data:text('data')
},t=>[primaryKey({columns:[t.accountId,t.key]})])
// Better Auth subjects stay separate from WhatsApp identities.
export const user = pgTable('user', {
    id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull().unique(),emailVerified:boolean('email_verified').notNull().default(false),image:text('image'),
    createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
    role:text('role').default('user'),banned:boolean('banned'),banReason:text('ban_reason'),banExpires:timestamp('ban_expires',{withTimezone:true})
})
export const session = pgTable('session', {
    id:text('id').primaryKey(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),token:text('token').notNull().unique(),
    createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
    ipAddress:text('ip_address'),userAgent:text('user_agent'),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),impersonatedBy:text('impersonated_by')
})
export const account = pgTable('account', {
    id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
    accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),accessTokenExpiresAt:timestamp('access_token_expires_at',{withTimezone:true}),
    refreshTokenExpiresAt:timestamp('refresh_token_expires_at',{withTimezone:true}),scope:text('scope'),password:text('password'),
    createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow()
})
export const verification = pgTable('verification', {
    id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}).notNull(),
    createdAt:timestamp('created_at',{withTimezone:true}).defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).defaultNow()
})
