import { expect, test } from "vitest";

import { selectNarrationContent as productionSelector } from "@create-audiobook-from-url/narration-content-selection";

import {
  createContentSelector,
  selectElementIds,
  type SelectionCompletionResponse,
  type SelectionConfig,
  type SelectionCompletion,
  type SelectionToolCall,
} from "#src/narration-content-selection.ts";
import { PRODUCTION_CONFIG } from "#src/production-narration-content-selection.ts";
import { SOURCE_ELEMENT_ID_ATTRIBUTE } from "#src/source-element-selection.ts";

test("returns selected narration HTML in document order without internal element IDs", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage(
      fauxToolCall("select_narration_content", { element_ids: ["2", "0", "2"] }),
      {
        stopReason: "toolUse",
      },
    ),
  );

  const result = await selectNarrationContent("<p>Zero</p><p>One</p><p>Two</p>");

  expect(result).toEqual(fauxSelectionResult("<p>Zero</p><p>Two</p>"));
});

test("selects narration content from source material larger than one completion request", async () => {
  const maximumElementsPerCompletion = 40;
  const completionElementCounts: number[] = [];
  const completionInputs: string[] = [];
  const sourceMaterialHtml = `<article>${Array.from(
    { length: maximumElementsPerCompletion + 1 },
    (_, index) => `<p>Paragraph ${index}</p>`,
  ).join("")}</article>`;
  const response = fauxAssistantMessage([], { stopReason: "toolUse" });
  const selectNarrationContent = createContentSelector(
    createConfiguration(response, {
      completion: async (context) => {
        const elementIds = [
          ...context.userPrompt.matchAll(
            new RegExp(`${SOURCE_ELEMENT_ID_ATTRIBUTE}="([^"]+)"`, "g"),
          ),
        ].map((match) => match[1]!);

        completionInputs.push(context.userPrompt);
        completionElementCounts.push(elementIds.length);

        if (elementIds.length > maximumElementsPerCompletion) {
          throw new Error("Completion received oversized source material");
        }

        return fauxAssistantMessage(
          fauxToolCall("select_narration_content", { element_ids: elementIds }),
          { stopReason: "toolUse" },
        );
      },
    }),
  );

  await expect(selectNarrationContent(sourceMaterialHtml)).resolves.toEqual({
    ...fauxSelectionResult(sourceMaterialHtml, 2),
    chunkCount: 2,
  });
  expect(completionElementCounts).toEqual([maximumElementsPerCompletion, 1]);
  expect(completionInputs).toHaveLength(2);

  for (const completionInput of completionInputs) {
    expect(completionInput).toContain("<article>");
    expect(completionInput).not.toContain(`<article ${SOURCE_ELEMENT_ID_ATTRIBUTE}=`);
  }
});

test("splits source material by serialized size below the element limit", async () => {
  const sourceMaterialHtml = `<article><p>${"A".repeat(16_000)}</p><p>${"B".repeat(16_000)}</p></article>`;
  const response = fauxAssistantMessage([], { stopReason: "toolUse" });
  const completionElementCounts: number[] = [];
  const selectNarrationContent = createContentSelector(
    createConfiguration(response, {
      completion: async (context) => {
        const elementIds = [
          ...context.userPrompt.matchAll(
            new RegExp(`${SOURCE_ELEMENT_ID_ATTRIBUTE}="([^"]+)"`, "g"),
          ),
        ].map((match) => match[1]!);
        completionElementCounts.push(elementIds.length);

        return fauxAssistantMessage(
          fauxToolCall("select_narration_content", { element_ids: elementIds }),
          { stopReason: "toolUse" },
        );
      },
    }),
  );

  await expect(selectNarrationContent(sourceMaterialHtml)).resolves.toEqual({
    ...fauxSelectionResult(sourceMaterialHtml, 2),
    chunkCount: 2,
  });
  expect(completionElementCounts).toEqual([1, 1]);
});

