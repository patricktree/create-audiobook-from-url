import nodeUrl from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createTestHarness } from "wrangler";

import { ConversionPhase } from "#src/grant-contracts.ts";
import { createRootCredential } from "#src/grant-session.ts";
import type {
  ConversionGrantDurableObject,
  ConversionGrantRegistryDurableObject,
} from "#src/index.ts";

type TestEnvironment = {
  CONVERSION_GRANTS: DurableObjectNamespace<ConversionGrantDurableObject>;
  CONVERSION_GRANT_REGISTRY: DurableObjectNamespace<ConversionGrantRegistryDurableObject>;
};
const CREATED_AT_MS = 2_000_000_000_000;
const EXPIRES_AT_MS = CREATED_AT_MS + 90 * 24 * 60 * 60 * 1_000;
const harness = createTestHarness({
  root: nodeUrl.fileURLToPath(new URL("..", import.meta.url)),
  workers: [{ configPath: "./wrangler.test.jsonc" }],
});
const worker = harness.getWorker();
let testEnvironment: TestEnvironment | undefined;

beforeAll(async () => {
  await harness.listen();
  const environment: unknown = await worker.getEnv();
  if (!isTestEnvironment(environment))
    throw new Error("The conversion grant test bindings are unavailable.");
  testEnvironment = environment;
}, 30_000);

afterAll(async () => {
  await harness.close();
});

