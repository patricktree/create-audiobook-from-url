import crypto from "node:crypto";
import fs from "node:fs";
import { expect, test } from "vitest";

const EXPECTED_ENCODER_SHA256 = "16d5405c410cf202a56af41d9ee98f88bcffde463cd73273102c4e6034695a0b";

test("uses the reviewed MP3 encoder artifact", () => {
  const bytes = fs.readFileSync(new URL("../src/mp3-encoder.wasm", import.meta.url));

  expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_ENCODER_SHA256);
});

test("limits the MP3 encoder artifact to reviewed imports", () => {
  const bytes = fs.readFileSync(new URL("../src/mp3-encoder.wasm", import.meta.url));
  const module = new WebAssembly.Module(bytes);

  expect(WebAssembly.Module.imports(module)).toEqual([
    {
      kind: "function",
      module: "env",
      name: "emscripten_notify_memory_growth",
    },
    {
      kind: "function",
      module: "wasi_snapshot_preview1",
      name: "proc_exit",
    },
    {
      kind: "function",
      module: "wasi_snapshot_preview1",
      name: "fd_close",
    },
    {
      kind: "function",
      module: "wasi_snapshot_preview1",
      name: "fd_write",
    },
    {
      kind: "function",
      module: "wasi_snapshot_preview1",
      name: "fd_seek",
    },
  ]);
});

test("rejects invalid and stale native encoder handles", () => {
  const bytes = fs.readFileSync(new URL("../src/mp3-encoder.wasm", import.meta.url));
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module, {
    env: {
      emscripten_notify_memory_growth() {},
    },
    wasi_snapshot_preview1: {
      fd_close: denyFileDescriptorOperation,
      fd_seek: denyFileDescriptorOperation,
      fd_write: denyFileDescriptorOperation,
      proc_exit(exitCode: number) {
        throw new Error(`LAME MP3 encoder exited unexpectedly with status ${exitCode}`);
      },
    },
  });
  const initialize = getExportedFunction(instance.exports, "_initialize");
  const encoderCreate = getExportedFunction(instance.exports, "encoder_create");
  const encoderEncode = getExportedFunction(instance.exports, "encoder_encode");
  const encoderFlush = getExportedFunction(instance.exports, "encoder_flush");
  const encoderFree = getExportedFunction(instance.exports, "encoder_free");
  const encoderGetMp3 = getExportedFunction(instance.exports, "encoder_get_mp3");
  const encoderGetPcm = getExportedFunction(instance.exports, "encoder_get_pcm");

  initialize();

  const encoder = encoderCreate(24_000, 128);
  expect(typeof encoder).toBe("number");
  if (typeof encoder !== "number") {
    throw new Error("LAME MP3 encoder did not return a numeric handle");
  }

  expect(encoder).toBeGreaterThan(0);
  expect(encoderEncode(encoder, 4_609)).toBe(-1);
  encoderFree(encoder);

  for (const invalidEncoder of [0, 1, encoder]) {
    expect(encoderGetPcm(invalidEncoder)).toBe(0);
    expect(encoderGetMp3(invalidEncoder)).toBe(0);
    expect(encoderEncode(invalidEncoder, 1)).toBe(-1);
    expect(encoderFlush(invalidEncoder)).toBe(-1);
    expect(() => encoderFree(invalidEncoder)).not.toThrow();
  }
});

function denyFileDescriptorOperation(): number {
  return 8;
}

function getExportedFunction(
  exports: WebAssembly.Exports,
  name: string,
): (...parameters: number[]) => unknown {
  const exportedFunction = exports[name];

  if (typeof exportedFunction !== "function") {
    throw new Error(`LAME MP3 encoder does not export function ${name}`);
  }

  return (...parameters) => exportedFunction(...parameters);
}