test("starts the next completion as soon as a concurrency slot becomes available", async () => {
  const pendingCompletions = Array.from({ length: 6 }, () => createDeferred());
  const firstSixCompletionsStarted = createDeferred();
  const seventhCompletionStarted = createDeferred();
  let startedCompletionCount = 0;
  const sourceMaterialHtml = `<article>${Array.from(
    { length: 7 },
    (_, index) => `<p>${index}-${"A".repeat(4_000)}</p>`,
  ).join("")}</article>`;
  const selectNarrationContent = createContentSelector(
    createConfiguration(fauxAssistantMessage(), {
      completion: async (context) => {
        const completionIndex = startedCompletionCount;
        startedCompletionCount += 1;

        if (startedCompletionCount === 6) {
          firstSixCompletionsStarted.resolve();
        }

        if (startedCompletionCount === 7) {
          seventhCompletionStarted.resolve();
        }

        const elementIds = [
          ...context.userPrompt.matchAll(
            new RegExp(`${SOURCE_ELEMENT_ID_ATTRIBUTE}="([^"]+)"`, "g"),
          ),
        ].map((match) => match[1]!);

        if (completionIndex < pendingCompletions.length) {
          await pendingCompletions[completionIndex]!.promise;
        }

        return fauxAssistantMessage(
          fauxToolCall("select_narration_content", { element_ids: elementIds }),
          { stopReason: "toolUse" },
        );
      },
    }),
  );

  const selection = selectNarrationContent(sourceMaterialHtml);
  await firstSixCompletionsStarted.promise;

  expect(startedCompletionCount).toBe(6);

  pendingCompletions[0]!.resolve();
  await seventhCompletionStarted.promise;

  expect(startedCompletionCount).toBe(7);

  for (const pendingCompletion of pendingCompletions.slice(1)) {
    pendingCompletion.resolve();
  }

  await expect(selection).resolves.toEqual({
    ...fauxSelectionResult(sourceMaterialHtml, 7),
    chunkCount: 7,
  });
});

test("rejects source material when every completion selects no narration content", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage(fauxToolCall("select_narration_content", { element_ids: [] }), {
      stopReason: "toolUse",
    }),
  );

  await expect(selectNarrationContent("<p>Not narration content</p>")).rejects.toThrow(
    "Expected at least one narration source element ID",
  );
});

test("uses the configured prompt, tool, completion options, and abort signal", async () => {
  const response = fauxAssistantMessage(
    fauxToolCall("experimental_select", { element_ids: ["0"] }),
    { stopReason: "toolUse" },
  );
  const abortController = new AbortController();
  const completionContexts: unknown[] = [];
  const completionOptions: unknown[] = [];
  const configuration = createConfiguration(response, {
    completion: async (context, options) => {
      completionContexts.push(context);
      completionOptions.push(options);
      return response;
    },
    systemPrompt: "Experimental system prompt",
    tool: {
      ...PRODUCTION_CONFIG.tool,
      name: "experimental_select",
      description: "Experimental tool description",
    },
    completionOptions: {
      temperature: 0.3,
      maxTokens: 2_048,
    },
  });
  const selectNarrationContent = createContentSelector(configuration);

  await selectNarrationContent("<p>Narrate me</p>", {
    signal: abortController.signal,
    conversionId: "conversion-123",
  });

  expect(completionContexts).toEqual([
    expect.objectContaining({
      systemPrompt: "Experimental system prompt",
      tool: expect.objectContaining({
        name: "experimental_select",
        description: "Experimental tool description",
      }),
    }),
  ]);
  expect(completionOptions).toEqual([
    {
      maxTokens: 2_048,
      signal: abortController.signal,
      temperature: 0.3,
      gatewayMetadata: {
        conversionId: "conversion-123",
        stage: "content-selection",
        chunkIndex: 1,
        selectionAttempt: 1,
      },
    },
  ]);
});

