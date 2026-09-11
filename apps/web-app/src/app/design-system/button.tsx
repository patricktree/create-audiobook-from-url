import { Button as BaseUIButton } from "@base-ui/react/button";
import { css } from "@linaria/core";
import React from "react";

import type { MapPropsToRequiredDataAttributeProps } from "#src/app/styling.utils.js";
import { composeClassnames } from "#src/app/utils.js";

type DSButtonProps = React.ComponentProps<"button"> & DSButtonCustomProps;

type DSButtonCustomProps = {
  variant?: "outlined" | "contained" | "text";
};

type DSButtonDataAttributes = MapPropsToRequiredDataAttributeProps<DSButtonCustomProps>;

/** Shared application button with the supported visual variants. */
export const DSButton: React.FC<DSButtonProps> = ({
  variant = "outlined",
  children,
  className,
  style,
  ...delegated
}) => {
  const dataAttributes: DSButtonDataAttributes = { "data-variant": variant };

  return (
    <BaseUIButton
      className={composeClassnames(
        css`
          min-height: 48px;
          padding-block: calc(2 * var(--spacing-base));
          padding-inline: calc(3 * var(--spacing-base));

          font-size: var(--font-size-sm);
          font-weight: var(--font-weight-inter-figma-medium);
          color: inherit;
          background-color: transparent;
          border: 0;
          border-radius: 999px;

          &:hover {
            cursor: pointer;
          }

          &:disabled {
            cursor: not-allowed;
          }

          &[data-variant="outlined"] {
            background-color: var(--color-bg);
            border: 1px solid currentcolor;
          }

          &[data-variant="contained"] {
            color: var(--color-input-bg);
            background-color: var(--color-primary);
          }
        `,
        className,
      )}
      style={style ?? {}}
      {...dataAttributes}
      {...delegated}
    >
      {children}
    </BaseUIButton>
  );
};
