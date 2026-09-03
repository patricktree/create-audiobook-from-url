import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

import { createApiServer } from "@create-audiobook-from-url/api-server";
import { createFakeSpeechSynthesisAi } from "@create-audiobook-from-url/audiobook-production/fake";
import {
  ConversionGrantDurableObject,
  ConversionGrantRegistryDurableObject,
} from "@create-audiobook-from-url/conversion-grants";
import {
  runCreateAudiobookFromUrlWorkflow,
  type ConversionParams,
} from "@create-audiobook-from-url/create-audiobook-from-url-workflow/runner";
import { createFakeNarrationContentSelector } from "@create-audiobook-from-url/narration-content-selection/fake";
import { createControlledSourceMaterialPreparer } from "@create-audiobook-from-url/prepare-source-material/fake";

import sourceHtml from "#src/fixtures/source.html";

const CONTROLLED_SOURCE_URL = "https://source.example.test/fixture";

export { ConversionGrantDurableObject, ConversionGrantRegistryDurableObject };

/** Runs the production Workflow pipeline with deterministic local provider adapters. */
export class CreateAudiobookFromUrlQaWorkflow extends WorkflowEntrypoint<Env, ConversionParams> {
  override run(event: WorkflowEvent<ConversionParams>, step: WorkflowStep) {
    assertNoPaidAiBindings(this.env);
    const scenario = parseQaScenario(this.env.QA_SCENARIO);

    return runCreateAudiobookFromUrlWorkflow({
      env: this.env,
      event,
      step,
      services: {
        prepareSourceMaterial: createControlledSourceMaterialPreparer({
          url: CONTROLLED_SOURCE_URL,
          html: sourceHtml,
        }),
        selectNarrationContent: createFakeNarrationContentSelector(),
        speechSynthesisAi: createFakeSpeechSynthesisAi(
          scenario === "tts-failure" ? { failureStatus: 503 } : {},
        ),
      },
    });
  }
}

export default createApiServer({
  validateOperatorAccess: (request) =>
    Promise.resolve(request.headers.get("Cf-Access-Token") === "local-access-token"),
});

type QaScenario = "success" | "tts-failure";

function parseQaScenario(value: string): QaScenario {
  if (value === "success" || value === "tts-failure") {
    return value;
  }

  throw new Error(`Unknown QA scenario: ${value}`);
}

function assertNoPaidAiBindings(env: Env): void {
  const forbiddenBindings = ["AI", "CLOUDFLARE_API_KEY", "CLOUDFLARE_API_TOKEN"];
  const configuredBinding = forbiddenBindings.find((binding) => binding in env);

  if (configuredBinding !== undefined) {
    throw new Error(`Paid AI configuration is forbidden in E2E: ${configuredBinding}`);
  }
}