test("uses a synchronous Cloudflare response for production selection", async () => {
  const requestBodies: unknown[] = [];
  const response = await PRODUCTION_CONFIG.completion(
    {
      systemPrompt: "Select narration content",
      userPrompt: '<p data-createaudiobookfromurl-element-id="0">Narrate me</p>',
      tool: PRODUCTION_CONFIG.tool,
    },
    {
      ...PRODUCTION_CONFIG.completionOptions,
      apiKey: "test-api-key",
      env: { CLOUDFLARE_ACCOUNT_ID: "test-account" },
      gatewayMetadata: {
        conversionId: "conversion-123",
        stage: "content-selection",
        chunkIndex: 1,
        selectionAttempt: 1,
      },
      fetch: async (input, init) => {
        const requestUrl =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

        expect(requestUrl).toBe(
          "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1/chat/completions",
        );
        expect(init?.method).toBe("POST");
        const headers = new Headers(init?.headers);
        expect(headers.get("cf-aig-gateway-id")).toBe("default");
        expect(headers.get("cf-aig-collect-log")).toBe("true");
        expect(headers.get("cf-aig-collect-log-payload")).toBe("false");
        expect(JSON.parse(headers.get("cf-aig-metadata") ?? "")).toEqual({
          conversionId: "conversion-123",
          stage: "content-selection",
          chunkIndex: 1,
          selectionAttempt: 1,
        });

        if (typeof init?.body !== "string") {
          throw new Error("Expected a JSON request body");
        }

        requestBodies.push(JSON.parse(init.body));

        if (requestBodies.length === 1) {
          return new Response(JSON.stringify({ errors: [{ message: "Request timeout" }] }), {
            status: 408,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            id: "response-1",
            model: "@cf/qwen/qwen3.8-27b",
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "tool-call-1",
                      type: "function",
                      function: {
                        name: "select_narration_content",
                        arguments: JSON.stringify({ element_ids: ["0"] }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
              completion_tokens_details: { reasoning_tokens: 2 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  expect(requestBodies).toHaveLength(2);

  for (const requestBody of requestBodies) {
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: "@cf/qwen/qwen3.8-27b",
        stream: false,
        tool_choice: "required",
        reasoning_effort: "low",
        temperature: 0,
        max_completion_tokens: 512,
      }),
    );
  }
  expect(response).toEqual(
    expect.objectContaining({
      provider: "cloudflare-workers-ai",
      model: "@cf/qwen/qwen3.8-27b",
      stopReason: "toolUse",
      toolCalls: [
        {
          id: "tool-call-1",
          name: "select_narration_content",
          arguments: { element_ids: ["0"] },
        },
      ],
      usage: expect.objectContaining({
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 2,
        totalTokens: 15,
      }),
    }),
  );
  expect(response.usage).not.toHaveProperty("cacheReadTokens");
  expect(response.usage).not.toHaveProperty("cacheWriteTokens");
  expect(response.usage.estimatedCostUsd).toBeCloseTo(0.000_020_5);
  expect(response.usage.costEstimateBasis).toEqual({
    currency: "USD",
    inputUsdPerMillionTokens: 0.45,
    outputUsdPerMillionTokens: 3.2,
    pricingSource: "https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/",
  });
});

test("retries a length-limited chunk with a larger completion budget", async () => {
  const completionOptions: unknown[] = [];
  const responses = [
    fauxAssistantMessage([], { stopReason: "length" }),
    fauxAssistantMessage([], { stopReason: "length" }),
    fauxAssistantMessage([], { stopReason: "length" }),
    fauxAssistantMessage([], { stopReason: "length" }),
    fauxAssistantMessage(fauxToolCall("select_narration_content", { element_ids: ["0"] }), {
      stopReason: "toolUse",
    }),
  ].map((response, index) => ({
    ...response,
    usage: {
      inputTokens: index + 1,
      outputTokens: 2,
      reasoningTokens: 1,
      totalTokens: index + 4,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      estimatedCostUsd: 0.001,
    },
  }));
  const selectNarrationContent = createContentSelector(
    createConfiguration(responses[0]!, {
      completion: async (_context, options) => {
        completionOptions.push(options);
        const response = responses.shift();

        if (!response) {
          throw new Error("Expected a configured completion response");
        }

        return response;
      },
      completionOptions: { maxTokens: 512 },
    }),
  );

  await expect(selectNarrationContent("<p>Narrate me</p>")).resolves.toEqual({
    selectedSourceMaterialHtml: "<p>Narrate me</p>",
    chunkCount: 1,
    usage: {
      provider: "faux",
      model: "faux-model",
      requestCount: 5,
      inputTokens: 15,
      outputTokens: 10,
      reasoningTokens: 5,
      totalTokens: 30,
      cacheReadTokens: 15,
      cacheWriteTokens: 20,
      estimatedCostUsd: 0.005,
    },
  });
  expect(completionOptions).toEqual([
    { maxTokens: 512 },
    { maxTokens: 768 },
    { maxTokens: 1_024 },
    { maxTokens: 2_048 },
    { maxTokens: 4_096 },
  ]);
});

test("rejects a response without the selection tool call", async () => {
  const selectNarrationContent = createSelector(fauxAssistantMessage(fauxText("No selection")));

  await expect(selectNarrationContent("<p>Narrate me</p>")).rejects.toThrow(
    "Expected exactly one select_narration_content call, received 0 (stop reason: stop)",
  );
});

test("rejects multiple selection tool calls", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage(
      [
        fauxToolCall("select_narration_content", { element_ids: ["0"] }),
        fauxToolCall("select_narration_content", { element_ids: ["0"] }),
      ],
      { stopReason: "toolUse" },
    ),
  );

  await expect(selectNarrationContent("<p>Narrate me</p>")).rejects.toThrow(
    "Expected exactly one select_narration_content call, received 2 (stop reason: toolUse)",
  );
});

test("reports provider errors", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage([], {
      stopReason: "error",
      errorMessage: "provider unavailable",
    }),
  );

  await expect(selectNarrationContent("<p>Narrate me</p>")).rejects.toThrow(
    "The AI request error: provider unavailable",
  );
});

test("reports a missing provider error message", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage([], { stopReason: "aborted" }),
  );

  await expect(selectNarrationContent("<p>Narrate me</p>")).rejects.toThrow(
    "The AI request aborted: The provider did not provide an error message",
  );
});

