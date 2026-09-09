import { createMemoryHistory } from "@tanstack/react-router";
import type { ResolveParams } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import React from "react";

import { PENDING_CONVERSION_RESPONSE } from "#ui-gallery/fixtures.js";
import type { Story } from "#ui-gallery/story.js";

import { createAppRouter, GlobalProviders } from "#src/app/global-providers.js";
import { Route as conversionRoute } from "#src/routes/conversions.$conversionId.js";

const CONVERSION_ID = PENDING_CONVERSION_RESPONSE.conversionId;
const memoryHistory = createMemoryHistory({ initialEntries: ["/"] });
// TanStack initializes route objects in place, so this story module must create one router only.
const router = createAppRouter(memoryHistory);

export const PendingConversion = {
  component: () => <ConversionRoute />,
  handlers: [
    http.get(`/api/conversions/${CONVERSION_ID}`, () =>
      HttpResponse.json(PENDING_CONVERSION_RESPONSE),
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
