import { strFromU8, unzipSync } from "fflate";
import { afterEach, expect, test, vi } from "vitest";

import { createAudioSegmentMetadata } from "#src/audio-segment-storage.ts";
import {
  exportEpub,
  type Audiobook,
  type AudioSegmentReference,
  type ExportOptions,
} from "#src/audiobook-production.ts";
import { calculateCrc32 } from "#src/crc32.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("exports an EPUB 3 publication with one Media Overlay audio resource per unit", async () => {
  vi.stubGlobal(
    "FixedLengthStream",
    class extends TransformStream<Uint8Array, Uint8Array> {
      constructor(expectedLength: number) {
        super({});

        if (expectedLength <= 0) {
          throw new Error("Expected a positive fixed stream length");
        }
      }
    },
  );

  const segmentBytes = createMpeg2Layer3Frame();
  const crc32 = calculateCrc32(segmentBytes);
  const audioSegments: AudioSegmentReference[] = [
    {
      conversionId: "conversion-id",
      sequence: 0,
      key: "conversions/conversion-id/audio-segments/0.mp3",
      byteLength: segmentBytes.byteLength,
      durationMilliseconds: 24,
      crc32,
    },
    {
      conversionId: "conversion-id",
      sequence: 1,
      key: "conversions/conversion-id/audio-segments/1.mp3",
      byteLength: segmentBytes.byteLength,
      durationMilliseconds: 24,
      crc32,
    },
  ];
  const audiobook: Audiobook = {
    title: "A document & more",
    originalUrl: "https://example.com/source?a=1&b=2",
    narrationDocument: {
      html: '<h1 id="synchronization-unit-1">A document &amp; more</h1><p id="synchronization-unit-2">Body<br>text.</p>',
      synchronizationUnits: [
        { id: "synchronization-unit-1", narrationText: "A document & more" },
        { id: "synchronization-unit-2", narrationText: "Body text." },
      ],
    },
    audio: {
      key: "conversions/conversion-id/audiobook.mp3",
      contentType: "audio/mpeg",
      byteLength: segmentBytes.byteLength * 2,
      durationMilliseconds: 48,
      etag: "audio-etag",
    },
    synchronizationCues: [
      {
        synchronizationUnitId: "synchronization-unit-1",
        startMilliseconds: 0,
        endMilliseconds: 24,
      },
      {
        synchronizationUnitId: "synchronization-unit-2",
        startMilliseconds: 24,
        endMilliseconds: 48,
      },
    ],
  };
  const { bucket, getArchive } = createTestBucket(audioSegments, segmentBytes);

  await expect(
    exportEpub({
      bucket,
      conversionId: "conversion-id",
      audiobook,
      audioSegments,
      modifiedAt: "2026-08-25T12:34:56.789Z",
    }),
  ).resolves.toMatchObject({
    key: "conversions/conversion-id/audiobook.epub",
    contentType: "application/epub+zip",
  });

  const archive = getArchive();
  const entries = unzipSync(archive);
  const packageDocument = strFromU8(entries["EPUB/package.opf"]!);
  const contentDocument = strFromU8(entries["EPUB/content.xhtml"]!);
  const mediaOverlay = strFromU8(entries["EPUB/overlay.smil"]!);

  expect(strFromU8(entries["mimetype"]!)).toBe("application/epub+zip");
  expect(readFirstLocalFileName(archive)).toBe("mimetype");
  expect(packageDocument).toContain("<dc:title>A document &amp; more</dc:title>");
  expect(packageDocument).toContain("2026-08-25T12:34:56Z");
  expect(contentDocument).toContain("Body<br/>text.");
  expect(mediaOverlay).toContain('src="content.xhtml#synchronization-unit-2"');
  expect(mediaOverlay).toContain('src="audio/00002.mp3"');
  expect(mediaOverlay).toContain('clipBegin="0.000s" clipEnd="0.024s"');
  expect(entries["EPUB/audio/00001.mp3"]).toEqual(segmentBytes);
  expect(entries["EPUB/audio/00002.mp3"]).toEqual(segmentBytes);
});

function createTestBucket(
  audioSegments: readonly AudioSegmentReference[],
  segmentBytes: Uint8Array,
): { bucket: ExportOptions["bucket"]; getArchive: () => Uint8Array } {
  let archive: Uint8Array | undefined;
  const segmentByKey = new Map(audioSegments.map((segment) => [segment.key, segment]));
  const bucket: ExportOptions["bucket"] = {
    get: async (key: string) => {
      const segment = segmentByKey.get(key);

      if (!segment) {
        return null;
      }

      return {
        key,
        size: segment.byteLength,
        httpMetadata: { contentType: "audio/mpeg" },
        customMetadata: createAudioSegmentMetadata(
          segment.sequence === 0 ? "A document & more" : "Body text.",
          segment.durationMilliseconds,
          segment.crc32,
        ),
        body: new Blob([new Uint8Array(segmentBytes).buffer]).stream(),
      };
    },
    put: async (key: string, value: ReadableStream<Uint8Array>) => {
      archive = new Uint8Array(await new Response(value).arrayBuffer());

      return {
        key,
        size: archive.byteLength,
        etag: "epub-etag",
      };
    },
  };

  return {
    bucket,
    getArchive: () => {
      if (!archive) {
        throw new Error("Expected the EPUB upload to be captured");
      }

      return archive;
    },
  };
}

function createMpeg2Layer3Frame(): Uint8Array {
  const frame = new Uint8Array(384);

  frame.set([0xff, 0xf3, 0xc4, 0xc0]);

  return frame;
}

function readFirstLocalFileName(archive: Uint8Array): string {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const fileNameLength = view.getUint16(26, true);

  return strFromU8(archive.subarray(30, 30 + fileNameLength));
}
