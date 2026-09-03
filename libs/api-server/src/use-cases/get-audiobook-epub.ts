import {
  createAudioSegmentReference,
  type Audiobook,
  type AudioSegmentReference,
} from "@create-audiobook-from-url/audiobook-production";

export type AudiobookEpubArtifact = {
  body: ReadableStream<Uint8Array>;
  size: number;
  etag: string;
};

type StoredArtifactMetadata = {
  key: string;
  size: number;
  uploadedAt: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

export type GetAudiobookEpubDependencies = {
  getEpub(key: string): Promise<AudiobookEpubArtifact | undefined>;
  getArtifactMetadata(key: string): Promise<StoredArtifactMetadata | undefined>;
  exportEpub(input: {
    conversionId: string;
    audiobook: Audiobook;
    audioSegments: readonly AudioSegmentReference[];
    modifiedAt: string;
  }): Promise<void>;
};

/** Returns the synchronized EPUB, creating it from canonical audiobook artifacts when needed. */
export async function getAudiobookEpub(
  conversionId: string,
  audiobook: Audiobook,
  dependencies: GetAudiobookEpubDependencies,
): Promise<AudiobookEpubArtifact | undefined> {
  const key = `conversions/${conversionId}/audiobook.epub`;
  const existingEpub = await dependencies.getEpub(key);
  if (existingEpub !== undefined) return existingEpub;

  const storedAudio = await dependencies.getArtifactMetadata(audiobook.audio.key);
  if (storedAudio === undefined) return undefined;

  const audioSegments = await Promise.all(
    audiobook.synchronizationCues.map(async (_cue, sequence) => {
      const segment = await dependencies.getArtifactMetadata(
        `conversions/${conversionId}/audio-segments/${sequence}.mp3`,
      );
      if (segment === undefined) throw new Error("Audiobook segment not found");
      return createAudioSegmentReference(segment, conversionId, sequence);
    }),
  );

  await dependencies.exportEpub({
    conversionId,
    audiobook,
    audioSegments,
    modifiedAt: storedAudio.uploadedAt,
  });

  return dependencies.getEpub(key);
}
