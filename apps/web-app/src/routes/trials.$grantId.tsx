import { css } from "@linaria/core";
import { check } from "@patricktree-stack/utils-ecma/assert.utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  useNavigate,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import React from "react";

import { appIdentity } from "#src/app-identity.js";
import { ErrorMessage } from "#src/app/components/error-message.js";
import { StartConversionForm } from "#src/app/components/start-conversion-form.js";
import { DSButton } from "#src/app/design-system/button.js";
import {
  ApiError,
  createGrantQuery,
  createGrantQueryKey,
  exchangeCredential,
} from "#src/data-fetching/trial-link.js";

export const Route = createFileRoute("/trials/$grantId")({
  component: TrialPage,
  beforeLoad: async ({ context, location, params }) => {
    const access = readCredentialFromFragment(location.hash);

    if (access.kind === "malformed") {
      throw new TrialLinkMalformedError(
        "This trial link is invalid. Check that you opened the complete trial link.",
      );
    }

    if (access.kind === "credential") {
      const snapshot = await exchangeCredential(params.grantId, access.credential);
      context.queryClient.setQueryData(createGrantQueryKey(params.grantId), snapshot);
      appIdentity.store({ lastGrantId: params.grantId });
      return redirect({ to: ".", hash: "" });
    }

    if (access.kind === "session") {
      return Promise.resolve();
    }

    check.assertIsUnreachable(access);
  },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(createGrantQuery(params.grantId));
  },
  errorComponent: RouteErrorComponent,
});

function TrialPage(): React.JSX.Element {
  const { grantId } = Route.useParams();
  const grantQuery = useSuspenseQuery(createGrantQuery(grantId));

  return (
    <div
      className={css`
        display: grid;
        gap: calc(3 * var(--spacing-base));
        width: 100%;
      `}
    >
      <header
        className={css`
          text-align: center;
        `}
      >
        <p
          className={css`
            font-family: var(--font-family-2);
            font-size: var(--font-size-lg);
            color: var(--color-fg-emphasized-sm);
          `}
        >
          No reading lists, no tldr.
        </p>
        <h1
          className={css`
            font-size: var(--font-size-display);
            font-weight: var(--font-weight-inter-figma-medium);
            line-height: var(--line-height-display);
          `}
        >
          Just listen.
        </h1>
      </header>
      <StartConversionForm grant={grantQuery.data} />
    </div>
  );
}

function RouteErrorComponent({ error }: ErrorComponentProps): React.JSX.Element {
  const navigate = useNavigate();

  if (error instanceof TrialLinkMalformedError) {
    return (
      <ErrorMessage title="This trial link is invalid.">
        Check that you opened the complete trial link.
      </ErrorMessage>
    );
  }

  if (error instanceof ApiError && error.status < 500 && error.code === "grant-revoked") {
    return (
      <ErrorMessage title="This trial link was revoked.">
        Check that you opened the complete trial link.
      </ErrorMessage>
    );
  }

  if (error instanceof ApiError && error.status < 500) {
    return (
      <ErrorMessage title="This trial link is invalid.">
        Check that you opened the complete trial link.
      </ErrorMessage>
    );
  }

  if (
    error instanceof ApiError &&
    (error.code === "grant-session-required" || error.code === "grant-session-invalid")
  ) {
    return (
      <ErrorMessage title="This browser no longer has access.">
        Open the original trial link again.
      </ErrorMessage>
    );
  }

  return (
    <ErrorMessage title="The trial link could not be opened.">
      <DSButton
        type="button"
        variant="contained"
        onClick={() => navigate({ to: ".", reloadDocument: true })}
      >
        Try again
      </DSButton>
    </ErrorMessage>
  );
}

class TrialLinkMalformedError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TrialLinkInvalidError";
  }
}

type InitialAccess =
  | { kind: "session" }
  | { kind: "credential"; credential: string }
  | { kind: "malformed" };

function readCredentialFromFragment(hash: string): InitialAccess {
  if (hash === "") {
    return { kind: "session" };
  }

  const params = new URLSearchParams(hash);
  const credentials = params.getAll("credential");
  if (
    credentials.length !== 1 ||
    [...params.keys()].some((key) => key !== "credential") ||
    !/^v1\.[A-Za-z0-9_-]{43}$/.test(credentials[0] ?? "")
  ) {
    return { kind: "malformed" };
  }

  return { kind: "credential", credential: credentials[0]! };
}
