import { DurableObject } from "cloudflare:workers";

import type { ListGrantsResult, ProjectedGrantState } from "#src/grant-contracts.ts";
import type { GrantRegistrySnapshot } from "#src/grant-model.ts";
import {
  applyGrantRegistrySnapshot,
  decodeCursor,
  deriveProjectedState,
  encodeCursor,
  GRANT_LIFETIME_MS,
  REGISTRY_SCHEMA_VERSION,
  type RegistryEntry,
} from "#src/registry-model.ts";
import { toOperatorFacts } from "#src/registry-model.ts";
import { ConversionGrantRegistrySqlite } from "#src/registry-sqlite.ts";
import { nowMilliseconds } from "#src/time.ts";

export class ConversionGrantRegistryDurableObject extends DurableObject<Record<string, never>> {
  private readonly sqlite: ConversionGrantRegistrySqlite;

  constructor(context: DurableObjectState, env: Record<string, never>) {
    super(context, env);
    this.sqlite = new ConversionGrantRegistrySqlite(context.storage);
    void context.blockConcurrencyWhile(() => this.sqlite.applyMigrations());
  }

  async reserveProvisioning(
    requestId: string,
    label: string,
    nowMs = nowMilliseconds(),
  ): Promise<{ entry: RegistryEntry; created: boolean }> {
    return this.ctx.storage.transaction(async () => {
      const registry = await this.sqlite.load();
      const existing = registry.grants.find((entry) => entry.requestId === requestId);
      if (existing !== undefined) {
        if (existing.label !== label)
          throw new Error("Provisioning request ID is already bound to a different label");
        return { entry: existing, created: false };
      }
      const entry: RegistryEntry = {
        requestId,
        grantId: crypto.randomUUID(),
        label,
        phase: "reserved",
        createdAtMs: nowMs,
        expiresAtMs: nowMs + GRANT_LIFETIME_MS,
        credentialIssued: false,
      };
      registry.grants.push(entry);
      await this.sqlite.save(registry);
      return { entry, created: true };
    });
  }

  async activate(
    requestId: string,
    grantSnapshot: GrantRegistrySnapshot,
    credentialIssued: boolean,
  ): Promise<RegistryEntry> {
    return this.ctx.storage.transaction(async () => {
      const registry = await this.sqlite.load();
      const entry = registry.grants.find((item) => item.requestId === requestId);
      if (entry === undefined) throw new Error("Provisioning request does not exist");
      entry.phase = "active";
      entry.credentialIssued ||= credentialIssued;
      applyGrantRegistrySnapshot(entry, grantSnapshot);
      await this.sqlite.save(registry);
      return entry;
    });
  }

  async applyGrantRegistrySnapshot(
    grantSnapshot: GrantRegistrySnapshot,
  ): Promise<"applied" | "replayed" | "stale"> {
    return this.ctx.storage.transaction(async () => {
      const registry = await this.sqlite.load();
      const entry = registry.grants.find((item) => item.grantId === grantSnapshot.grantId);
      if (entry === undefined) throw new Error("Registry grant does not exist");
      const result = applyGrantRegistrySnapshot(entry, grantSnapshot);
      await this.sqlite.save(registry);
      return result;
    });
  }

  async getGrant(grantId: string): Promise<RegistryEntry | undefined> {
    return (await this.sqlite.load()).grants.find((entry) => entry.grantId === grantId);
  }

  async listGrants(
    input: { label?: string; state?: ProjectedGrantState; limit: number; cursor?: string },
    nowMs = nowMilliseconds(),
  ): Promise<ListGrantsResult> {
    const registry = await this.sqlite.load();
    const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const matches = registry.grants
      .filter(
        (entry) =>
          input.label === undefined ||
          entry.label.toLocaleLowerCase().includes(input.label.toLocaleLowerCase()),
      )
      .filter(
        (entry) => input.state === undefined || deriveProjectedState(entry, nowMs) === input.state,
      )
      .sort(
        (left, right) =>
          left.createdAtMs - right.createdAtMs || left.grantId.localeCompare(right.grantId),
      )
      .filter(
        (entry) =>
          after === undefined ||
          entry.createdAtMs > after.createdAtMs ||
          (entry.createdAtMs === after.createdAtMs && entry.grantId > after.grantId),
      );
    const page = matches.slice(0, input.limit);
    const last = page.at(-1);
    return {
      grants: page.map((entry) => toOperatorFacts(entry, nowMs)),
      ...(matches.length > page.length && last !== undefined
        ? { nextCursor: encodeCursor(last) }
        : {}),
    };
  }

  async enumerateGrantIds(): Promise<string[]> {
    return (await this.sqlite.load()).grants.map((entry) => entry.grantId);
  }

  async bindConversion(conversionId: string, grantId: string): Promise<void> {
    await this.ctx.storage.transaction(async () => {
      const registry = await this.sqlite.load();
      const existing = registry.conversionGrants[conversionId];
      if (existing !== undefined && existing !== grantId)
        throw new Error("Conversion identity is already bound to a different grant");
      registry.conversionGrants[conversionId] = grantId;
      await this.sqlite.save(registry);
    });
  }

  async findGrantIdForConversion(conversionId: string): Promise<string | undefined> {
    return (await this.sqlite.load()).conversionGrants[conversionId];
  }

  async migrate(): Promise<number> {
    await this.sqlite.applyMigrations();
    return REGISTRY_SCHEMA_VERSION;
  }
}
