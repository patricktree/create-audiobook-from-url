import { z } from "zod";

import { encodePcmAsMp3 } from "@create-audiobook-from-url/mp3-encoding";

import { AUDIO_FORMAT, AUDIOBOOK_CONTENT_TYPE, analyzeMp3 } from "#src/audio-format.ts";
import {
  SPEECH_CONFIG,
  assertMatchingAudioSegmentIdentity,
  createAudioSegmentReference,
  createAudioSegmentKey,
  createAudioSegmentMetadata,
  type AudioSegmentReference,
  type StoredAudioSegment,
} from "#src/audio-segment-storage.ts";
import { calculateCrc32 } from "#src/crc32.ts";

const MP3_BITRATE_KILOBITS_PER_SECOND = 128;

const AUDIO_STREAM_CHUNK_SIZE = 64 * 1024;
const GOOGLE_INTERACTIONS_API_REVISION = "2026-05-20";
const SYNTHESIS_REQUEST_TIMEOUT_MILLISECONDS = 90_000;
const RETRYABLE_INPUT_POLICY_BLOCK_PREFIX =
  "Input blocked: The prompt could not be submitted. The prompt contains sensitive words";

const AUDIO_RESPONSE_SCHEMA = z.object({
  errors: z
    .array(
      z.object({
        code: z.string().nonempty().optional(),
        message: z.string().nonempty().optional(),
      }),
    )
    .optional(),
  status: z.string().nonempty().optional(),
  steps: z.array(
    z.object({
      content: z.array(
        z.object({
          channels: z.number().int().positive().optional(),
          data: z.string().nonempty(),
          mime_type: z.string().nonempty(),
          sample_rate: z.number().int().positive().optional(),
          type: z.literal("audio"),
        }),
      ),
    }),
  ),
});

const AUDIO_STREAM_EVENT_SCHEMA = z.object({
  delta: z
    .object({
      channels: z.number().int().positive().optional(),
      data: z.string().optional(),
      mime_type: z.string().nonempty().optional(),
      sample_rate: z.number().int().positive().optional(),
      type: z.string(),
    })
    .optional(),
  event_type: z.string(),
});

const AUDIO_STREAM_ERROR_SCHEMA = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).optional(),
    message: z.string().nonempty(),
  }),
});

const AUDIO_STREAM_DIAGNOSTIC_SCHEMA = z.object({
  errors: z
    .array(
      z.object({
        code: z.string().nonempty().optional(),
        message: z.string().nonempty().optional(),
      }),
    )
    .optional(),
  event_type: z.string().nonempty().optional(),
  interaction: z
    .object({
      errors: z
        .array(
          z.object({
            code: z.string().nonempty().optional(),
            message: z.string().nonempty().optional(),
          }),
        )
        .optional(),
      status: z.string().nonempty().optional(),
    })
    .optional(),
  status: z.string().nonempty().optional(),
});

/** Minimal AI gateway operations required for speech synthesis. */
export type SpeechSynthesisAi = {
  gateway(gatewayId: string): Pick<AiGateway, "run">;
};

export type NarrationSynthesisResponseMode = "streaming" | "non-streaming";

/** One normalized text input for narration synthesis. */
export type NarrationChunk = {
  text: string;
};

/** Identifies a provider failure that cannot succeed when repeated unchanged. */
export class PermanentNarrationSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentNarrationSynthesisError";
  }
}

