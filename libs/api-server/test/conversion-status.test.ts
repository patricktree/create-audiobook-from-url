import { expect, test } from "vitest";

import { getConversionStatus } from "#src/use-cases/get-conversion-status.ts";

test("maps an active workflow to a pending conversion", async () => {
  const env = createEnv({ status: "running" });

  await expect(getConversionStatus(env, "conversion-id")).resolves.toEqual({
    status: "pending",
  });
});

test("maps a completed conversion with a stored audiobook manifest to a ready conversion", async () => {
  const audiobook = {
    title: "A document",
    originalUrl: "https://example.com/source",
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
    synchronizationCues: [
      {
        synchronizationUnitId: "synchronization-unit-1",
        startMilliseconds: 0,
        endMilliseconds: 1_000,
      },
    ],
  };
  const manifestBody = JSON.stringify(audiobook);
  const env = createEnv(
    {
      status: "complete",
      output: {
        key: "conversions/conversion-id/audiobook.json",
        contentType: "application/json",
        byteLength: new TextEncoder().encode(manifestBody).byteLength,
        etag: "manifest-etag",
      },
    },
    manifestBody,
  );

  await expect(getConversionStatus(env, "conversion-id")).resolves.toEqual({
    status: "ready",
    audiobook,
  });
});

test("maps an errored workflow to a failed conversion", async () => {
  const error = { name: "Error", message: "Speech generation failed." };
  const env = createEnv({ status: "errored", error });

  await expect(getConversionStatus(env, "conversion-id")).resolves.toEqual({
    status: "failed",
    error,
  });
});

test("rejects a completed workflow without a stored audiobook", async () => {
  const env = createEnv({ status: "complete" });

  await expect(getConversionStatus(env, "conversion-id")).rejects.toThrow(
    "This conversion does not have a valid stored audiobook.",
  );
});

type TestWorkflowStatus = {
  status: "running" | "complete" | "errored";
  error?: {
    name: string;
    message: string;
  };
  output?: unknown;
};

function createEnv(
  workflowStatus: TestWorkflowStatus,
  manifestBody?: string,
): Parameters<typeof getConversionStatus>[0] {
  return {
    CREATE_AUDIOBOOK_FROM_URL_WORKFLOW: {
      get: async () => ({
        status: async () => workflowStatus,
      }),
    },
    AUDIO_BUCKET: {
      get: async () =>
        manifestBody === undefined
          ? null
          : {
              key: "conversions/conversion-id/audiobook.json",
              size: new TextEncoder().encode(manifestBody).byteLength,
              etag: "manifest-etag",
              httpMetadata: { contentType: "application/json" },
              text: async () => manifestBody,
            },
    },
  };
}