describe("SQLite conversion grant Durable Object", () => {
  test("replays schema migrations and persists the authoritative record", async () => {
    const grant = grantStub("migration");
    expect(await grant.migrate()).toBe(3);
    expect(await grant.migrate()).toBe(3);
    await grant.initialize(grantId("migration"), CREATED_AT_MS, EXPIRES_AT_MS);

    const storage = await worker.getDurableObjectStorage("CONVERSION_GRANTS", {
      name: "migration",
    });
    const versions = (
      await storage.exec<{ version: number }>(
        "SELECT version FROM _schema_migrations ORDER BY version",
      )
    ).map((row) => row.version);

    expect(versions).toEqual([1, 2, 3]);
    expect((await grant.inspect(CREATED_AT_MS)).state).toBe("open");
  });

  test("installs a non-recoverable verifier and invalidates signed sessions", async () => {
    const id = grantId("session");
    const grant = grantStub("session");
    await grant.initialize(id, CREATED_AT_MS, EXPIRES_AT_MS);
    const root = await createRootCredential();
    expect(await grant.installCredentialVerifier(root.verifier, CREATED_AT_MS)).toBe("installed");
    expect(await grant.installCredentialVerifier("replacement", CREATED_AT_MS)).toBe(
      "already-issued",
    );
    expect((await grant.exchangeCredential("v1.wrong", CREATED_AT_MS)).result).toBe(
      "invalid-credential",
    );

    const exchanged = await grant.exchangeCredential(root.credential, CREATED_AT_MS);
    if (exchanged.result !== "created") throw new Error("Credential exchange failed.");
    expect((await grant.validateSession(exchanged.sessionToken, EXPIRES_AT_MS)).result).toBe(
      "valid",
    );

    await grant.invalidateSessions(CREATED_AT_MS + 1);
    expect((await grant.validateSession(exchanged.sessionToken, CREATED_AT_MS + 2)).result).toBe(
      "invalid",
    );
    expect((await grant.exchangeCredential(root.credential, CREATED_AT_MS + 2)).result).toBe(
      "grant-revoked",
    );
  });

  test("persists the last started conversion phase in SQLite", async () => {
    const grant = grantStub("phase");
    await grant.initialize(grantId("phase"), CREATED_AT_MS, EXPIRES_AT_MS);
    const accepted = await grant.startConversion(
      "https://example.com/phase",
      grantId("phase-request"),
      CREATED_AT_MS,
    );
    if (accepted.result !== "created") throw new Error("Conversion was not accepted.");

    expect(accepted.conversion.lastStartedPhase).toBe(ConversionPhase.CONVERSION_START);
    await grant.recordPhaseStarted(
      accepted.conversion.conversionId,
      ConversionPhase.AUDIO_SEGMENT_PRODUCTION,
    );
    expect((await grant.getConversion(accepted.conversion.conversionId))?.lastStartedPhase).toBe(
      ConversionPhase.AUDIO_SEGMENT_PRODUCTION,
    );

    const storage = await worker.getDurableObjectStorage("CONVERSION_GRANTS", { name: "phase" });
    const rows = await storage.exec<{ last_started_phase: string }>(
      "SELECT last_started_phase FROM conversions WHERE conversion_id = ?",
      accepted.conversion.conversionId,
    );
    expect(rows).toEqual([{ last_started_phase: ConversionPhase.AUDIO_SEGMENT_PRODUCTION }]);
  });

  test("serializes starts, replays request identity, and derives five slots", async () => {
    const grant = grantStub("slots");
    await grant.initialize(grantId("slots"), CREATED_AT_MS, EXPIRES_AT_MS);
    const first = await grant.startConversion(
      "https://example.com/one",
      grantId("request-one"),
      CREATED_AT_MS,
    );
    expect(first.result).toBe("created");
    const replay = await grant.startConversion(
      "https://example.com/one",
      grantId("request-one"),
      CREATED_AT_MS + 1,
    );
    expect(replay.result).toBe("replayed");
    expect(
      (
        await grant.startConversion(
          "https://example.com/conflict",
          grantId("request-one"),
          CREATED_AT_MS + 2,
        )
      ).result,
    ).toBe("idempotency-conflict");

    for (let index = 2; index <= 5; index += 1) {
      const accepted = await grant.startConversion(
        `https://example.com/${index}`,
        grantId(`request-${index}`),
        CREATED_AT_MS + index * 61_000,
      );
      expect(accepted.result).toBe("created");
    }
    const full = await grant.startConversion(
      "https://example.com/six",
      grantId("request-six"),
      CREATED_AT_MS + 6 * 61_000,
    );
    expect(full.result).toBe("temporarily-full");
    expect((await grant.inspect(CREATED_AT_MS + 6 * 61_000)).slots).toEqual({
      remaining: 0,
      reserved: 5,
      spent: 0,
    });

    if (first.result !== "created") throw new Error("The first conversion was not accepted.");
    await grant.recordFailed(first.conversion.conversionId, {
      completedAtMs: CREATED_AT_MS + 7 * 61_000,
      failureCategory: "source-preparation",
      explanation: "The source page could not be loaded.",
      cleanupState: "complete",
    });
    expect((await grant.inspect(CREATED_AT_MS + 7 * 61_000)).slots.remaining).toBe(1);
  });

  test("spends only ready outcomes and rejects contradictory terminals", async () => {
    const grant = grantStub("terminal");
    await grant.initialize(grantId("terminal"), CREATED_AT_MS, EXPIRES_AT_MS);
    const accepted = await grant.startConversion(
      "https://example.com/ready",
      grantId("ready-request"),
      CREATED_AT_MS,
    );
    if (accepted.result !== "created") throw new Error("Conversion was not accepted.");
    const ready = {
      completedAtMs: CREATED_AT_MS + 1,
      title: "Ready",
      audiobookReference: {
        key: "conversions/ready/audiobook.json",
        contentType: "application/json" as const,
        byteLength: 42,
        etag: "ready-etag",
      },
    };
    expect(await grant.recordReady(accepted.conversion.conversionId, ready)).toBe("recorded");
    expect(await grant.recordReady(accepted.conversion.conversionId, ready)).toBe("replayed");
    await expectWorkerRpcRejection(
      grant.recordFailed(accepted.conversion.conversionId, {
        completedAtMs: CREATED_AT_MS + 2,
        failureCategory: "internal",
        explanation: "Contradiction",
      }),
    );
    expect((await grant.inspect(CREATED_AT_MS + 2)).slots).toEqual({
      remaining: 4,
      reserved: 0,
      spent: 1,
    });
  });

  test("records a restarted failed conversion as ready when a slot remains", async () => {
    const grant = grantStub("recovered-terminal");
    await grant.initialize(grantId("recovered-terminal"), CREATED_AT_MS, EXPIRES_AT_MS);
    const accepted = await grant.startConversion(
      "https://example.com/recovered",
      grantId("recovered-request"),
      CREATED_AT_MS,
    );
    if (accepted.result !== "created") throw new Error("Conversion was not accepted.");
    await grant.recordFailed(accepted.conversion.conversionId, {
      completedAtMs: CREATED_AT_MS + 1,
      failureCategory: "source-preparation",
      explanation: "The source page could not be loaded.",
      cleanupState: "complete",
    });

    const ready = {
      completedAtMs: CREATED_AT_MS + 2,
      title: "Recovered",
      audiobookReference: {
        key: `conversions/${accepted.conversion.conversionId}/audiobook.json`,
        contentType: "application/json" as const,
        byteLength: 42,
        etag: "recovered-etag",
      },
    };
    expect(await grant.recordReady(accepted.conversion.conversionId, ready)).toBe("recorded");
    expect(await grant.recordReady(accepted.conversion.conversionId, ready)).toBe("replayed");
    expect((await grant.inspect(CREATED_AT_MS + 2)).slots).toEqual({
      remaining: 4,
      reserved: 0,
      spent: 1,
    });
  });

  test("rejects a restarted failed conversion after its slot has been reused", async () => {
    const grant = grantStub("recovered-full");
    await grant.initialize(grantId("recovered-full"), CREATED_AT_MS, EXPIRES_AT_MS);
    const conversions = [];
    for (let index = 0; index < 5; index += 1) {
      const accepted = await grant.startConversion(
        `https://example.com/recovered-full-${index}`,
        grantId(`full-${index}`),
        CREATED_AT_MS + index * 61_000,
      );
      expect(accepted.result).toBe("created");
      if (accepted.result !== "created") throw new Error("Conversion was not accepted.");
      conversions.push(accepted.conversion);
    }
    const failedConversion = conversions[0];
    if (failedConversion === undefined) throw new Error("Failed conversion is unavailable.");
    await grant.recordFailed(failedConversion.conversionId, {
      completedAtMs: CREATED_AT_MS + 5 * 61_000,
      failureCategory: "source-preparation",
      explanation: "The source page could not be loaded.",
      cleanupState: "complete",
    });
    expect(
      (
        await grant.startConversion(
          "https://example.com/replacement",
          grantId("replacement-request"),
          CREATED_AT_MS + 6 * 61_000,
        )
      ).result,
    ).toBe("created");

    await expectWorkerRpcRejection(
      grant.recordReady(failedConversion.conversionId, {
        completedAtMs: CREATED_AT_MS + 7 * 61_000,
        title: "Recovered too late",
        audiobookReference: {
          key: `conversions/${failedConversion.conversionId}/audiobook.json`,
          contentType: "application/json",
          byteLength: 42,
          etag: "recovered-full-etag",
        },
      }),
    );
    expect((await grant.inspect(CREATED_AT_MS + 7 * 61_000)).slots).toEqual({
      remaining: 0,
      reserved: 5,
      spent: 0,
    });
  });

  test("enforces a rolling start limit without accepting an extra conversion", async () => {
    const grant = grantStub("rate-limit");
    await grant.initialize(grantId("rate-limit"), CREATED_AT_MS, EXPIRES_AT_MS);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        grant.startConversion(
          `https://example.com/rate-${index}`,
          grantId(`rate-request-${index}`),
          CREATED_AT_MS,
        ),
      ),
    );
    expect(results.filter((result) => result.result === "created")).toHaveLength(5);
    expect(results.filter((result) => result.result === "rate-limited")).toHaveLength(1);
    expect(await grant.listConversions()).toHaveLength(5);
  });
});

