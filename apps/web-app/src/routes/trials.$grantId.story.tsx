import { createMemoryHistory } from "@tanstack/react-router";
import type { ResolveParams } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import React from "react";

import { OPEN_GRANT_RESPONSE } from "#ui-gallery/fixtures.js";
import type { Story } from "#ui-gallery/story.js";

import { createAppRouter, GlobalProviders } from "#src/app/global-providers.js";
import { Route as trialRoute } from "#src/routes/trials.$grantId.js";

const GRANT_ID = OPEN_GRANT_RESPONSE.grantId;
const memoryHistory = createMemoryHistory({ initialEntries: ["/"] });
// TanStack initializes route objects in place, so this story module must create one router only.
const router = createAppRouter(memoryHistory);

export const OpenGrant = {
  component: () => <TrialRoute />,
  handlers: [http.get(`/api/grants/${GRANT_ID}`, () => HttpResponse.json(OPEN_GRANT_RESPONSE))],
} satisfies Story;

export function MalformedCredential(): React.ReactNode {
  return <TrialRoute hash="credential=malformed" />;
}

function TrialRoute({ hash = "" }: { hash?: string }) {
  const location = router.buildLocation({
    to: trialRoute.fullPath,
    params: { grantId: GRANT_ID } satisfies ResolveParams<typeof trialRoute.fullPath>,
    hash,
  });
  memoryHistory.replace(location.href);

  return <GlobalProviders router={router} />;
}
