CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"review_id" integer,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"wb_token" text,
	"ozon_client_id" text,
	"ozon_api_key" text,
	"openai_api_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"external_id" text NOT NULL,
	"rating" integer,
	"text" text,
	"pros" text,
	"cons" text,
	"author_name" text,
	"product_name" text,
	"product_sku" text,
	"product_brand" text,
	"product_article" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mp_created_at" timestamp with time zone,
	"status" text DEFAULT 'new' NOT NULL,
	"ai_draft" text,
	"ai_model" text,
	"ai_generated_at" timestamp with time zone,
	"answer_text" text,
	"answer_source" text,
	"answered_by_user_id" integer,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_reply_enabled" boolean DEFAULT false NOT NULL,
	"ozon_mark_processed" boolean DEFAULT true NOT NULL,
	"ai_prompt" text DEFAULT '' NOT NULL,
	"ai_model" text DEFAULT 'gpt-6-luna' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"marketplace" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_mp_external_idx" ON "reviews" USING btree ("marketplace","external_id");--> statement-breakpoint
CREATE INDEX "reviews_status_idx" ON "reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reviews_mp_created_idx" ON "reviews" USING btree ("mp_created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_login_idx" ON "users" USING btree ("login");