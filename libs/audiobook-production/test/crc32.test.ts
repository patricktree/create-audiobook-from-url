import { expect, test } from "vitest";

import { calculateCrc32 } from "#src/crc32.ts";

test("calculates the standard CRC-32 check value", () => {
  expect(calculateCrc32(new TextEncoder().encode("123456789"))).toBe(0xcbf4_3926);
});
