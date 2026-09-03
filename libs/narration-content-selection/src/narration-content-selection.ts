import pMap from "p-map";
import { parseFragment, serializeOuter } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { z } from "zod";

import {
  SOURCE_ELEMENT_ID_ATTRIBUTE,
  annotateSourceElements,
  filterSourceByElementIds,
} from "#src/source-element-selection.ts";
import type { AnnotatedSource, SourceElementIds } from "#src/source-element-selection.ts";

export type SelectionTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

type SelectionCompletionRequest = {
  systemPrompt: string;
  userPrompt: string;
  tool: SelectionTool;
};

type SelectionCompletionOptions = {
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
};

type SelectionCompletionCallOptions = SelectionCompletionOptions & {
  signal?: AbortSignal;
  apiKey?: string;
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  gatewayMetadata?: Record<string, string | number>;
};

export type SelectionToolCall = {
  id: string;
  name: string;
  arguments: unknown;
};

export type SelectionCostEstimateBasis = {
  currency: "USD";
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  pricingSource: string;
};

type SelectionCompletionUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCostUsd?: number;
  costEstimateBasis?: SelectionCostEstimateBasis;
};

export type SelectionCompletionResponse = {
  provider: string;
  model: string;
  responseModel?: string;
  responseId?: string;
  toolCalls: readonly SelectionToolCall[];
  stopReason: "toolUse" | "length" | "stop" | "error" | "aborted";
  rawStopReason?: string;
  errorMessage?: string;
  usage: SelectionCompletionUsage;
};

export type SelectionCompletion = (
  request: SelectionCompletionRequest,
  options?: SelectionCompletionCallOptions,
) => Promise<SelectionCompletionResponse>;

export type SelectionConfig = {
  completion: SelectionCompletion;
  systemPrompt: string;
  tool: SelectionTool;
  completionOptions: SelectionCompletionOptions;
};

export type SelectionResult = {
  selectedElementIds: SourceElementIds;
  selectedSourceMaterialHtml: string;
  chunkCount: number;
  responses: readonly SelectionCompletionResponse[];
};

export type NarrationContentSelectionUsage = {
  provider: string;
  model: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd?: number;
  costEstimateBasis?: SelectionCostEstimateBasis;
};

export type NarrationContentSelectionResult = {
  selectedSourceMaterialHtml: string;
  chunkCount: number;
  usage: NarrationContentSelectionUsage;
};

export const SELECTION_ARGS_SCHEMA = z
  .object({
    element_ids: z.array(z.string().nonempty()),
  })
  .strict();

const GENERATED_ELEMENT_ID_ATTRIBUTE_PATTERN = new RegExp(
  `\\s${SOURCE_ELEMENT_ID_ATTRIBUTE}="[^"]*"`,
  "g",
);
const SOURCE_ELEMENT_ID_ATTRIBUTE_PATTERN = new RegExp(
  `\\s${SOURCE_ELEMENT_ID_ATTRIBUTE}="([^"]*)"`,
  "g",
);
const MAX_ANNOTATED_SOURCE_CHUNK_CHARACTERS = 4_000;
const MAX_ANNOTATED_SOURCE_CHUNK_ELEMENTS = 40;
const LENGTH_RETRY_MAX_TOKENS = [768, 1_024, 2_048, 4_096] as const;
const SELECTION_CONCURRENCY = 6;

export function createContentSelector(configuration: SelectionConfig) {
  return async function selectNarrationContent(
    sourceMaterialHtml: string,
    {
      signal,
      conversionId,
    }: {
      signal?: AbortSignal;
      conversionId?: string;
    } = {},
  ): Promise<NarrationContentSelectionResult> {
    const result = await runSelection({
      configuration,
      sourceMaterialHtml,
      ...(signal ? { signal } : {}),
      ...(conversionId ? { conversionId } : {}),
    });

    return {
      selectedSourceMaterialHtml: result.selectedSourceMaterialHtml,
      chunkCount: result.chunkCount,
      usage: aggregateSelectionUsage(result.responses),
    };
  };
}

