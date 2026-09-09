import type {
  ConversionParams,
  ExchangeCredentialRequest,
  GrantParams,
  StartConversionRequest,
} from "@create-audiobook-from-url/web-app-api.routes";

import { createHonoClient, type HonoClient } from "#src/hono-client.ts";

/** Typed trial link and unlisted audiobook client. */
export class WebAppApiClient {
  #honoClient: HonoClient;
  #baseUrl: string;

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl;
    this.#honoClient = createHonoClient(baseUrl);
  }

  async exchangeCredential(params: GrantParams, input: ExchangeCredentialRequest) {
    return this.#honoClient.api.grants[":grantId"].sessions.$post({
      param: params,
      json: input,
      header: browserHeaders(),
    });
  }

  async getGrant(params: GrantParams, signal?: AbortSignal) {
    return this.#honoClient.api.grants[":grantId"].$get(
      { param: params },
      signal === undefined ? undefined : { init: { signal } },
    );
  }

  async getGrantConversions(params: GrantParams, signal?: AbortSignal) {
    return this.#honoClient.api.grants[":grantId"].conversions.$get(
      { param: params },
      signal === undefined ? undefined : { init: { signal } },
    );
  }

  async getConversion(params: ConversionParams, signal?: AbortSignal) {
    return this.#honoClient.api.conversions[":conversionId"].$get(
      { param: params },
      signal === undefined ? undefined : { init: { signal } },
    );
  }

  async startConversion(
    params: GrantParams,
    input: StartConversionRequest,
    idempotencyKey: string,
  ) {
    return this.#honoClient.api.grants[":grantId"].conversions.$post({
      param: params,
      json: input,
      header: { ...browserHeaders(), "idempotency-key": idempotencyKey },
    });
  }

  async getAudiobook(params: ConversionParams, signal?: AbortSignal) {
    return this.#honoClient.api.audiobooks[":conversionId"].$get(
      { param: params },
      signal === undefined ? undefined : { init: { signal } },
    );
  }

  createAudiobookPageUrl(params: ConversionParams): URL {
    return new URL(`/audiobooks/${encodeURIComponent(params.conversionId)}`, this.#baseUrl);
  }
}

function browserHeaders() {
  return {
    "x-create-audiobook-from-url-request": "1" as const,
  };
}
