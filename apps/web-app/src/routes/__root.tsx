import { css } from "@linaria/core";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import React from "react";

type RouterContext = {
  queryClient: QueryClient;
};

/** Root route that supplies shared loader context and the application shell. */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout(): React.JSX.Element {
  return (
    <main
      className={css`
        display: grid;
        align-content: center;
        max-width: var(--app-max-width);
        min-height: 100%;
        padding-block: var(--app-padding-block);
        padding-inline: var(--app-padding-inline);
        margin-inline: auto;

        /* stacking context to put it above the background gradient */
        isolation: isolate;

        & > *:nth-child(1) {
          margin-block-start: /* pull vertically-centered content a little bit up*/ calc(
            -1 * 14 * var(--spacing-base)
          );
        }
      `}
    >
      <Outlet />
    </main>
  );
}
