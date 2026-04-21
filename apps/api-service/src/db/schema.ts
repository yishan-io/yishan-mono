import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_provider_user_id_uq").on(
      table.provider,
      table.providerUserId
    ),
    uniqueIndex("oauth_accounts_user_id_provider_uq").on(table.userId, table.provider)
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uq").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt)
  ]
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedByTokenId: text("replaced_by_token_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_hash_uq").on(table.tokenHash),
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt)
  ]
);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type OAuthAccount = InferSelectModel<typeof oauthAccounts>;
export type NewOAuthAccount = InferInsertModel<typeof oauthAccounts>;

export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type NewRefreshToken = InferInsertModel<typeof refreshTokens>;