export async function runSelection({
  configuration,
  sourceMaterialHtml,
  signal,
  conversionId,
}: {
  configuration: SelectionConfig;
  sourceMaterialHtml: string;
  signal?: AbortSignal;
  conversionId?: string;
}): Promise<SelectionResult> {
  const annotatedSourceMaterial = await annotateSourceElements(sourceMaterialHtml);
  const annotatedSourceChunks = await createAnnotatedSourceChunks(annotatedSourceMaterial);
  const selections = await pMap(
    annotatedSourceChunks,
    async (annotatedSourceChunk, chunkIndex) => {
      try {
        return await selectElementIds({
          configuration,
          annotatedSourceMaterial: annotatedSourceChunk,
          ...(signal ? { signal } : {}),
          ...(conversionId
            ? {
                gatewayMetadata: {
                  conversionId,
                  stage: "content-selection",
                  chunkIndex: chunkIndex + 1,
                },
              }
            : {}),
        });
      } catch (error) {
        const chunkContext = `Narration content selection chunk ${chunkIndex + 1} of ${annotatedSourceChunks.length} failed`;

        if (error instanceof Error) {
          error.message = `${chunkContext}: ${error.message}`;
          throw error;
        }

        throw error;
      }
    },
    {
      concurrency: SELECTION_CONCURRENCY,
      ...(signal ? { signal } : {}),
    },
  );

  const selectedElementIdSet = new Set(
    selections.flatMap((selection) => selection.selectedElementIds),
  );
  const selectedElementIds = annotatedSourceMaterial.elementIds.filter((elementId) =>
    selectedElementIdSet.has(elementId),
  );

  if (!isSourceElementIds(selectedElementIds)) {
    throw new Error("Expected at least one narration source element ID");
  }

  const selectedAnnotatedSourceMaterialHtml = await filterSourceByElementIds({
    annotatedSourceMaterial,
    selectedElementIds,
  });

  const selectedSourceMaterialHtml = selectedAnnotatedSourceMaterialHtml.replace(
    GENERATED_ELEMENT_ID_ATTRIBUTE_PATTERN,
    "",
  );

  return {
    selectedElementIds,
    selectedSourceMaterialHtml,
    chunkCount: annotatedSourceChunks.length,
    responses: selections.flatMap((selection) => selection.responses),
  };
}

export async function selectElementIds({
  configuration,
  annotatedSourceMaterial,
  signal,
  gatewayMetadata,
}: {
  configuration: SelectionConfig;
  annotatedSourceMaterial: AnnotatedSource;
  signal?: AbortSignal;
  gatewayMetadata?: Record<string, string | number>;
}): Promise<{ selectedElementIds: string[]; responses: SelectionCompletionResponse[] }> {
  const request: SelectionCompletionRequest = {
    systemPrompt: configuration.systemPrompt,
    userPrompt: `<audiobook-source-material-html>\n${annotatedSourceMaterial.html}\n</audiobook-source-material-html>`,
    tool: configuration.tool,
  };
  const completionOptions = {
    ...configuration.completionOptions,
    ...(signal ? { signal } : {}),
  };
  const responses = [
    await configuration.completion(request, {
      ...completionOptions,
      ...(gatewayMetadata ? { gatewayMetadata: { ...gatewayMetadata, selectionAttempt: 1 } } : {}),
    }),
  ];
  for (const maxTokens of LENGTH_RETRY_MAX_TOKENS) {
    const previousResponse = responses[responses.length - 1]!;

    if (
      previousResponse.stopReason !== "length" ||
      completionOptions.maxTokens === undefined ||
      completionOptions.maxTokens >= maxTokens
    ) {
      continue;
    }

    responses.push(
      await configuration.completion(request, {
        ...completionOptions,
        maxTokens,
        ...(gatewayMetadata
          ? { gatewayMetadata: { ...gatewayMetadata, selectionAttempt: responses.length + 1 } }
          : {}),
      }),
    );
  }

  const response = responses[responses.length - 1]!;
  const selectedElementIds = parseSourceElementIds(
    response,
    annotatedSourceMaterial,
    configuration.tool.name,
  );

  return { selectedElementIds, responses };
}