/** Storage operations required to persist one audio segment. */
type AudioSegmentBucket = {
  head(key: string): Promise<StoredAudioSegment | null>;
  put(
    key: string,
    value: Uint8Array,
    options: {
      onlyIf: Headers;
      httpMetadata: { contentType: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<StoredAudioSegment | null>;
};

/** Supplies synthesis, storage, ownership, and sequence data for one narration segment. */
export type ProduceOptions = {
  ai: SpeechSynthesisAi;
  bucket: AudioSegmentBucket;
  conversionId: string;
  sequence: number;
  narrationChunk: NarrationChunk;
  synthesisAttempt?: number;
  synthesisResponseMode?: NarrationSynthesisResponseMode;
};

/** Synthesizes and stores one segment, reusing an identical existing object when possible. */
export async function produceAudioSegment({
  ai,
  bucket,
  conversionId,
  sequence,
  narrationChunk,
  synthesisAttempt = 1,
  synthesisResponseMode = "streaming",
}: ProduceOptions): Promise<AudioSegmentReference> {
  assertAudioSegmentIdentity(conversionId, sequence);
  assertSynthesisAttempt(synthesisAttempt);

  if (narrationChunk.text.trim().length === 0) {
    throw new Error("Cannot produce an audio segment from an empty narration chunk");
  }

  const key = createAudioSegmentKey(conversionId, sequence);
  const expectedMetadata = createAudioSegmentMetadata(narrationChunk.text);
  const existingAudioObject = await bucket.head(key);

  if (existingAudioObject) {
    return reuseAudioSegment(existingAudioObject, conversionId, sequence, expectedMetadata);
  }

  const providerAudio = await synthesizeAudioSegment({
    ai,
    conversionId,
    narrationText: narrationChunk.text,
    sequence,
    synthesisAttempt,
    synthesisResponseMode,
  });
  const encodedAudio = await encodePcmAsMp3(providerAudio, {
    bitrateKilobitsPerSecond: MP3_BITRATE_KILOBITS_PER_SECOND,
    sampleRate: AUDIO_FORMAT.sampleRate,
  });
  const { audioStart, audioEnd, durationMilliseconds } = analyzeMp3(encodedAudio);
  const audio = encodedAudio.slice(audioStart, audioEnd);
  const customMetadata = createAudioSegmentMetadata(
    narrationChunk.text,
    durationMilliseconds,
    calculateCrc32(audio),
  );

  const audioObject = await bucket.put(key, audio, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: AUDIOBOOK_CONTENT_TYPE },
    customMetadata,
  });

  if (audioObject) {
    return createAudioSegmentReference(audioObject, conversionId, sequence);
  }

  const concurrentlyStoredAudioObject = await bucket.head(key);

  if (!concurrentlyStoredAudioObject) {
    throw new Error(`Audio segment conditional write failed without an existing object: ${key}`);
  }

  return reuseAudioSegment(concurrentlyStoredAudioObject, conversionId, sequence, customMetadata);
}

function reuseAudioSegment(
  audioObject: StoredAudioSegment,
  conversionId: string,
  sequence: number,
  expectedMetadata: Readonly<Record<string, string>>,
): AudioSegmentReference {
  assertMatchingAudioSegmentIdentity(audioObject, expectedMetadata);

  return createAudioSegmentReference(audioObject, conversionId, sequence);
}

async function synthesizeAudioSegment({
  ai,
  conversionId,
  narrationText,
  sequence,
  synthesisAttempt,
  synthesisResponseMode,
}: {
  ai: SpeechSynthesisAi;
  conversionId: string;
  narrationText: string;
  sequence: number;
  synthesisAttempt: number;
  synthesisResponseMode: NarrationSynthesisResponseMode;
}): Promise<Uint8Array> {
  const isStreaming = synthesisResponseMode === "streaming";
  const response = await ai.gateway(SPEECH_CONFIG.gatewayId).run(
    {
      provider: SPEECH_CONFIG.provider,
      endpoint: SPEECH_CONFIG.endpoint,
      headers: {
        "Api-Revision": GOOGLE_INTERACTIONS_API_REVISION,
        "cf-aig-collect-log-payload": false,
        "Content-Type": "application/json",
      },
      query: {
        model: SPEECH_CONFIG.model,
        input: narrationText,
        response_format: {
          type: "audio",
          sample_rate: AUDIO_FORMAT.sampleRate,
        },
        generation_config: {
          speech_config: [{ voice: SPEECH_CONFIG.voice }],
        },
        stream: isStreaming,
      },
    },
    {
      gateway: {
        collectLog: true,
        id: SPEECH_CONFIG.gatewayId,
        metadata: {
          conversionId,
          narrationSegmentSequence: sequence,
          synthesisAttempt,
          synthesisResponseMode,
        },
        requestTimeoutMs: SYNTHESIS_REQUEST_TIMEOUT_MILLISECONDS,
      },
      signal: AbortSignal.timeout(SYNTHESIS_REQUEST_TIMEOUT_MILLISECONDS),
    },
  );

  if (!response.ok) {
    const responseBody = await readResponseBody(response);
    const providerMessage = getErrorMessage(responseBody);

    const message = `Google AI Studio narration synthesis failed with status ${response.status}: ${providerMessage}`;

    if (!isRetryableProviderError(response.status, providerMessage)) {
      throw new PermanentNarrationSynthesisError(message);
    }

    throw new Error(message);
  }

  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    if (!response.body) {
      throw new Error("Google AI Studio narration synthesis response did not contain a body");
    }

    return readAudioStream(createAudioStreamFromEvents(response.body));
  }

  return parseAudioResponse(await readResponseBody(response));
}

