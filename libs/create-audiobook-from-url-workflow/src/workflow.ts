import { launch, type BrowserWorker } from "@cloudflare/playwright";
import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

import { selectNarrationContent } from "@create-audiobook-from-url/narration-content-selection";
import { prepareSourceMaterial } from "@create-audiobook-from-url/prepare-source-material";

import {
  runCreateAudiobookFromUrlWorkflow,
  type CreateAudiobookFromUrlWorkflowEnvironment,
  type ConversionParams,
} from "#src/run-create-audiobook-from-url-workflow.ts";

type ProductionWorkflowEnvironment = CreateAudiobookFromUrlWorkflowEnvironment & {
  AI: Parameters<typeof runCreateAudiobookFromUrlWorkflow>[0]["services"]["speechSynthesisAi"];
  BROWSER: BrowserWorker;
};

/** Orchestrates audiobook creation from a source URL with production providers. */
export class CreateAudiobookFromUrlWorkflow extends WorkflowEntrypoint<
  ProductionWorkflowEnvironment,
  ConversionParams
> {
  /** Converts one source URL into stored canonical audio and synchronized EPUB artifacts. */
  override run(event: WorkflowEvent<ConversionParams>, step: WorkflowStep) {
    return runCreateAudiobookFromUrlWorkflow({
      env: this.env,
      event,
      step,
      services: {
        prepareSourceMaterial: async (sourceUrl) => {
          const browser = await launch(this.env.BROWSER);

          try {
            return await prepareSourceMaterial({ browser, url: sourceUrl });
          } finally {
            await browser.close();
          }
        },
        selectNarrationContent,
        speechSynthesisAi: this.env.AI,
      },
    });
  }
}