function aggregateSelectionUsage(
  responses: readonly SelectionCompletionResponse[],
): NarrationContentSelectionUsage {
  const firstResponse = responses[0];

  if (!firstResponse) {
    throw new Error("Expected at least one narration content selection response");
  }

  for (const response of responses) {
    if (response.provider !== firstResponse.provider || response.model !== firstResponse.model) {
      throw new Error("Expected narration content selection responses from one provider and model");
    }
  }

  const estimatedCosts = responses.map((response) => response.usage.estimatedCostUsd);
  const hasCompleteCostEstimate = estimatedCosts.every(
    (estimatedCost): estimatedCost is number => estimatedCost !== undefined,
  );
  const costEstimateBasis = firstResponse.usage.costEstimateBasis;

  if (
    costEstimateBasis !== undefined &&
    responses.some(
      (response) =>
        JSON.stringify(response.usage.costEstimateBasis) !== JSON.stringify(costEstimateBasis),
    )
  ) {
    throw new Error("Expected one pricing basis for narration content selection responses");
  }

  return {
    provider: firstResponse.provider,
    model: firstResponse.model,
    requestCount: responses.length,
    inputTokens: sumUsage(responses, "inputTokens"),
    outputTokens: sumUsage(responses, "outputTokens"),
    reasoningTokens: sumUsage(responses, "reasoningTokens"),
    totalTokens: sumUsage(responses, "totalTokens"),
    cacheReadTokens: sumUsage(responses, "cacheReadTokens"),
    cacheWriteTokens: sumUsage(responses, "cacheWriteTokens"),
    ...(hasCompleteCostEstimate
      ? { estimatedCostUsd: estimatedCosts.reduce((total, cost) => total + cost, 0) }
      : {}),
    ...(costEstimateBasis ? { costEstimateBasis } : {}),
  };
}

function sumUsage(
  responses: readonly SelectionCompletionResponse[],
  field:
    | "inputTokens"
    | "outputTokens"
    | "reasoningTokens"
    | "totalTokens"
    | "cacheReadTokens"
    | "cacheWriteTokens",
): number {
  return responses.reduce((total, response) => total + (response.usage[field] ?? 0), 0);
}

async function createAnnotatedSourceChunks(
  annotatedSourceMaterial: AnnotatedSource,
): Promise<AnnotatedSource[]> {
  const documentFragment = parseFragment(annotatedSourceMaterial.html);
  const selectionUnits = documentFragment.childNodes.flatMap((childNode) =>
    "tagName" in childNode ? collectSelectionUnits(childNode) : [],
  );
  const chunkDefinitions: SelectionChunkDefinition[] = [];
  let currentChunk: SelectionChunkDefinition | undefined;

  for (const selectionUnit of selectionUnits) {
    const wouldExceedChunkLimit =
      currentChunk !== undefined &&
      (currentChunk.characterCount + selectionUnit.characterCount >
        MAX_ANNOTATED_SOURCE_CHUNK_CHARACTERS ||
        currentChunk.elementIds.length + selectionUnit.elementIds.length >
          MAX_ANNOTATED_SOURCE_CHUNK_ELEMENTS);

    if (wouldExceedChunkLimit && currentChunk) {
      chunkDefinitions.push(currentChunk);
      currentChunk = undefined;
    }

    if (currentChunk) {
      currentChunk.rootElementIds.push(selectionUnit.rootElementId);
      currentChunk.elementIds.push(...selectionUnit.elementIds);
      currentChunk.characterCount += selectionUnit.characterCount;
    } else {
      currentChunk = {
        rootElementIds: [selectionUnit.rootElementId],
        elementIds: [...selectionUnit.elementIds],
        characterCount: selectionUnit.characterCount,
      };
    }
  }

  if (currentChunk) {
    chunkDefinitions.push(currentChunk);
  }

  return Promise.all(
    chunkDefinitions.map(async (chunkDefinition) => {
      const selectedElementIds = asSourceElementIds(chunkDefinition.rootElementIds);
      const chunkWithAnnotatedAncestors = await filterSourceByElementIds({
        annotatedSourceMaterial,
        selectedElementIds,
      });
      const selectableElementIdSet = new Set(chunkDefinition.elementIds);
      const html = chunkWithAnnotatedAncestors.replace(
        SOURCE_ELEMENT_ID_ATTRIBUTE_PATTERN,
        (attribute, elementId: string) => (selectableElementIdSet.has(elementId) ? attribute : ""),
      );

      return { html, elementIds: chunkDefinition.elementIds };
    }),
  );
}

type SelectionUnit = {
  rootElementId: string;
  elementIds: string[];
  characterCount: number;
};

type SelectionChunkDefinition = {
  rootElementIds: string[];
  elementIds: string[];
  characterCount: number;
};

