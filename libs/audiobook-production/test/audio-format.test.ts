import { expect, test } from "vitest";

import { analyzeMp3 } from "#src/audio-format.ts";

test("derives exact duration and removable tag boundaries from MP3 frames", () => {
  const frame = createMpeg2Layer3Frame();
  const id3v2 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  const id3v1 = new Uint8Array(128);

  id3v1.set([0x54, 0x41, 0x47]);

  const audio = concatenate(id3v2, frame, frame, id3v1);

  expect(analyzeMp3(audio)).toEqual({
    audioStart: id3v2.byteLength,
    audioEnd: id3v2.byteLength + frame.byteLength * 2,
    durationMilliseconds: 48,
  });
});

test("rejects non-frame bytes between MPEG audio frames", () => {
  const frame = createMpeg2Layer3Frame();

  expect(() => analyzeMp3(concatenate(frame, new Uint8Array([0])))).toThrow(
    "incomplete frame header",
  );
});

function createMpeg2Layer3Frame(): Uint8Array {
  const frame = new Uint8Array(384);

  frame.set([0xff, 0xf3, 0xc4, 0xc0]);

  return frame;
}

function concatenate(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}
