import { css } from "@linaria/core";
import React from "react";

export const MainSection: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <section
      className={css`
        display: grid;
        align-content: center;
        justify-items: stretch;
        height: 100%;
      `}
    >
      {children}
    </section>
  );
};
