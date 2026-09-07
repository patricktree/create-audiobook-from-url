import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const qaRoot = path.join(root, "qa/e2e");
let worker: ChildProcess | undefined;
let persistenceDirectory: string | undefined;
let origin: string;

beforeAll(async () => {
  const port = await reservePort();
  origin = `http://127.0.0.1:${port}`;
  persistenceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "trial-link-worker-"));
  worker = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      "wrangler.jsonc",
      "--ip",
      "127.0.0.1",
      "--port",
      port.toString(),
      "--persist-to",
      persistenceDirectory,
    ],
    { cwd: qaRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  await waitUntilReady(origin, worker);
}, 30_000);

afterAll(async () => {
  if (worker !== undefined && worker.exitCode === null) {
    killProcessGroup(worker, "SIGTERM");
    await new Promise<void>((resolve) => worker?.once("exit", () => resolve()));
  }
  if (persistenceDirectory !== undefined)
    await fs.rm(persistenceDirectory, { recursive: true, force: true });
});

test("rejects cross-origin browser mutations before they reach the grant", async () => {
  const response = await fetch(`${origin}/api/grants/${crypto.randomUUID()}/conversions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      Origin: "https://example.com",
      "X-Create-Audiobook-From-URL-Request": "1",
    },
    body: JSON.stringify({ sourceUrl: "https://example.com/source" }),
  });
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: "origin-forbidden" } });
});

test("returns 405 and Allow for unsupported methods on known API routes", async () => {
  const response = await fetch(`${origin}/api/grants/${crypto.randomUUID()}`, { method: "POST" });
  expect(response.status).toBe(405);
  expect(response.headers.get("Allow")).toBe("GET");
  await expect(response.json()).resolves.toMatchObject({ error: { code: "method-not-allowed" } });
});

async function reservePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No Worker test port.");
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return port;
}

async function waitUntilReady(url: string, process: ChildProcess): Promise<void> {
  let stderr = "";
  process.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null) throw new Error(`Wrangler exited early.\n${stderr}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Wrangler has not bound its local port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Wrangler did not start.\n${stderr}`);
}

function killProcessGroup(process: ChildProcess, signal: NodeJS.Signals): void {
  if (process.pid === undefined || process.exitCode !== null) return;
  try {
    globalThis.process.kill(-process.pid, signal);
  } catch (error) {
    if (!isNoSuchProcessError(error)) throw error;
  }
}

function isNoSuchProcessError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

test("updates only the selected grant allowance through the authenticated operator API", async () => {
  const headers = { "Content-Type": "application/json", "Cf-Access-Token": "local-access-token" };
  const response = await fetch(`${origin}/api/operator/grants`, {
    method: "POST",
    headers,
    body: JSON.stringify({ label: "Allowance test", requestId: crypto.randomUUID() }),
  });
  expect(response.status).toBe(201);
  const created: unknown = await response.json();
  if (
    typeof created !== "object" ||
    created === null ||
    !("grantId" in created) ||
    typeof created.grantId !== "string"
  )
    throw new Error("Grant creation did not return an ID");
  const url = `${origin}/api/operator/grants/${created.grantId}/allowance`;
  expect(
    (
      await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxSlots: 20 }),
      })
    ).status,
  ).toBe(401);
  for (const maxSlots of [0, -1, 1.5])
    expect(
      (await fetch(url, { method: "PUT", headers, body: JSON.stringify({ maxSlots }) })).status,
    ).toBe(400);
  const updated = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ maxSlots: 20 }),
  });
  expect(updated.status).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    changed: true,
    grant: { slots: { remaining: 20, reserved: 0, spent: 0 } },
  });
  const inspected = await fetch(`${origin}/api/operator/grants/${created.grantId}`, { headers });
  await expect(inspected.json()).resolves.toMatchObject({
    authoritative: { slots: { remaining: 20 } },
    registrySnapshotDisagreement: false,
  });
  const missing = await fetch(`${origin}/api/operator/grants/${crypto.randomUUID()}/allowance`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ maxSlots: 20 }),
  });
  expect(missing.status).toBe(404);
});
