import { css } from "@linaria/core";
import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import React from "react";

import { DSButton } from "#src/app/design-system/button.js";
import { composeClassnames, visuallyHidden } from "#src/app/utils.js";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

type TextFieldProps = {
  sx?: { label?: string; input?: string };
  autoComplete?: React.ComponentProps<"input">["autoComplete"];
  disabled?: boolean;
  label: string;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  type?: "email" | "password" | "text" | "url";
  hideLabel?: boolean;
};

function TextField({
  sx,
  autoComplete,
  disabled,
  label,
  maxLength,
  placeholder,
  required,
  type = "text",
  hideLabel = false,
}: TextFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  const inputId = React.useId();
  const errorId = `${inputId}-error`;
  const errorMessage = field.state.meta.isBlurred
    ? getErrorMessage(field.state.meta.errors[0])
    : undefined;

  return (
    <label
      className={composeClassnames(
        css`
          display: flex;
          flex-direction: column;
          gap: calc(0.5 * var(--spacing-base));
        `,
        sx?.label,
      )}
    >
      <span className={hideLabel ? visuallyHidden : undefined}>{label}</span>
      <input
        className={composeClassnames(
          css`
            padding-block: calc(1.5 * var(--spacing-base));
            padding-inline: calc(2.5 * var(--spacing-base));

            font-size: 18px;
            color: var(--color-fg);
            background:
              linear-gradient(var(--color-bg), var(--color-bg)) padding-box,
              linear-gradient(90deg, #0e0668 0%, #450099 46%, #ff00fb 100%) border-box;
            background-color: var(--color-bg);
            border: 2px solid transparent;
            border-radius: 999px;
            box-shadow: 4px 4px 20px rgb(0 0 0 / 12%);

            &:focus-visible {
              border-radius: 999px;
            }

            &::placeholder {
              color: var(--color-fg-emphasized-xs);
            }
          `,
          sx?.input,
        )}
        aria-describedby={errorMessage === undefined ? undefined : errorId}
        aria-invalid={errorMessage === undefined ? undefined : true}
        autoComplete={autoComplete}
        disabled={disabled}
        id={inputId}
        maxLength={maxLength}
        name={field.name}
        placeholder={placeholder}
        required={required}
        type={type}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      {errorMessage === undefined ? null : (
        <small
          className={css`
            color: var(--color-error);
          `}
          id={errorId}
          role="alert"
        >
          {errorMessage}
        </small>
      )}
    </label>
  );
}

type SubmitButtonProps = {
  sx?: { button: string };
  disabled?: boolean;
  disabledWhenPristine?: boolean;
  label: string;
  submittingLabel?: string;
};

function SubmitButton({
  sx,
  disabled = false,
  disabledWhenPristine = false,
  label,
  submittingLabel = label,
}: SubmitButtonProps): React.JSX.Element {
  const form = useFormContext();

  return (
    <form.Subscribe
      selector={(state) => [state.canSubmit, state.isPristine, state.isSubmitting] as const}
    >
      {([canSubmit, isPristine, isSubmitting]) => (
        <DSButton
          className={sx?.button}
          disabled={disabled || !canSubmit || isSubmitting || (disabledWhenPristine && isPristine)}
          type="submit"
          variant="contained"
        >
          {isSubmitting ? submittingLabel : label}
        </DSButton>
      )}
    </form.Subscribe>
  );
}

/** Application form hook preconfigured with the shared field and form components. */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
  },
  formComponents: {
    SubmitButton,
  },
});

function getErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return undefined;
}
