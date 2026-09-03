import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { ConversionPhase } from "#src/grant-contracts.ts";
import type { AudiobookReference, ConversionMeasurements } from "#src/grant-model.ts";

export const schemaMigrations = sqliteTable("_schema_migrations", {
  version: integer().primaryKey(),
  appliedAtMs: integer("applied_at_ms").notNull(),
});

export const grants = sqliteTable(
  "grant",
  {
    id: integer().primaryKey(),
    grantId: text("grant_id").notNull().unique(),
    createdAtMs: integer("created_at_ms").notNull(),
    expiresAtMs: integer("expires_at_ms").notNull(),
    revokedAtMs: integer("revoked_at_ms"),
    credentialVerifier: text("credential_verifier"),
    credentialIssuedAtMs: integer("credential_issued_at_ms"),
    sessionSigningKey: text("session_signing_key").notNull(),
    signingKeyGeneration: integer("signing_key_generation").notNull(),
    registrySnapshotRevision: integer("projection_revision").notNull(),
    registryConfirmedSnapshotRevision: integer("registry_confirmed_revision").notNull(),
  },
  (table) => [
    check("grant_singleton", sql`${table.id} = 1`),
    check("grant_expiry", sql`${table.expiresAtMs} > ${table.createdAtMs}`),
    check("grant_signing_key_generation", sql`${table.signingKeyGeneration} > 0`),
    check("grant_registry_snapshot_revision", sql`${table.registrySnapshotRevision} > 0`),
    check(
      "grant_registry_confirmed_snapshot_revision",
      sql`${table.registryConfirmedSnapshotRevision} >= 0`,
    ),
  ],
);

const CONVERSION_STATUSES = ["pending", "ready", "failed"] as const;
const FAILURE_CATEGORIES = [
  "workflow-start",
  "source-preparation",
  "content-selection",
  "content-limit",
  "narration-synthesis",
  "audiobook-assembly",
  "workflow-platform",
  "internal",
] as const;
const CLEANUP_STATES = ["pending", "complete", "cleanup_failed"] as const;

export const conversions = sqliteTable(
  "conversions",
  {
    conversionId: text("conversion_id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    sourceUrl: text("source_url").notNull(),
    acceptedAtMs: integer("accepted_at_ms").notNull(),
    workflowStartedAtMs: integer("workflow_started_at_ms"),
    status: text({ enum: CONVERSION_STATUSES }).notNull(),
    lastStartedPhase: text("last_started_phase").$type<ConversionPhase>(),
    completedAtMs: integer("completed_at_ms"),
    title: text(),
    audiobookReference: text("audiobook_reference_json", {
      mode: "json",
    }).$type<AudiobookReference>(),
    measurements: text("measurements_json", { mode: "json" }).$type<ConversionMeasurements>(),
    providerUsage: text("provider_usage_json", { mode: "json" }).$type<Record<string, unknown>>(),
    failureCategory: text("failure_category", { enum: FAILURE_CATEGORIES }),
    explanation: text(),
    diagnosticReference: text("diagnostic_reference"),
    cleanupState: text("cleanup_state", { enum: CLEANUP_STATES }),
  },
  (table) => [
    check(
      "conversion_terminal_outcome",
      sql`(
        ${table.lastStartedPhase} IS NOT NULL AND (
          (${table.status} = 'pending' AND ${table.completedAtMs} IS NULL AND ${table.audiobookReference} IS NULL AND ${table.failureCategory} IS NULL AND ${table.explanation} IS NULL)
          OR (${table.status} = 'ready' AND ${table.completedAtMs} IS NOT NULL AND ${table.title} IS NOT NULL AND ${table.audiobookReference} IS NOT NULL AND ${table.failureCategory} IS NULL AND ${table.explanation} IS NULL)
          OR (${table.status} = 'failed' AND ${table.completedAtMs} IS NOT NULL AND ${table.audiobookReference} IS NULL AND ${table.failureCategory} IS NOT NULL AND ${table.explanation} IS NOT NULL)
        )
      )`,
    ),
  ],
);

export const startAttempts = sqliteTable("start_attempts", {
  id: integer().primaryKey({ autoIncrement: true }),
  attemptedAtMs: integer("attempted_at_ms").notNull(),
});

const REGISTRY_PHASES = ["reserved", "initialized", "active"] as const;

export const registryGrants = sqliteTable(
  "registry_grants",
  {
    grantId: text("grant_id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    label: text().notNull(),
    phase: text({ enum: REGISTRY_PHASES }).notNull(),
    createdAtMs: integer("created_at_ms").notNull(),
    expiresAtMs: integer("expires_at_ms").notNull(),
    credentialIssued: integer("credential_issued", { mode: "boolean" }).notNull(),
    snapshotRevision: integer("projection_revision"),
    snapshotRevokedAtMs: integer("projection_revoked_at_ms"),
    snapshotReserved: integer("projection_reserved"),
    snapshotSpent: integer("projection_spent"),
    snapshotSchemaVersion: integer("projection_schema_version"),
  },
  (table) => [
    check("registry_grant_expiry", sql`${table.expiresAtMs} > ${table.createdAtMs}`),
    check("registry_grant_snapshot_reserved", sql`${table.snapshotReserved} BETWEEN 0 AND 5`),
    check("registry_grant_snapshot_spent", sql`${table.snapshotSpent} BETWEEN 0 AND 5`),
    check(
      "registry_grant_snapshot",
      sql`(
        (${table.snapshotRevision} IS NULL AND ${table.snapshotReserved} IS NULL AND ${table.snapshotSpent} IS NULL AND ${table.snapshotSchemaVersion} IS NULL)
        OR (${table.snapshotRevision} > 0 AND ${table.snapshotReserved} IS NOT NULL AND ${table.snapshotSpent} IS NOT NULL AND ${table.snapshotSchemaVersion} > 0)
      )`,
    ),
  ],
);

export const conversionGrants = sqliteTable("conversion_grants", {
  conversionId: text("conversion_id").primaryKey(),
  grantId: text("grant_id")
    .notNull()
    .references(() => registryGrants.grantId),
});

export const grantSqliteSchema = { conversions, grants, schemaMigrations, startAttempts };
export const registrySqliteSchema = { conversionGrants, registryGrants, schemaMigrations };
