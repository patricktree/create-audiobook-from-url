/** Calculates the standard CRC-32 used by MP3 metadata and ZIP entries. */
export function calculateCrc32(bytes: Uint8Array): number {
  let crc32 = 0xffff_ffff;

  for (const byte of bytes) {
    crc32 ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc32 = (crc32 >>> 1) ^ (crc32 & 1 ? 0xedb8_8320 : 0);
    }
  }

  return (crc32 ^ 0xffff_ffff) >>> 0;
}
