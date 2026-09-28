CREATE SCHEMA "auth_private";
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_windows" (
	"key" text NOT NULL,
	"window" bigint NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "admission_windows_key_window_pk" PRIMARY KEY("key","window")
);
--> statement-breakpoint
CREATE TABLE "ask_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_hash" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"user_type" text NOT NULL,
	"hit_count" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_used_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"operation_id" uuid,
	"event" text NOT NULL,
	"stage" text,
	"duration_ms" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_jid" text NOT NULL,
	"user_name" text,
	"command" text NOT NULL,
	"args" text,
	"chat_id" text,
	"is_group" integer DEFAULT 0,
	"timestamp" timestamp with time zone DEFAULT now(),
	"success" integer DEFAULT 1,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "command_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"command" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request" jsonb,
	"result" jsonb,
	"effects_started" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"command" text NOT NULL,
	"payload" text NOT NULL,
	"operation_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"jid" text PRIMARY KEY NOT NULL,
	"name" text,
	"notify" text,
	"verified_name" text,
	"phone_number" text,
	"lid" text,
	"avatar_url" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "groups_data" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '',
	"description" text,
	"commands_executed" integer DEFAULT 0,
	"owner" text,
	"restricted" integer DEFAULT 0,
	"expiration" integer,
	"muted" integer DEFAULT 0,
	"muted_members" text DEFAULT '[]',
	"welcome_status" integer DEFAULT 0,
	"welcome_msg" text DEFAULT '',
	"antifake_status" integer DEFAULT 0,
	"antifake_exceptions" text DEFAULT '{"prefixes":["55"],"numbers":[]}',
	"antilink_status" integer DEFAULT 0,
	"antilink_exceptions" text DEFAULT '[]',
	"antiflood_status" integer DEFAULT 0,
	"antiflood_max_messages" integer DEFAULT 10,
	"antiflood_interval" integer DEFAULT 10,
	"auto_reply_status" integer DEFAULT 0,
	"auto_reply_config" text DEFAULT '[]',
	"autosticker" integer DEFAULT 0,
	"block_cmds" text DEFAULT '[]',
	"blacklist" text DEFAULT '[]',
	"word_filter" text DEFAULT '[]',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"primary_jid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_aliases" (
	"account_id" text NOT NULL,
	"alias" text NOT NULL,
	"identity_id" uuid NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_aliases_account_id_alias_pk" PRIMARY KEY("account_id","alias")
);
--> statement-breakpoint
CREATE TABLE "inbox" (
	"key" text PRIMARY KEY NOT NULL,
	"operation_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"key" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"operation" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"registered_since" text,
	"commands" integer DEFAULT 0,
	"admin" integer DEFAULT 0,
	"msgs" integer DEFAULT 0,
	"image" integer DEFAULT 0,
	"audio" integer DEFAULT 0,
	"sticker" integer DEFAULT 0,
	"video" integer DEFAULT 0,
	"text_count" integer DEFAULT 0,
	"other" integer DEFAULT 0,
	"warnings" integer DEFAULT 0,
	"antiflood_expire" bigint DEFAULT 0,
	"antiflood_msgs" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "participants_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"method" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"result" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_grants" (
	"account_id" text NOT NULL,
	"identity_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"role" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_grants_account_id_identity_id_scope_role_pk" PRIMARY KEY("account_id","identity_id","scope","role")
);
--> statement-breakpoint
CREATE TABLE "saved_audios" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_jid" text NOT NULL,
	"audio_name" text NOT NULL,
	"file_path" text NOT NULL,
	"blob_key" text,
	"mime_type" text NOT NULL,
	"seconds" integer,
	"ptt" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "saved_audios_audio_name_unique" UNIQUE("audio_name")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_private"."session_keys" (
	"account_id" text NOT NULL,
	"key" text NOT NULL,
	"data" text,
	CONSTRAINT "session_keys_account_id_key_pk" PRIMARY KEY("account_id","key")
);
--> statement-breakpoint
CREATE TABLE "transport_messages" (
	"account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"id" text NOT NULL,
	"payload" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transport_messages_account_id_conversation_id_id_pk" PRIMARY KEY("account_id","conversation_id","id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '',
	"commands" integer DEFAULT 0,
	"received_welcome" integer DEFAULT 0,
	"owner" integer DEFAULT 0,
	"command_rate_limited" integer DEFAULT 0,
	"command_rate_expire_limited" bigint DEFAULT 0,
	"command_rate_cmds" integer DEFAULT 1,
	"command_rate_expire_cmds" bigint DEFAULT 0,
	"help_level" text DEFAULT 'detailed',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_operations" ADD CONSTRAINT "command_operations_account_id_bot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bot_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_account_id_bot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bot_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_aliases" ADD CONSTRAINT "identity_aliases_account_id_bot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bot_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_aliases" ADD CONSTRAINT "identity_aliases_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox" ADD CONSTRAINT "inbox_operation_id_command_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."command_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_group_id_groups_data_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_operation_id_command_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."command_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_account_id_bot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bot_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_grants" ADD CONSTRAINT "role_grants_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_audios" ADD CONSTRAINT "saved_audios_blob_key_media_assets_key_fk" FOREIGN KEY ("blob_key") REFERENCES "public"."media_assets"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_private"."session_keys" ADD CONSTRAINT "session_keys_account_id_bot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bot_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ask_cache_question_role" ON "ask_cache" USING btree ("question_hash","user_type");--> statement-breakpoint
CREATE INDEX "audit_operation" ON "audit_events" USING btree ("operation_id","created_at");--> statement-breakpoint
CREATE INDEX "logs_user_time" ON "command_logs" USING btree ("user_jid","timestamp");--> statement-breakpoint
CREATE INDEX "operations_status" ON "command_operations" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_confirmation" ON "confirmations" USING btree ("account_id","conversation_id","actor_id") WHERE "confirmations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "contacts_lid" ON "contacts" USING btree ("lid");--> statement-breakpoint
CREATE INDEX "contacts_phone" ON "contacts" USING btree ("phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_primary_unique" ON "identities" USING btree ("account_id","primary_jid");--> statement-breakpoint
CREATE INDEX "identity_alias_identity" ON "identity_aliases" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "inbox_conversation" ON "inbox" USING btree ("account_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "participants_admin" ON "participants" USING btree ("group_id","admin");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_operation_sequence" ON "outbox" USING btree ("operation_id","sequence");--> statement-breakpoint
CREATE INDEX "audios_owner" ON "saved_audios" USING btree ("owner_jid");