describe("SQLite conversion grant Registry Durable Object", () => {
  test("binds request IDs, pages snapshots, and rejects same-revision conflicts", async () => {
    const registry = registryStub("registry");
    expect(await registry.migrate()).toBe(1);
    const first = await registry.reserveProvisioning(
      grantId("provision-one"),
      "Alpha",
      CREATED_AT_MS,
    );
    expect(first.created).toBe(true);
    expect(
      (await registry.reserveProvisioning(grantId("provision-one"), "Alpha", CREATED_AT_MS + 1))
        .entry.grantId,
    ).toBe(first.entry.grantId);
    await expectWorkerRpcRejection(
      registry.reserveProvisioning(grantId("provision-one"), "Different", CREATED_AT_MS + 1),
    );

    const grantSnapshot = {
      grantId: first.entry.grantId,
      revision: 1,
      reserved: 0,
      spent: 0,
      schemaVersion: 2,
    };
    await registry.activate(first.entry.requestId, grantSnapshot, true);
    expect(await registry.applyGrantRegistrySnapshot(grantSnapshot)).toBe("replayed");
    expect(await registry.applyGrantRegistrySnapshot({ ...grantSnapshot, revision: 0 })).toBe(
      "stale",
    );
    await expectWorkerRpcRejection(
      registry.applyGrantRegistrySnapshot({ ...grantSnapshot, reserved: 1 }),
    );

    const second = await registry.reserveProvisioning(
      grantId("provision-two"),
      "Alpha two",
      CREATED_AT_MS + 1,
    );
    await registry.activate(
      second.entry.requestId,
      { ...grantSnapshot, grantId: second.entry.grantId },
      true,
    );
    const firstPage = await registry.listGrants({ label: "alpha", limit: 1 }, CREATED_AT_MS + 2);
    expect(firstPage.grants).toHaveLength(1);
    expect(firstPage.nextCursor).toBeDefined();
    if (firstPage.nextCursor === undefined) throw new Error("The first page has no cursor.");
    const secondPage = await registry.listGrants(
      { label: "alpha", limit: 1, cursor: firstPage.nextCursor },
      CREATED_AT_MS + 2,
    );
    expect(secondPage.grants).toHaveLength(1);
    expect(secondPage.grants[0]?.grantId).not.toBe(firstPage.grants[0]?.grantId);
  });
});

