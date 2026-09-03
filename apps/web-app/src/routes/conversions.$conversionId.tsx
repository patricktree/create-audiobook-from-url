import { Progress } from "@base-ui/react/progress";
import { css } from "@linaria/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Navigate,
  useNavigate,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import React from "react";

import {
  ConversionPhase,
  conversionPhaseOrder,
} from "@create-audiobook-from-url/conversion-grants/contracts";

import { ErrorMessage } from "#src/app/components/error-message.js";
import { MainSection, SuperHeader } from "#src/app/components/main-components.js";
import { DSButton } from "#src/app/design-system/button.js";
import { createConversionQuery } from "#src/data-fetching/trial-link.js";

const CONVERSION_PHASE_LABELS = {
  [ConversionPhase.CONVERSION_START]: "Starting conversion",
  [ConversionPhase.SOURCE_MATERIAL_PREPARATION]: "Preparing audiobook source material",
  [ConversionPhase.NARRATION_CONTENT_SELECTION]: "Selecting narration content",
  [ConversionPhase.NARRATION_DOCUMENT_CREATION]: "Creating narration document",
  [ConversionPhase.AUDIO_SEGMENT_PRODUCTION]: "Producing narration audio",
  [ConversionPhase.AUDIOBOOK_ASSEMBLY]: "Assembling audiobook audio",
  [ConversionPhase.AUDIOBOOK_STORAGE]: "Storing audiobook",
  [ConversionPhase.FINALIZATION]: "Finalizing conversion",
} as const satisfies Record<ConversionPhase, string>;

export const Route = createFileRoute("/conversions/$conversionId")({
  component: ConversionPage,
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(createConversionQuery(params.conversionId));
  },
  errorComponent: RouteErrorComponent,
});

function ConversionPage(): React.JSX.Element {
  const { conversionId } = Route.useParams();
  const conversionQuery = useSuspenseQuery(createConversionQuery(conversionId));

  if (conversionQuery.data.status === "ready") {
    return (
      <Navigate to="/audiobooks/$conversionId" params={{ conversionId: conversionId }} replace />
    );
  }

  return (
    <MainSection>
      <SuperHeader />

      {conversionQuery.data.status === "pending" ? (
        <PendingConversionProgress lastStartedPhase={conversionQuery.data.lastStartedPhase} />
      ) : (
        <>
          <span>Failed!</span>
          <span>{conversionQuery.data.failure.explanation}</span>
        </>
      )}
    </MainSection>
  );
}

function PendingConversionProgress({
  lastStartedPhase,
}: {
  lastStartedPhase: ConversionPhase;
}): React.JSX.Element {
  const lastStartedPhaseIndex = conversionPhaseOrder.indexOf(lastStartedPhase);
  const workflowProgress = ((lastStartedPhaseIndex + 1) / conversionPhaseOrder.length) * 100;

  return (
    <Progress.Root
      className={css`
        display: grid;
        gap: calc(2 * var(--spacing-base));
      `}
      value={workflowProgress}
    >
      <Progress.Track
        className={css`
          height: var(--spacing-base);

          overflow: hidden;
          background-color: hsl(var(--color-black-hsl) / 10%);
          border-radius: 999px;
        `}
      >
        <Progress.Indicator
          className={css`
            height: 100%;

            position: relative;
            overflow: hidden;
            background: linear-gradient(
              90deg,
              color-mix(in srgb, var(--color-primary), var(--color-black) 35%),
              color-mix(in srgb, var(--color-primary), var(--color-white) 18%)
            );
            border-radius: inherit;

            &::after {
              content: "";
              position: absolute;
              inset-block: 0;
              left: 0;
              width: 50%;
              background: linear-gradient(
                90deg,
                transparent,
                color-mix(in srgb, var(--color-white) 45%, transparent),
                transparent
              );
              transform: translateX(-100%);
              animation: progress-indicator-pulse 2s ease-in-out infinite;
            }

            @keyframes progress-indicator-pulse {
              to {
                transform: translateX(200%);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              &::after {
                animation: none;
              }
            }
          `}
        />
      </Progress.Track>
      <Progress.Label
        className={css`
          color: var(--color-fg-emphasized-sm);
          font-size: 18px;
        `}
      >
        {CONVERSION_PHASE_LABELS[lastStartedPhase]}...
      </Progress.Label>
    </Progress.Root>
  );
}

function RouteErrorComponent(_props: ErrorComponentProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <ErrorMessage title="The conversion could not be opened.">
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
