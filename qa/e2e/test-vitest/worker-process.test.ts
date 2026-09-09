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

test("exchanges native sessions and authorizes grant and conversion requests without cookies", async () => {
  const grant = await createTrial();
  const response = await fetch(`${origin}/api/grants/${grant.grantId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      "X-Grant-Session-Transport": "bearer",
    },
    body: JSON.stringify({ credential: grant.credential }),
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("Set-Cookie")).toBeNull();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const token = response.headers.get("X-Grant-Session");
  expect(token).toMatch(/^v1\./);
  const headers = { Authorization: `Bearer ${token}` };
  const snapshot = await fetch(`${origin}/api/grants/${grant.grantId}`, { headers });
  expect(snapshot.status).toBe(200);
  expect(snapshot.headers.get("Set-Cookie")).toBeNull();
  const history = await fetch(`${origin}/api/grants/${grant.grantId}/conversions`, { headers });
  expect(history.status).toBe(200);
  expect(history.headers.get("Set-Cookie")).toBeNull();

  const start = await fetch(`${origin}/api/grants/${grant.grantId}/conversions`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ sourceUrl: "https://source.example.test/fixture" }),
  });
  expect(start.status).toBe(202);
  const started: unknown = await start.json();
  if (typeof started !== "object" || started === null || !("conversion" in started)) {
    throw new Error("Missing conversion");
  }
  const conversion = started.conversion;
  if (
    typeof conversion !== "object" ||
    conversion === null ||
    !("conversionId" in conversion) ||
    typeof conversion.conversionId !== "string"
  ) {
    throw new Error("Missing conversion ID");
  }
  const detail = await fetch(`${origin}/api/conversions/${conversion.conversionId}`, { headers });
  expect(detail.status).toBe(200);
  expect(detail.headers.get("Set-Cookie")).toBeNull();
  const otherGrant = await createTrial();
  expect((await fetch(`${origin}/api/grants/${otherGrant.grantId}`, { headers })).status).toBe(401);

  const revocation = await fetch(`${origin}/api/operator/grants/${grant.grantId}/revocation`, {
    method: "POST",
    headers: { "Cf-Access-Token": "local-access-token", "Content-Type": "application/json" },
    body: "{}",
  });
  expect(revocation.status).toBe(200);
  expect((await fetch(`${origin}/api/grants/${grant.grantId}`, { headers })).status).toBe(200);
  const revokedStart = await fetch(`${origin}/api/grants/${grant.grantId}/conversions`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ sourceUrl: "https://source.example.test/fixture" }),
  });
  expect(revokedStart.status).toBe(403);
});

test("keeps persistent browser cookies and never falls back from invalid bearer authentication", async () => {
  const grant = await createTrial();
  const response = await fetch(`${origin}/api/grants/${grant.grantId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      Origin: origin,
    },
    body: JSON.stringify({ credential: grant.credential }),
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("X-Grant-Session")).toBeNull();
  const cookie = response.headers.get("Set-Cookie");
  expect(cookie).toContain("HttpOnly; SameSite=Lax");
  const cookieHeader = cookie?.split(";")[0] ?? "";
  expect(
    (await fetch(`${origin}/api/grants/${grant.grantId}`, { headers: { Cookie: cookieHeader } }))
      .status,
  ).toBe(200);
  for (const authorization of ["Bearer invalid", "Basic invalid", "Bearer"]) {
    const invalid = await fetch(`${origin}/api/grants/${grant.grantId}`, {
      headers: { Cookie: cookieHeader, Authorization: authorization },
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("Set-Cookie")).toBeNull();
  }
  const invalidStart = await fetch(`${origin}/api/grants/${grant.grantId}/conversions`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      Authorization: "Bearer invalid",
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ sourceUrl: "https://source.example.test/fixture" }),
  });
  expect(invalidStart.status).toBe(401);
});

test("native exchange requires a valid credential and refuses other browser origins", async () => {
  const grant = await createTrial();
  for (const extraHeaders of [
    { Origin: origin },
    { Origin: "https://evil.example" },
    { Cookie: "session=test" },
  ]) {
    const response = await fetch(`${origin}/api/grants/${grant.grantId}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Create-Audiobook-From-URL-Request": "1",
        "X-Grant-Session-Transport": "bearer",
        ...extraHeaders,
      },
      body: JSON.stringify({ credential: grant.credential }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("X-Grant-Session")).toBeNull();
  }
  const invalid = await fetch(`${origin}/api/grants/${grant.grantId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      "X-Grant-Session-Transport": "bearer",
    },
    body: JSON.stringify({ credential: `v1.${"a".repeat(43)}` }),
  });
  expect(invalid.status).toBe(401);
  expect(invalid.headers.get("X-Grant-Session")).toBeNull();
});

async function createTrial(): Promise<{ grantId: string; credential: string }> {
  const response = await fetch(`${origin}/api/operator/grants`, {
    method: "POST",
    headers: { "Cf-Access-Token": "local-access-token", "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Native auth test", requestId: crypto.randomUUID() }),
  });
  expect(response.status).toBe(201);
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("grantId" in body) ||
    typeof body.grantId !== "string" ||
    !("trialLink" in body) ||
    typeof body.trialLink !== "string"
  ) {
    throw new Error("Invalid grant creation response");
  }
  const credential = new URLSearchParams(new URL(body.trialLink).hash.slice(1)).get("credential");
  if (credential === null) throw new Error("Missing trial credential");
  return { grantId: body.grantId, credential };
}

test("allows Capacitor fetch preflight and exposes the exchanged bearer session", async () => {
  const grant = await createTrial();
  const url = `${origin}/api/grants/${grant.grantId}/sessions`;
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: "https://localhost",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-grant-session-transport,authorization",
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost");
  expect(preflight.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
    "authorization",
  );
  expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Origin: "https://localhost",
      "Content-Type": "application/json",
      "X-Create-Audiobook-From-URL-Request": "1",
      "X-Grant-Session-Transport": "bearer",
    },
    body: JSON.stringify({ credential: grant.credential }),
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://localhost");
  expect(response.headers.get("Access-Control-Expose-Headers")).toContain("X-Grant-Session");
  expect(response.headers.get("X-Grant-Session")).toBeTruthy();
  expect(response.headers.get("Set-Cookie")).toBeNull();
});