function parseAudioResponse(response: unknown): Uint8Array {
  const parsedResponse = AUDIO_RESPONSE_SCHEMA.safeParse(response);

  if (!parsedResponse.success) {
    throw new PermanentNarrationSynthesisError(
      `Google AI Studio narration synthesis returned an invalid response: ${z.prettifyError(parsedResponse.error)}`,
    );
  }

  const { errors, status, steps } = parsedResponse.data;
  const audio = steps.flatMap((step) => step.content)[0];

  if (!audio) {
    const diagnostic = formatProviderResultDiagnostic({ errors, status });
    const message = `Google AI Studio narration synthesis response did not contain audio data${diagnostic}`;

    if (errors?.some(({ code }) => isPermanentProviderErrorCode(code)) === true) {
      throw new PermanentNarrationSynthesisError(message);
    }

    throw new Error(message);
  }

  assertAudioFormatMetadata(audio);

  return decodeBase64(audio.data);
}

function assertAudioFormatMetadata({
  channels,
  mime_type: contentType,
  sample_rate: sampleRate,
}: {
  channels?: number | undefined;
  mime_type?: string | undefined;
  sample_rate?: number | undefined;
}): void {
  if (channels !== undefined && channels !== AUDIO_FORMAT.channelCount) {
    throw new PermanentNarrationSynthesisError(
      `Google AI Studio narration synthesis returned unexpected channel count: ${channels}`,
    );
  }

  if (sampleRate !== undefined && sampleRate !== AUDIO_FORMAT.sampleRate) {
    throw new PermanentNarrationSynthesisError(
      `Google AI Studio narration synthesis returned unexpected sample rate: ${sampleRate}`,
    );
  }

  if (contentType === undefined) {
    return;
  }

  const normalizedContentType = contentType.toLowerCase();
  const [mediaType, ...parameters] = normalizedContentType.split(";");

  if (mediaType?.trim() !== "audio/l16") {
    throw new PermanentNarrationSynthesisError(
      `Google AI Studio narration synthesis returned unexpected audio content type: ${contentType}`,
    );
  }

  const audioParameters = new Map(
    parameters.map((parameter) => {
      const [name, value = ""] = parameter.trim().split("=", 2);

      return [name, value] as const;
    }),
  );
  const rate = audioParameters.get("rate");

  if (rate !== undefined && rate !== "24000") {
    throw new PermanentNarrationSynthesisError(
      `Google AI Studio narration synthesis returned unexpected sample rate: ${rate}`,
    );
  }
}

async function readAudioStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      chunks.push(result.value);
      totalLength += result.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const audio = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return audio;
}

