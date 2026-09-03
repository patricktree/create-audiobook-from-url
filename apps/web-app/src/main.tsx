import "@fontsource-variable/inter/wght.css";
import "@fontsource/space-mono";
import React from "react";

import { GlobalProviders } from "#src/app/global-providers.js";
import { cssBase, cssReset } from "#src/app/global-styles.ts";

export function WebApp(): React.ReactNode {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssReset }} />
      <style dangerouslySetInnerHTML={{ __html: cssBase }} />
      <GlobalProviders />
    </>
  );
}
