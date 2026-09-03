const PCM_SAMPLE_BYTE_LENGTH = 2;
// Must match the capacity compiled into the narrow LAME bridge.
const CHUNK_SAMPLE_COUNT = 4_608;
const MAX_CHUNK_BYTE_LENGTH = (CHUNK_SAMPLE_COUNT * 5) / 4 + 7_200;
const WASI_BAD_FILE_DESCRIPTOR = 8;

/** Configures mono signed 16-bit little-endian PCM encoding. */
export type EncodeOptions = {
  bitrateKilobitsPerSecond: number;
  sampleRate: number;
};

type EncoderExports = {
  memory: WebAssembly.Memory;
  initialize(): void;
  encoder_create(sampleRate: number, bitrate: number): number;
  encoder_encode(encoder: number, sampleCount: number): number;
  encoder_flush(encoder: number): number;
  encoder_free(encoder: number): void;
  encoder_get_mp3(encoder: number): number;
  encoder_get_pcm(encoder: number): number;
};

/** Encodes mono signed 16-bit little-endian PCM as a self-contained MP3. */
export async function encodePcmAsMp3(pcm: Uint8Array, options: EncodeOptions): Promise<Uint8Array> {
  assertPositiveInteger(options.sampleRate, "PCM sample rate");
  assertPositiveInteger(options.bitrateKilobitsPerSecond, "MP3 bitrate");

  if (pcm.byteLength === 0 || pcm.byteLength % PCM_SAMPLE_BYTE_LENGTH !== 0) {
    throw new Error(
      `PCM audio byte length must contain complete signed 16-bit samples: ${pcm.byteLength}`,
    );
  }

  const wasm = await instantiateEncoder();
  const encoder = wasm.encoder_create(options.sampleRate, options.bitrateKilobitsPerSecond);

  if (encoder === 0) {
    throw new Error("LAME MP3 encoder initialization failed");
  }

  try {
    return encodePcm(wasm, encoder, pcm);
  } finally {
    wasm.encoder_free(encoder);
  }
}

async function instantiateEncoder(): Promise<EncoderExports> {
  const { default: mp3EncoderModule } = await import("#src/mp3-encoder.wasm");
  const instance = await WebAssembly.instantiate(mp3EncoderModule, {
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
  const { exports } = instance;
  const { memory } = exports;

  if (!(memory instanceof WebAssembly.Memory)) {
    throw new Error("LAME MP3 encoder does not export WebAssembly memory");
  }

  const wasm = {
    memory,
    initialize() {
      callVoidExport(exports, "_initialize");
    },
    encoder_create(sampleRate, bitrate) {
      return callNumberExport(exports, "encoder_create", sampleRate, bitrate);
    },
    encoder_encode(encoder, sampleCount) {
      return callNumberExport(exports, "encoder_encode", encoder, sampleCount);
    },
    encoder_flush(encoder) {
      return callNumberExport(exports, "encoder_flush", encoder);
    },
    encoder_free(encoder) {
      callVoidExport(exports, "encoder_free", encoder);
    },
    encoder_get_mp3(encoder) {
      return callNumberExport(exports, "encoder_get_mp3", encoder);
    },
    encoder_get_pcm(encoder) {
      return callNumberExport(exports, "encoder_get_pcm", encoder);
    },
  } satisfies EncoderExports;

  wasm.initialize();

  return wasm;
}

function encodePcm(wasm: EncoderExports, encoder: number, pcm: Uint8Array): Uint8Array {
  const encodedChunks: Uint8Array[] = [];
  let encodedByteLength = 0;

  for (
    let byteOffset = 0;
    byteOffset < pcm.byteLength;
    byteOffset += CHUNK_SAMPLE_COUNT * PCM_SAMPLE_BYTE_LENGTH
  ) {
    const chunk = pcm.subarray(
      byteOffset,
      Math.min(byteOffset + CHUNK_SAMPLE_COUNT * PCM_SAMPLE_BYTE_LENGTH, pcm.byteLength),
    );
    const inputPointer = wasm.encoder_get_pcm(encoder);

    if (inputPointer === 0) {
      throw new Error("LAME MP3 encoder did not provide an input buffer");
    }

    new Uint8Array(wasm.memory.buffer, inputPointer, chunk.byteLength).set(chunk);
    encodedByteLength += appendEncodedChunk(
      encodedChunks,
      wasm,
      encoder,
      wasm.encoder_encode(encoder, chunk.byteLength / PCM_SAMPLE_BYTE_LENGTH),
    );
  }

  encodedByteLength += appendEncodedChunk(
    encodedChunks,
    wasm,
    encoder,
    wasm.encoder_flush(encoder),
  );

  const mp3 = new Uint8Array(encodedByteLength);
  let outputOffset = 0;

  for (const chunk of encodedChunks) {
    mp3.set(chunk, outputOffset);
    outputOffset += chunk.byteLength;
  }

  return mp3;
}

function appendEncodedChunk(
  chunks: Uint8Array[],
  wasm: EncoderExports,
  encoder: number,
  encodedByteLength: number,
): number {
  if (encodedByteLength < 0) {
    throw new Error(`LAME MP3 encoding failed with status ${encodedByteLength}`);
  }

  if (encodedByteLength > MAX_CHUNK_BYTE_LENGTH) {
    throw new Error(`LAME MP3 encoder returned an oversized chunk: ${encodedByteLength} bytes`);
  }

  if (encodedByteLength === 0) {
    return 0;
  }

  const outputPointer = wasm.encoder_get_mp3(encoder);

  if (outputPointer === 0) {
    throw new Error("LAME MP3 encoder did not provide an output buffer");
  }

  chunks.push(new Uint8Array(wasm.memory.buffer, outputPointer, encodedByteLength).slice());

  return encodedByteLength;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer: ${value}`);
  }
}

function denyFileDescriptorOperation(): number {
  return WASI_BAD_FILE_DESCRIPTOR;
}

function callNumberExport(
  exports: WebAssembly.Exports,
  name: string,
  ...parameters: number[]
): number {
  const exportedFunction = exports[name];

  if (typeof exportedFunction !== "function") {
    throw new Error(`LAME MP3 encoder does not export function ${name}`);
  }

  const result: unknown = exportedFunction(...parameters);

  if (typeof result !== "number") {
    throw new Error(`LAME MP3 encoder function ${name} did not return a number`);
  }

  return result;
}

function callVoidExport(exports: WebAssembly.Exports, name: string, ...parameters: number[]): void {
  const exportedFunction = exports[name];

  if (typeof exportedFunction !== "function") {
    throw new Error(`LAME MP3 encoder does not export function ${name}`);
  }

  exportedFunction(...parameters);
}