/** Converts Google AI Studio server-sent events into decoded PCM audio chunks. */
function createAudioStreamFromEvents(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedAudio = false;
  const diagnostics = createAudioStreamDiagnostics();

  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const nextEvent = takeServerSentEvent(buffer);

          if (nextEvent) {
            buffer = nextEvent.remainder;
            const audio = parseAudioStreamEvent(nextEvent.event, diagnostics);

            if (!audio) {
              continue;
            }

            receivedAudio = true;
            enqueueAudioChunks(controller, audio);
            return;
          }

          const result = await reader.read();

          if (result.done) {
            buffer += decoder.decode();

            const audio = parseAudioStreamEvent(buffer, diagnostics);

            if (audio) {
              receivedAudio = true;
              enqueueAudioChunks(controller, audio);
            }

            if (!receivedAudio) {
              const message = `Google AI Studio narration synthesis stream did not contain audio data${formatAudioStreamDiagnostics(diagnostics)}`;

              if (isPermanentProviderErrorCode(diagnostics.errorCode)) {
                throw new PermanentNarrationSynthesisError(message);
              }

              throw new Error(message);
            }

            controller.close();
            return;
          }

          buffer += decoder.decode(result.value, { stream: true });
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function takeServerSentEvent(buffer: string): { event: string; remainder: string } | undefined {
  const boundary = /\r?\n\r?\n/u.exec(buffer);

  if (!boundary || boundary.index === undefined) {
    return undefined;
  }

  return {
    event: buffer.slice(0, boundary.index),
    remainder: buffer.slice(boundary.index + boundary[0].length),
  };
}

function parseAudioStreamEvent(
  event: string,
  diagnostics: AudioStreamDiagnostics,
): Uint8Array | undefined {
  const data = event
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  if (data.length === 0 || data === "[DONE]") {
    if (data === "[DONE]") {
      diagnostics.lastEventType = "done";
      diagnostics.eventTypes.add("done");
    }

    return undefined;
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(data) as unknown;
  } catch {
    diagnostics.malformedEventCount += 1;
    return undefined;
  }

  recordAudioStreamDiagnostic(parsedJson, diagnostics);

  const parsedError = AUDIO_STREAM_ERROR_SCHEMA.safeParse(parsedJson);

  if (parsedError.success) {
    const { code, message } = parsedError.data.error;
    const error = `Google AI Studio narration synthesis failed${code === undefined ? "" : ` with code ${code}`}: ${message}`;

    if (isPermanentProviderErrorCode(code)) {
      throw new PermanentNarrationSynthesisError(error);
    }

    throw new Error(error);
  }

  const parsedEvent = AUDIO_STREAM_EVENT_SCHEMA.safeParse(parsedJson);

  if (
    !parsedEvent.success ||
    parsedEvent.data.event_type !== "step.delta" ||
    parsedEvent.data.delta?.type !== "audio" ||
    !parsedEvent.data.delta.data
  ) {
    return undefined;
  }

  assertAudioFormatMetadata(parsedEvent.data.delta);

  return decodeBase64(parsedEvent.data.delta.data);
}

type AudioStreamDiagnostics = {
  errorCode?: string;
  errorMessage?: string;
  eventTypes: Set<string>;
  interactionStatus?: string;
  lastEventType?: string;
  malformedEventCount: number;
};

function createAudioStreamDiagnostics(): AudioStreamDiagnostics {
  return {
    eventTypes: new Set(),
    malformedEventCount: 0,
  };
}

function recordAudioStreamDiagnostic(event: unknown, diagnostics: AudioStreamDiagnostics): void {
  const parsedDiagnostic = AUDIO_STREAM_DIAGNOSTIC_SCHEMA.safeParse(event);

  if (!parsedDiagnostic.success) {
    return;
  }

  const { errors, event_type: eventType, interaction, status } = parsedDiagnostic.data;

  if (eventType !== undefined) {
    diagnostics.eventTypes.add(eventType);
    diagnostics.lastEventType = eventType;
  }

  const providerError = interaction?.errors?.[0] ?? errors?.[0];

  if (providerError?.code !== undefined) {
    diagnostics.errorCode = providerError.code;
  }

  if (providerError?.message !== undefined) {
    diagnostics.errorMessage = providerError.message;
  }

  const interactionStatus = interaction?.status ?? status;

  if (interactionStatus !== undefined) {
    diagnostics.interactionStatus = interactionStatus;
  }
}

function formatAudioStreamDiagnostics(diagnostics: AudioStreamDiagnostics): string {
  const details = [
    diagnostics.lastEventType === undefined
      ? undefined
      : `last event: ${diagnostics.lastEventType}`,
    diagnostics.interactionStatus === undefined
      ? undefined
      : `interaction status: ${diagnostics.interactionStatus}`,
    diagnostics.eventTypes.size === 0
      ? undefined
      : `event types: ${[...diagnostics.eventTypes].join(", ")}`,
    diagnostics.malformedEventCount === 0
      ? undefined
      : `malformed events: ${diagnostics.malformedEventCount}`,
    diagnostics.errorCode === undefined ? undefined : `error code: ${diagnostics.errorCode}`,
    diagnostics.errorMessage === undefined ? undefined : `error: ${diagnostics.errorMessage}`,
  ].filter((detail) => detail !== undefined);

  return details.length === 0 ? "" : ` (${details.join("; ")})`;
}

function decodeBase64(value: string): Uint8Array {
  let binaryValue: string;

  try {
    binaryValue = atob(value);
  } catch {
    throw new PermanentNarrationSynthesisError(
      "Google AI Studio narration synthesis returned invalid base64 audio data",
    );
  }

  const bytes = new Uint8Array(binaryValue.length);

  for (let index = 0; index < binaryValue.length; index += 1) {
    bytes[index] = binaryValue.charCodeAt(index);
  }

  return bytes;
}

function enqueueAudioChunks(
  controller: ReadableStreamDefaultController<Uint8Array>,
  audio: Uint8Array,
): void {
  for (let offset = 0; offset < audio.length; offset += AUDIO_STREAM_CHUNK_SIZE) {
    controller.enqueue(audio.subarray(offset, offset + AUDIO_STREAM_CHUNK_SIZE));
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const body = (await response.text()).trim();

  if (body.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function getErrorMessage(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  if (typeof response !== "object" || response === null || !("error" in response)) {
    return "The provider returned an error response";
  }

  const error = response.error;

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "The provider returned an error response";
}

function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableProviderError(status: number, message: string): boolean {
  return (
    isRetryableProviderStatus(status) ||
    (status === 400 && message.startsWith(RETRYABLE_INPUT_POLICY_BLOCK_PREFIX))
  );
}

function isPermanentProviderErrorCode(code: string | number | undefined): boolean {
  if (code === undefined) {
    return false;
  }

  const normalizedCode = code.toString().toLowerCase();

  return [
    "blocked",
    "invalid_argument",
    "not_found",
    "permission_denied",
    "safety",
    "unauthenticated",
  ].some((permanentCode) => normalizedCode.includes(permanentCode));
}

function formatProviderResultDiagnostic({
  errors,
  status,
}: {
  errors?: readonly { code?: string | undefined; message?: string | undefined }[] | undefined;
  status?: string | undefined;
}): string {
  const providerError = errors?.[0];
  const details = [
    status === undefined ? undefined : `interaction status: ${status}`,
    providerError?.code === undefined ? undefined : `error code: ${providerError.code}`,
    providerError?.message === undefined ? undefined : `error: ${providerError.message}`,
  ].filter((detail) => detail !== undefined);

  return details.length === 0 ? "" : ` (${details.join("; ")})`;
}

function assertAudioSegmentIdentity(conversionId: string, sequence: number): void {
  if (conversionId.trim().length === 0) {
    throw new Error("Cannot produce an audio segment without a conversion ID");
  }

  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error(`Audio segment sequence must be a non-negative safe integer: ${sequence}`);
  }
}

function assertSynthesisAttempt(synthesisAttempt: number): void {
  if (!Number.isSafeInteger(synthesisAttempt) || synthesisAttempt < 1) {
    throw new Error(`Synthesis attempt must be a positive safe integer: ${synthesisAttempt}`);
  }
}
