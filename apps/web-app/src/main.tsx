import React from "react";

import { AppStyles } from "#src/app/app-styles.js";
import { createAppRouter, GlobalProviders } from "#src/app/global-providers.js";

const router = createAppRouter();

export function WebApp(): React.ReactNode {
  return (
    <>
      <AppStyles />
      <GlobalProviders router={router} />
    </>
  );
}
