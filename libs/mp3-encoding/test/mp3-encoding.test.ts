import { expect, test } from "vitest";

import { encodePcmAsMp3 } from "#src/mp3-encoding.ts";

const SAMPLE_RATE = 24_000;
const ENCODING_OPTIONS = {
  bitrateKilobitsPerSecond: 128,
  sampleRate: SAMPLE_RATE,
};

test("encodes mono signed 16-bit PCM as MP3", async () => {
  const sampleCount = SAMPLE_RATE / 10;
  const pcm = new Uint8Array(sampleCount * 2);
  const view = new DataView(pcm.buffer);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin((index / SAMPLE_RATE) * 440 * Math.PI * 2) * 8_000);

    view.setInt16(index * 2, sample, true);
  }

  const mp3 = await encodePcmAsMp3(pcm, ENCODING_OPTIONS);

  expect(mp3.byteLength).toBeGreaterThan(0);
  expect(mp3[0]).toBe(0xff);
  expect((mp3[1] ?? 0) & 0xe0).toBe(0xe0);
});

test("rejects PCM containing incomplete samples", async () => {
  await expect(encodePcmAsMp3(new Uint8Array([0]), ENCODING_OPTIONS)).rejects.toThrow(
    "complete signed 16-bit samples",
  );
});

test.each([
  ["PCM sample rate", { ...ENCODING_OPTIONS, sampleRate: 0 }],
  ["MP3 bitrate", { ...ENCODING_OPTIONS, bitrateKilobitsPerSecond: 1.5 }],
])("rejects an invalid %s", async (expectedMessage, options) => {
  await expect(encodePcmAsMp3(new Uint8Array([0, 0]), options)).rejects.toThrow(expectedMessage);
});