function grantStub(name: string) {
  const environment = getTestEnvironment();
  return environment.CONVERSION_GRANTS.get(environment.CONVERSION_GRANTS.idFromName(name));
}

function registryStub(name: string) {
  const environment = getTestEnvironment();
  return environment.CONVERSION_GRANT_REGISTRY.get(
    environment.CONVERSION_GRANT_REGISTRY.idFromName(name),
  );
}

function getTestEnvironment(): TestEnvironment {
  if (testEnvironment === undefined)
    throw new Error("The conversion grant test environment is unavailable.");
  return testEnvironment;
}

async function expectWorkerRpcRejection(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch {
    // Wrangler currently hides the Durable Object's original error behind its RPC transport.
    return;
  }
  throw new Error("The Durable Object operation was expected to reject.");
}

function isTestEnvironment(value: unknown): value is TestEnvironment {
  return (
    isRecord(value) &&
    isNamespaceShape(value["CONVERSION_GRANTS"]) &&
    isNamespaceShape(value["CONVERSION_GRANT_REGISTRY"])
  );
}

function isNamespaceShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value["get"] === "function" &&
    typeof value["idFromName"] === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function grantId(seed: string): string {
  const bytes = new TextEncoder().encode(seed);
  const hex = Array.from({ length: 32 }, (_, index) =>
    (bytes[index % bytes.length] ?? 0).toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
