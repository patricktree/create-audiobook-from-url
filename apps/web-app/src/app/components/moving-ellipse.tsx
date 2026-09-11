import { css } from "@linaria/core";
import React from "react";

export function MovingEllipse(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={css`
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        border-radius: inherit;

        &::before {
          position: absolute;
          inset: 0;
          content: "";
          background: radial-gradient(
            ellipse 100% 100%,
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
            transform: translate(0%, -5%) rotate(-10deg) scaleX(1);
          }
          19% {
            opacity: 0.5;
            transform: translate(10%, -5%) rotate(3deg) scaleX(0.92);
          }
          43% {
            opacity: 1;
            transform: translate(20%, -4%) rotate(-4deg) scaleX(0.85);
          }
          68% {
            opacity: 0.55;
            transform: translate(-10%, -5%) rotate(-6deg) scaleX(0.9);
          }
          84% {
            opacity: 0.8;
            transform: translate(-15%, -6%) rotate(3deg) scaleX(0.96);
          }
          100% {
            opacity: 0.5;
            transform: translate(0%, -5%) rotate(-10deg) scaleX(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          &::before {
            animation: none;
          }
        }
      `}
    />
  );
}
