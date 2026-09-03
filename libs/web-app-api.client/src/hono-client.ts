import { hc, parseResponse, DetailedError as HonoDetailedError } from "hono/client";
import type { IsAny } from "type-fest";

import type { WebAppApiApp, WebAppApiClient } from "@create-audiobook-from-url/web-app-api.routes";

/** Parses successful Hono responses and rejects non-successful responses. */
export { parseResponse as parseOkResponse };

// This indirection preserves inferred routes and works around TypeScript issue 47663.
const hcWithType = (...args: Parameters<typeof hc>): WebAppApiClient => hc<WebAppApiApp>(...args);

/** Typed Hono client inferred from the create-audiobook-from-url API routes. */
export type HonoClient = ReturnType<typeof hcWithType>;

/** Creates a typed Hono client for the supplied API base URL. */
export function createHonoClient(baseUrl: string): HonoClient {
  return hcWithType(trimTrailingSlash(baseUrl), {});
}

type MapAnyToUnknown<T> = {
  [Key in keyof T]: IsAny<T[Key]> extends true ? unknown : T[Key];
};

type ParseResponseError = MapAnyToUnknown<HonoDetailedError>;

/** Narrows an unknown error to Hono's detailed response parsing error shape. */
export function isParseResponseError(error: unknown): error is ParseResponseError {
  return (
    error instanceof HonoDetailedError ||
    (typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      "message" in error &&
      typeof error.message === "string")
  );
}

/** Extracts the API-provided message from a Hono response parsing error. */
export function getParseErrorMessage(error: ParseResponseError): string | undefined {
  const detailData =
    typeof error.detail === "object" && error.detail !== null && "data" in error.detail
      ? error.detail.data
      : undefined;

  if (typeof detailData === "string") {
    return detailData;
  }

  if (
    detailData !== null &&
    typeof detailData === "object" &&
    "error" in detailData &&
    typeof detailData.error === "object" &&
    detailData.error !== null &&
    "message" in detailData.error &&
    typeof detailData.error.message === "string"
  ) {
    return detailData.error.message;
  }

  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}
