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
        aria-hidden="true"
        className={css`
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;

          &::before {
            position: absolute;
            inset: 0;
            max-width: var(--app-max-width);
            margin-inline: auto;
            content: "";
            background: radial-gradient(
              ellipse 100% 30%,
              hsl(var(--color-primary-hsl) / 50%) 0%,
              transparent 50%
            );
            opacity: 0.5;
            transform: rotate(-10deg);
            animation: background-ellipse-drift 10s ease-in-out infinite;
          }

          @keyframes background-ellipse-drift {
            0% {
              opacity: 0.5;
              transform: translate(0, 0) rotate(-10deg) scaleX(1);
            }
            19% {
              opacity: 0.5;
              transform: translate(10%, 0%) rotate(3deg) scaleX(0.92);
            }
            43% {
              opacity: 1;
              transform: translate(20%, 1%) rotate(-4deg) scaleX(0.85);
            }
            68% {
              opacity: 0.55;
              transform: translate(-10%, 0%) rotate(-6deg) scaleX(0.9);
            }
            84% {
              opacity: 0.8;
              transform: translate(-15%, -1%) rotate(3deg) scaleX(0.96);
            }
            100% {
              opacity: 0.5;
              transform: translate(0, 0) rotate(-10deg) scaleX(1);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            &::before {
              animation: none;
            }
          }
        `}
      />

      <main
        className={css`
          max-width: var(--app-max-width);
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
