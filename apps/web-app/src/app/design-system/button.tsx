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
          padding-block: calc(1.5 * var(--spacing-base));
          padding-inline: calc(2 * var(--spacing-base));

          color: inherit;
          background-color: transparent;
          border: 0px;
          border-radius: 999px;

          &:hover {
            cursor: pointer;
          }

          &:disabled {
            cursor: not-allowed;
          }

          &[data-variant="outlined"] {
            border: 1px solid currentColor;
            background-color: var(--color-bg);
          }

          &[data-variant="contained"] {
            color: var(--color-bg);
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