test("rejects malformed selection tool arguments", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage(fauxToolCall("select_narration_content", { element_ids: null }), {
      stopReason: "toolUse",
    }),
  );

  await expect(selectNarrationContent("<p>Narrate me</p>")).rejects.toThrow(
    "The AI selection tool arguments were invalid",
  );
});

test("rejects element IDs that were not supplied to the model", async () => {
  const selectNarrationContent = createSelector(
    fauxAssistantMessage(fauxToolCall("select_narration_content", { element_ids: ["unknown"] }), {
      stopReason: "toolUse",
    }),
  );

  await expect(selectNarrationContent("<p>Narrate me</p>")).rejects.toThrow(
    "The AI selected unknown data-createaudiobookfromurl-element-id values: unknown",
  );
});

test("rejects an inconsistent source element ID collection", async () => {
  const response = fauxAssistantMessage(
    fauxToolCall("select_narration_content", { element_ids: ["0"] }),
    { stopReason: "toolUse" },
  );
  const elementIds = Object.assign(["0"], { filter: () => [] });

  await expect(
    selectElementIds({
      configuration: createConfiguration(response),
      annotatedSourceMaterial: { html: "", elementIds },
    }),
  ).rejects.toThrow("Expected at least one narration source element ID");
});

test("exports the production narration content selector", () => {
  expect(productionSelector).toBeTypeOf("function");
});

function createSelector(response: SelectionCompletionResponse) {
  return createContentSelector(createConfiguration(response));
}

function createConfiguration(
  response: SelectionCompletionResponse,
  overrides: Partial<SelectionConfig> = {},
): SelectionConfig {
  return {
    ...PRODUCTION_CONFIG,
    completion: createCompletion(response),
    ...overrides,
  };
}

function createCompletion(response: SelectionCompletionResponse): SelectionCompletion {
  return async () => response;
}

function fauxAssistantMessage(
  content: SelectionToolCall | readonly SelectionToolCall[] | undefined = [],
  overrides: Partial<SelectionCompletionResponse> = {},
): SelectionCompletionResponse {
  const toolCalls = content === undefined ? [] : Array.isArray(content) ? content : [content];

  return {
    provider: "faux",
    model: "faux-model",
    toolCalls,
    stopReason: "stop",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    ...overrides,
  };
}

function fauxToolCall(name: string, argumentsValue: unknown): SelectionToolCall {
  return { id: `call-${name}`, name, arguments: argumentsValue };
}

function fauxText(_text: string): undefined {
  return undefined;
}

function fauxSelectionResult(selectedSourceMaterialHtml: string, requestCount = 1) {
  return {
    selectedSourceMaterialHtml,
    chunkCount: 1,
    usage: {
      provider: "faux",
      model: "faux-model",
      requestCount,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
