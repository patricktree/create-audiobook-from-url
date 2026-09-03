import { css } from "@linaria/core";
import React from "react";

export const MainSection: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <section
      className={css`
        height: 100%;
        display: grid;
        align-content: center;
        justify-items: stretch;
      `}
    >
      {children}
    </section>
  );
};

export const SuperHeader: React.FC = () => {
  return (
    <>
      <span
        className={css`
          margin-block-end: 12px;

          color: var(--color-fg-emphasized-sm);
          font-size: 18px;
        `}
      >
        No reading lists, no tldr.
      </span>
      <h2
        className={css`
          margin-block-end: 18px;

          font-size: 36px;
        `}
      >
        Just listen.
      </h2>
    </>
  );
};
