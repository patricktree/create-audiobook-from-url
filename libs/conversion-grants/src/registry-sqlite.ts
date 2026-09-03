import { asc, desc } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import type { RegistryEntry, RegistryRecord } from "#src/registry-model.ts";
import { REGISTRY_SCHEMA_VERSION } from "#src/registry-model.ts";
import {
  conversionGrants as conversionGrantTable,
  registryGrants as registryGrantTable,
  registrySqliteSchema,
  schemaMigrations,
} from "#src/sqlite-schema.ts";
import { nowMilliseconds } from "#src/time.ts";

export class ConversionGrantRegistrySqlite {
  private readonly database: DrizzleSqliteDODatabase<typeof registrySqliteSchema>;
  private readonly storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.database = drizzle(storage, { schema: registrySqliteSchema });
    this.storage = storage;
  }

  async applyMigrations(): Promise<void> {
    this.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS _schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL)",
    );
    const latest =
      this.database
        .select({ version: schemaMigrations.version })
        .from(schemaMigrations)
        .orderBy(desc(schemaMigrations.version))
        .limit(1)
        .get()?.version ?? 0;
    if (latest > REGISTRY_SCHEMA_VERSION)
      throw new Error("Registry schema is newer than this Worker");
    if (latest < 1) {
      this.storage.transactionSync(() => {
        this.storage.sql.exec(
          `CREATE TABLE registry_grants (
            grant_id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            phase TEXT NOT NULL CHECK (phase IN ('reserved', 'initialized', 'active')),
            created_at_ms INTEGER NOT NULL,
            expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
            credential_issued INTEGER NOT NULL CHECK (credential_issued IN (0, 1)),
            projection_revision INTEGER,
            projection_revoked_at_ms INTEGER,
            projection_reserved INTEGER CHECK (projection_reserved BETWEEN 0 AND 5),
            projection_spent INTEGER CHECK (projection_spent BETWEEN 0 AND 5),
            projection_schema_version INTEGER,
            CHECK (
              (projection_revision IS NULL AND projection_reserved IS NULL AND projection_spent IS NULL AND projection_schema_version IS NULL)
              OR (projection_revision > 0 AND projection_reserved IS NOT NULL AND projection_spent IS NOT NULL AND projection_schema_version > 0)
            )
          )`,
        );
        this.storage.sql.exec(
          `CREATE TABLE conversion_grants (
            conversion_id TEXT PRIMARY KEY,
            grant_id TEXT NOT NULL REFERENCES registry_grants(grant_id)
          )`,
        );
        this.database
          .insert(schemaMigrations)
          .values({ version: 1, appliedAtMs: nowMilliseconds() })
          .run();
      });
    }
  }

  async load(): Promise<RegistryRecord> {
    const grants = this.database
      .select()
      .from(registryGrantTable)
      .orderBy(asc(registryGrantTable.createdAtMs), asc(registryGrantTable.grantId))
      .all()
      .map((row) => ({
        requestId: row.requestId,
        grantId: row.grantId,
        label: row.label,
        phase: row.phase,
        createdAtMs: row.createdAtMs,
        expiresAtMs: row.expiresAtMs,
        credentialIssued: row.credentialIssued,
        ...(row.snapshotRevision === null ||
        row.snapshotReserved === null ||
        row.snapshotSpent === null ||
        row.snapshotSchemaVersion === null
          ? {}
          : {
              grantSnapshot: {
                grantId: row.grantId,
                revision: row.snapshotRevision,
                ...(row.snapshotRevokedAtMs === null
                  ? {}
                  : { revokedAtMs: row.snapshotRevokedAtMs }),
                reserved: row.snapshotReserved,
                spent: row.snapshotSpent,
                schemaVersion: row.snapshotSchemaVersion,
              },
            }),
      }));
    const conversionGrants = Object.fromEntries(
      this.database
        .select()
        .from(conversionGrantTable)
        .all()
        .map((row) => [row.conversionId, row.grantId]),
    );
    const parsed: unknown = { grants, conversionGrants };
    if (!isRegistryRecord(parsed)) throw new Error("Registry storage is corrupt");
    return parsed;
  }

  async save(record: RegistryRecord): Promise<void> {
    this.database.delete(conversionGrantTable).run();
    this.database.delete(registryGrantTable).run();
    if (record.grants.length > 0)
      this.database
        .insert(registryGrantTable)
        .values(
          record.grants.map((entry) => ({
            grantId: entry.grantId,
            requestId: entry.requestId,
            label: entry.label,
            phase: entry.phase,
            createdAtMs: entry.createdAtMs,
            expiresAtMs: entry.expiresAtMs,
            credentialIssued: entry.credentialIssued,
            snapshotRevision: entry.grantSnapshot?.revision ?? null,
            snapshotRevokedAtMs: entry.grantSnapshot?.revokedAtMs ?? null,
            snapshotReserved: entry.grantSnapshot?.reserved ?? null,
            snapshotSpent: entry.grantSnapshot?.spent ?? null,
            snapshotSchemaVersion: entry.grantSnapshot?.schemaVersion ?? null,
          })),
        )
        .run();
    const conversionGrantEntries = Object.entries(record.conversionGrants);
    if (conversionGrantEntries.length > 0)
      this.database
        .insert(conversionGrantTable)
        .values(
          conversionGrantEntries.map(([conversionId, grantId]) => ({ conversionId, grantId })),
        )
        .run();
  }
}

function isRegistryRecord(value: unknown): value is RegistryRecord {
  return (
    isRecord(value) &&
    Array.isArray(value["grants"]) &&
    value["grants"].every(isRegistryEntry) &&
    isRecord(value["conversionGrants"]) &&
    Object.values(value["conversionGrants"]).every((grantId) => typeof grantId === "string")
  );
}

function isRegistryEntry(value: unknown): value is RegistryEntry {
  return (
    isRecord(value) &&
    typeof value["requestId"] === "string" &&
    typeof value["grantId"] === "string" &&
    typeof value["label"] === "string" &&
    (value["phase"] === "reserved" ||
      value["phase"] === "initialized" ||
      value["phase"] === "active") &&
    typeof value["createdAtMs"] === "number" &&
    typeof value["expiresAtMs"] === "number" &&
    typeof value["credentialIssued"] === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