function collectSelectionUnits(element: DefaultTreeAdapterMap["element"]): SelectionUnit[] {
  const elementIds = collectElementIds(element);
  const characterCount = serializeOuter(element).length;
  const childElements = getElementContent(element).childNodes.filter(
    (childNode): childNode is DefaultTreeAdapterMap["element"] => "tagName" in childNode,
  );
  const isWithinChunkLimits =
    characterCount <= MAX_ANNOTATED_SOURCE_CHUNK_CHARACTERS &&
    elementIds.length <= MAX_ANNOTATED_SOURCE_CHUNK_ELEMENTS;

  if (isWithinChunkLimits || childElements.length === 0 || hasMeaningfulDirectText(element)) {
    return [
      {
        rootElementId: getElementId(element),
        elementIds,
        characterCount,
      },
    ];
  }

  return childElements.flatMap(collectSelectionUnits);
}

function collectElementIds(element: DefaultTreeAdapterMap["element"]): string[] {
  return [
    getElementId(element),
    ...getElementContent(element).childNodes.flatMap((childNode) =>
      "tagName" in childNode ? collectElementIds(childNode) : [],
    ),
  ];
}

function hasMeaningfulDirectText(element: DefaultTreeAdapterMap["element"]): boolean {
  return getElementContent(element).childNodes.some(
    (childNode) => "value" in childNode && Boolean(childNode.value.trim()),
  );
}

function getElementContent(
  element: DefaultTreeAdapterMap["element"],
): DefaultTreeAdapterMap["parentNode"] {
  return isTemplateElement(element) ? element.content : element;
}

function isTemplateElement(
  element: DefaultTreeAdapterMap["element"],
): element is DefaultTreeAdapterMap["template"] {
  return element.tagName === "template" && "content" in element;
}

function getElementId(element: DefaultTreeAdapterMap["element"]): string {
  const elementId = element.attrs.find(
    (attribute) => attribute.name === SOURCE_ELEMENT_ID_ATTRIBUTE,
  )?.value;

  if (elementId === undefined) {
    throw new Error(
      `Expected every HTML element to have a ${SOURCE_ELEMENT_ID_ATTRIBUTE} attribute`,
    );
  }

  return elementId;
}

function asSourceElementIds(elementIds: string[]): SourceElementIds {
  if (!isSourceElementIds(elementIds)) {
    throw new Error("Expected at least one source element ID per selection chunk");
  }

  return elementIds;
}

function parseSourceElementIds(
  response: SelectionCompletionResponse,
  annotatedSourceMaterial: AnnotatedSource,
  toolName: string,
): string[] {
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(
      `The AI request ${response.stopReason}: ${response.errorMessage ?? "The provider did not provide an error message"}`,
    );
  }

  const selectionToolCalls = response.toolCalls.filter((toolCall) => toolCall.name === toolName);

  if (selectionToolCalls.length !== 1) {
    throw new Error(
      `Expected exactly one ${toolName} call, received ${selectionToolCalls.length} (stop reason: ${response.stopReason})`,
    );
  }

  const rawSelectionArguments: unknown = selectionToolCalls[0]!.arguments;
  const parsedSelectionArguments = SELECTION_ARGS_SCHEMA.safeParse(rawSelectionArguments);

  if (!parsedSelectionArguments.success) {
    throw new Error("The AI selection tool arguments were invalid");
  }

  const selectionArguments = parsedSelectionArguments.data;

  const availableElementIdSet = new Set(annotatedSourceMaterial.elementIds);
  const unknownElementIds = selectionArguments.element_ids.filter(
    (elementId) => !availableElementIdSet.has(elementId),
  );

  if (unknownElementIds.length > 0) {
    throw new Error(
      `The AI selected unknown ${SOURCE_ELEMENT_ID_ATTRIBUTE} values: ${unknownElementIds.join(", ")}`,
    );
  }

  const selectedElementIdSet = new Set(selectionArguments.element_ids);
  const narrationSourceElementIds = annotatedSourceMaterial.elementIds.filter((elementId) =>
    selectedElementIdSet.has(elementId),
  );

  if (selectionArguments.element_ids.length > 0 && narrationSourceElementIds.length === 0) {
    throw new Error("Expected at least one narration source element ID");
  }

  return narrationSourceElementIds;
}

function isSourceElementIds(elementIds: readonly string[]): elementIds is SourceElementIds {
  return elementIds.length > 0;
}
