import type {
  Audiobook,
  AudiobookReference,
} from "@create-audiobook-from-url/audiobook-production";

export type LoadReadyAudiobookDependencies = {
  findGrantIdForConversion(conversionId: string): Promise<string | undefined>;
  getReadyAudiobookReference(
    grantId: string,
    conversionId: string,
  ): Promise<AudiobookReference | undefined>;
  loadAudiobook(reference: AudiobookReference): Promise<Audiobook>;
};

/** Loads the canonical audiobook for a ready conversion. */
export async function loadReadyAudiobook(
  conversionId: string,
  dependencies: LoadReadyAudiobookDependencies,
): Promise<Audiobook | undefined> {
  const grantId = await dependencies.findGrantIdForConversion(conversionId);
  if (grantId === undefined) return undefined;

  const reference = await dependencies.getReadyAudiobookReference(grantId, conversionId);
  if (reference === undefined) return undefined;

  return dependencies.loadAudiobook(reference);
}
