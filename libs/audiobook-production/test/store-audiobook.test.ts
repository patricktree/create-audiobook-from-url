import { expect, test } from "vitest";

import { loadAudiobook, storeAudiobook, type StoreOptions } from "#src/audiobook-production.ts";

test("stores a canonical audiobook with cues derived from its ordered audio segments", async () => {
  const { bucket, storedObjects } = createTestBucket();

  const audiobookReference = await storeAudiobook({
    bucket,
    conversionId: "conversion-id",
    title: "A document",
    originalUrl: "https://example.com/source",
    narrationDocument: {
      html: '<h1 id="synchronization-unit-1">A document</h1><p id="synchronization-unit-2">Body text.</p>',
      synchronizationUnits: [
        { id: "synchronization-unit-1", narrationText: "A document" },
        { id: "synchronization-unit-2", narrationText: "Body text." },
      ],
    },
    audio: {
      key: "conversions/conversion-id/audiobook.mp3",
      contentType: "audio/mpeg",
      byteLength: 72_000,
      durationMilliseconds: 1_500,
      etag: "audio-etag",
    },
    audioSegments: [
      {
        conversionId: "conversion-id",
        sequence: 0,
        key: "conversions/conversion-id/audio-segments/0.mp3",
        byteLength: 48_000,
        durationMilliseconds: 1_000,
        crc32: 0,
      },
      {
        conversionId: "conversion-id",
        sequence: 1,
        key: "conversions/conversion-id/audio-segments/1.mp3",
        byteLength: 24_000,
        durationMilliseconds: 500,
        crc32: 0,
      },
    ],
  });

  const storedObject = storedObjects.get("conversions/conversion-id/audiobook.json");

  expect(storedObject?.httpMetadata).toEqual({ contentType: "application/json" });
  expect(JSON.parse(storedObject?.body ?? "")).toEqual({
    title: "A document",
    originalUrl: "https://example.com/source",
    narrationDocument: {
      html: '<h1 id="synchronization-unit-1">A document</h1><p id="synchronization-unit-2">Body text.</p>',
      synchronizationUnits: [
        { id: "synchronization-unit-1", narrationText: "A document" },
        { id: "synchronization-unit-2", narrationText: "Body text." },
      ],
    },
    audio: {
      key: "conversions/conversion-id/audiobook.mp3",
      contentType: "audio/mpeg",
      byteLength: 72_000,
      durationMilliseconds: 1_500,
      etag: "audio-etag",
    },
    synchronizationCues: [
      {
        synchronizationUnitId: "synchronization-unit-1",
        startMilliseconds: 0,
        endMilliseconds: 1_000,
      },
      {
        synchronizationUnitId: "synchronization-unit-2",
        startMilliseconds: 1_000,
        endMilliseconds: 1_500,
      },
    ],
  });
  expect(audiobookReference).toEqual({
    key: "conversions/conversion-id/audiobook.json",
    contentType: "application/json",
    byteLength: new TextEncoder().encode(storedObject?.body).byteLength,
    etag: "manifest-etag",
  });
  await expect(loadAudiobook({ bucket, audiobookReference })).resolves.toEqual(
    JSON.parse(storedObject?.body ?? ""),
  );

  const incompleteManifestBody = storedObject?.body.replace(
    '"endMilliseconds":1500',
    '"endMilliseconds":1400',
  );

  expect(incompleteManifestBody).not.toBe(storedObject?.body);
  storedObjects.set("conversions/conversion-id/audiobook.json", {
    body: incompleteManifestBody ?? "",
    httpMetadata: { contentType: "application/json" },
  });
  await expect(loadAudiobook({ bucket, audiobookReference })).rejects.toThrow(
    "Audiobook synchronization cues must span its playback audio",
  );
});

test("rejects playback audio that does not exactly contain the referenced segments", async () => {
  const { bucket } = createTestBucket();

  await expect(
    storeAudiobook({
      bucket,
      conversionId: "conversion-id",
      title: "A document",
      originalUrl: "https://example.com/source",
      narrationDocument: {
        html: '<h1 id="synchronization-unit-1">A document</h1>',
        synchronizationUnits: [{ id: "synchronization-unit-1", narrationText: "A document" }],
      },
      audio: {
        key: "conversions/conversion-id/audiobook.mp3",
        contentType: "audio/mpeg",
        byteLength: 48_001,
        durationMilliseconds: 1_000,
        etag: "audio-etag",
      },
      audioSegments: [
        {
          conversionId: "conversion-id",
          sequence: 0,
          key: "conversions/conversion-id/audio-segments/0.mp3",
          byteLength: 48_000,
          durationMilliseconds: 1_000,
          crc32: 0,
        },
      ],
    }),
  ).rejects.toThrow("Audiobook audio byte length does not match its audio segments");
});

test("rejects an audiobook with invalid source metadata before storing it", async () => {
  const { bucket, storedObjects } = createTestBucket();

  await expect(
    storeAudiobook({
      bucket,
      conversionId: "conversion-id",
      title: "A document",
      originalUrl: "not a URL",
      narrationDocument: {
        html: '<h1 id="synchronization-unit-1">A document</h1>',
        synchronizationUnits: [{ id: "synchronization-unit-1", narrationText: "A document" }],
      },
      audio: {
        key: "conversions/conversion-id/audiobook.mp3",
        contentType: "audio/mpeg",
        byteLength: 48_000,
        durationMilliseconds: 1_000,
        etag: "audio-etag",
      },
      audioSegments: [
        {
          conversionId: "conversion-id",
          sequence: 0,
          key: "conversions/conversion-id/audio-segments/0.mp3",
          byteLength: 48_000,
          durationMilliseconds: 1_000,
          crc32: 0,
        },
      ],
    }),
  ).rejects.toThrow("Invalid URL");
  expect(storedObjects).toHaveLength(0);
});

type StoredTestObject = {
  body: string;
  httpMetadata: { contentType?: string };
};

function createTestBucket(): {
  bucket: StoreOptions["bucket"];
  storedObjects: Map<string, StoredTestObject>;
} {
  const storedObjects = new Map<string, StoredTestObject>();
  const bucket: StoreOptions["bucket"] = {
    get: async (key: string) => {
      const storedObject = storedObjects.get(key);

      if (storedObject === undefined) {
        return null;
      }

      return {
        key,
        size: new TextEncoder().encode(storedObject.body).byteLength,
        etag: "manifest-etag",
        httpMetadata: storedObject.httpMetadata,
        text: async () => storedObject.body,
      };
    },
    put: async (key: string, value: string, options) => {
      storedObjects.set(key, { body: value, httpMetadata: options.httpMetadata });

      return {
        key,
        size: new TextEncoder().encode(value).byteLength,
        etag: "manifest-etag",
      };
    },
  };

  return { bucket, storedObjects };
}
