import { queryOptions, useMutation } from "@tanstack/react-query";

import { WebAppApiClient } from "@create-audiobook-from-url/web-app-api.client";
import {
  audiobookSchema,
  conversionDetailSchema,
  errorResponseSchema,
  grantSnapshotSchema,
  startConversionResponseSchema,
  type Audiobook,
  type ConversionDetail,
  type GrantSnapshot,
  type StartConversionResponse,
} from "@create-audiobook-from-url/web-app-api.routes";

const POLL_INTERVAL_MS = 2_000;
const rpcClient = new WebAppApiClient(window.location.origin);

export const createGrantQueryKey = (grantId: string) => ["conversion-grant", grantId] as const;
const createConversionQueryKey = (conversionId: string) => ["conversion", conversionId] as const;

export function createGrantQuery(grantId: string) {
  return queryOptions({
    queryKey: createGrantQueryKey(grantId),
    queryFn: ({ signal }) => getGrant(grantId, signal),
  });
}

export function createConversionQuery(conversionId: string) {
  return queryOptions({
    queryKey: createConversionQueryKey(conversionId),
    queryFn: ({ signal }) => getConversion(conversionId, signal),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_INTERVAL_MS : false),
    staleTime: POLL_INTERVAL_MS,
  });
}

export function useStartConversionMutation(grantId: string) {
  return useMutation({
    mutationFn: ({ sourceUrl, idempotencyKey }: { sourceUrl: string; idempotencyKey: string }) =>
      startConversion(grantId, sourceUrl, idempotencyKey),
  });
}

export function createAudiobookQuery(conversionId: string) {
  return queryOptions({
    queryKey: ["audiobook", conversionId],
    queryFn: ({ signal }) => getAudiobook(conversionId, signal),
  });
}

export async function exchangeCredential(
  grantId: string,
  credential: string,
): Promise<GrantSnapshot> {
  const response = await rpcClient.exchangeCredential({ grantId }, { credential });
  return parseResponse(response, (body) => grantSnapshotSchema.parse(body));
}

async function startConversion(
  grantId: string,
  sourceUrl: string,
  idempotencyKey: string,
): Promise<StartConversionResponse> {
  const response = await rpcClient.startConversion({ grantId }, { sourceUrl }, idempotencyKey);
  return parseResponse(response, (body) => startConversionResponseSchema.parse(body));
}

async function getGrant(grantId: string, signal: AbortSignal): Promise<GrantSnapshot> {
  const response = await rpcClient.getGrant({ grantId }, signal);
  return parseResponse(response, (body) => grantSnapshotSchema.parse(body));
}

async function getConversion(conversionId: string, signal: AbortSignal): Promise<ConversionDetail> {
  const response = await rpcClient.getConversion({ conversionId }, signal);
  return parseResponse(response, (body) => conversionDetailSchema.parse(body));
}

async function getAudiobook(conversionId: string, signal: AbortSignal): Promise<Audiobook> {
  const response = await rpcClient.getAudiobook({ conversionId }, signal);
  return parseResponse(response, (body) => audiobookSchema.parse(body));
}

async function parseResponse<Result>(
  response: Response,
  parseResult: (value: unknown) => Result,
): Promise<Result> {
  const body: unknown = await response.json();
  if (response.ok) return parseResult(body);
  const error = errorResponseSchema.safeParse(body);
  throw new ApiError(
    error.success ? error.data.error.code : "operational-error",
    error.success ? error.data.error.message : "The request could not be completed.",
    response.status,
    response.headers.get("Retry-After"),
  );
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(code: string, message: string, status: number, retryAfter: string | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
