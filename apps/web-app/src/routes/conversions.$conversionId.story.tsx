import { createMemoryHistory } from "@tanstack/react-router";
import type { ResolveParams } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import React from "react";

import type { Story } from "#ui-gallery/story.js";

import { ConversionPhase } from "@create-audiobook-from-url/conversion-grants/contracts";
import type {
  ConversionDetail,
  ErrorResponse,
} from "@create-audiobook-from-url/web-app-api.routes";

import { createAppRouter, GlobalProviders } from "#src/app/global-providers.js";
import { Route as conversionRoute } from "#src/routes/conversions.$conversionId.js";

const CONVERSION_ID = "a3fcb5d8-9162-4c1a-b804-3be130c5e92a";
const memoryHistory = createMemoryHistory({ initialEntries: ["/app/"] });
// TanStack initializes route objects in place, so this story module must create one router only.
const router = createAppRouter(memoryHistory);

export const PendingConversion = {
  component: () => <ConversionRoute />,
  handlers: [
    http.get(`/api/conversions/${CONVERSION_ID}`, () =>
      HttpResponse.json({
        conversionId: CONVERSION_ID,
        sourceUrl: "https://example.com/article",
        acceptedAt: "2026-08-28T10:05:00Z",
        status: "pending",
        lastStartedPhase: ConversionPhase.NARRATION_CONTENT_SELECTION,
      } satisfies ConversionDetail),
    ),
  ],
} satisfies Story;

export const FailedConversion = {
  component: () => <ConversionRoute />,
  handlers: [
    http.get(`/api/conversions/${CONVERSION_ID}`, () =>
      HttpResponse.json({
        conversionId: CONVERSION_ID,
        sourceUrl: "https://source.example.test/fixture",
        acceptedAt: "2026-08-28T10:05:00Z",
        status: "failed",
        completedAt: "2026-08-28T10:08:00Z",
        failure: { category: "narration-synthesis", explanation: "Speech synthesis failed." },
      } satisfies ConversionDetail),
    ),
  ],
} satisfies Story;

export const ConversionLoadError = {
  component: () => <ConversionRoute />,
  handlers: [
    http.get(`/api/conversions/${CONVERSION_ID}`, () =>
      HttpResponse.json(
        {
          error: {
            requestId: "09e6d824-d41d-43bb-9417-18f89232ba56",
            code: "operational-error",
            message: "The conversion could not be loaded.",
          },
        } satisfies ErrorResponse,
        { status: 500 },
      ),
    ),
  ],
} satisfies Story;

function ConversionRoute() {
  const location = router.buildLocation({
    to: conversionRoute.fullPath,
    params: { conversionId: CONVERSION_ID } satisfies ResolveParams<
      typeof conversionRoute.fullPath
    >,
  });
  memoryHistory.replace(location.href);

  return <GlobalProviders router={router} />;
}
