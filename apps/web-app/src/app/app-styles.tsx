import "@fontsource-variable/inter/wght.css";
import "@fontsource/space-mono";
import React from "react";

import { cssBase, cssReset } from "#src/app/global-styles.ts";

export function AppStyles(): React.ReactNode {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssReset }} />
      <style dangerouslySetInnerHTML={{ __html: cssBase }} />
    </>
  );
}
