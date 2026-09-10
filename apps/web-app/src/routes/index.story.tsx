import { createMemoryHistory } from "@tanstack/react-router";
import React from "react";

import { createAppRouter, GlobalProviders } from "#src/app/global-providers.js";

const router = createAppRouter(createMemoryHistory({ initialEntries: ["/app/"] }));

export function LandingPage(): React.ReactNode {
  return <GlobalProviders router={router} />;
}
