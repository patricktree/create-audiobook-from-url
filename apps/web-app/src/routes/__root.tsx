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
    <>
      <div
        className={css`
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(
            ellipse 100% 30%,
            hsl(var(--color-primary-hsl) / 20%) 0%,
            transparent 50%
          );
          transform: rotate(-10deg);
        `}
      />

      <main
        className={css`
          max-width: 800px;
          height: 100%;
          padding-block: var(--app-padding-block);
          padding-inline: var(--app-padding-inline);
          margin-inline: auto;

          /* stacking context to put it above the background gradient */
          isolation: isolate;
        `}
      >
        <Outlet />
      </main>
    </>
  );
}
