import { css } from "@linaria/core";
import { useNavigate } from "@tanstack/react-router";
import React from "react";

import {
  type GrantSnapshot,
  startConversionRequestSchema,
} from "@create-audiobook-from-url/web-app-api.routes";

import { useAppForm } from "#src/app/form.js";
import { useStartConversionMutation } from "#src/data-fetching/trial-link.js";

export function StartConversionForm({ grant }: { grant: GrantSnapshot }): React.JSX.Element {
  const navigate = useNavigate();
  const startConversionMutation = useStartConversionMutation(grant.grantId);
  const form = useAppForm({
    defaultValues: { sourceUrl: "" },
    validators: {
      onBlur: startConversionRequestSchema,
      onChange: startConversionRequestSchema,
      onSubmit: startConversionRequestSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await startConversionMutation.mutateAsync({
        sourceUrl: value.sourceUrl,
        idempotencyKey: crypto.randomUUID(),
      });
      form.reset();
      await navigate({
        to: "/conversions/$conversionId",
        params: { conversionId: result.conversion.conversionId },
      });
    },
  });

  return (
    <form
      className={css`
        display: grid;
      `}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.AppField name="sourceUrl">
          {(field) => (
            <field.TextField
              sx={{
                label: css`
                  margin-block-end: 32px;
                `,
                input: css`
                  /* ensure the input field is above the &::before pseudo element radial background */
                  isolation: isolate;
                `,
              }}
              label="URL"
              maxLength={2048}
              required
              type="url"
              placeholder="Paste URL here"
              hideLabel
            />
          )}
        </form.AppField>
        <form.SubmitButton
          sx={{
            button: css`
              justify-self: end;
            `,
          }}
          disabledWhenPristine
          label="Upload & listen"
        />
      </form.AppForm>
    </form>
  );
}
