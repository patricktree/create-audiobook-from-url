import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { RouteHandler } from "@hono/zod-openapi";

import {
  audiobookSchema,
  browserMutationHeadersSchema,
  conversionParamsSchema,
  errorResponseSchema,
  exchangeCredentialRequestSchema,
  conversionDetailSchema,
  grantConversionsSchema,
  grantParamsSchema,
  grantSnapshotSchema,
  startConversionHeadersSchema,
  startConversionRequestSchema,
  startConversionResponseSchema,
} from "#src/contracts.ts";

type ErrorResponseDefinition = {
  content?: { "application/json": { schema: typeof errorResponseSchema } };
  description: string;
};

const errorResponse = (description: string): ErrorResponseDefinition => ({
  content: { "application/json": { schema: errorResponseSchema } },
  description,
});
const binarySchema = z.string().openapi({ type: "string", format: "binary" });
const routeBrowserMutationHeadersSchema = browserMutationHeadersSchema.omit({
  "content-type": true,
});
const routeStartConversionHeadersSchema = startConversionHeadersSchema.omit({
  "content-type": true,
});

const exchangeSessionRoute = createRoute({
  method: "post",
  path: "/api/grants/{grantId}/sessions",
  request: {
    params: grantParamsSchema,
    headers: routeBrowserMutationHeadersSchema,
    body: {
      required: true,
      content: { "application/json": { schema: exchangeCredentialRequestSchema } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: grantSnapshotSchema } },
      description: "Grant session created.",
    },
    400: errorResponse("Invalid request."),
    401: errorResponse("Invalid credential."),
    403: errorResponse("Grant revoked."),
    500: errorResponse("Operational error."),
    503: errorResponse("Dependency unavailable."),
  },
});

const getGrantRoute = createRoute({
  method: "get",
  path: "/api/grants/{grantId}",
  request: { params: grantParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: grantSnapshotSchema } },
      description: "Authoritative grant snapshot.",
    },
    401: errorResponse("Grant session required or invalid."),
    500: errorResponse("Operational error."),
  },
});

const getGrantConversionsRoute = createRoute({
  method: "get",
  path: "/api/grants/{grantId}/conversions",
  request: { params: grantParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: grantConversionsSchema } },
      description: "Conversions belonging to the grant.",
    },
    401: errorResponse("Grant session required or invalid."),
    500: errorResponse("Operational error."),
  },
});

const getConversionRoute = createRoute({
  method: "get",
  path: "/api/conversions/{conversionId}",
  request: { params: conversionParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: conversionDetailSchema } },
      description: "conversion.",
    },
    401: errorResponse("Grant session required or invalid."),
    404: errorResponse("Conversion not found."),
    500: errorResponse("Operational error."),
  },
});

const startConversionRoute = createRoute({
  method: "post",
  path: "/api/grants/{grantId}/conversions",
  request: {
    params: grantParamsSchema,
    headers: routeStartConversionHeadersSchema,
    body: {
      required: true,
      content: { "application/json": { schema: startConversionRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: startConversionResponseSchema } },
      description: "Conversion replayed.",
    },
    202: {
      content: { "application/json": { schema: startConversionResponseSchema } },
      description: "Conversion accepted.",
    },
    400: errorResponse("Invalid request."),
    401: errorResponse("Grant session required or invalid."),
    403: errorResponse("Grant blocks starts."),
    409: errorResponse("Grant state or idempotency conflict."),
    429: errorResponse("Start rate limit exceeded."),
    500: errorResponse("Operational error."),
  },
});

const audiobookRoute = createRoute({
  method: "get",
  path: "/api/audiobooks/{conversionId}",
  request: { params: conversionParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: audiobookSchema } },
      description: "Unlisted audiobook.",
    },
    404: errorResponse("Audiobook not found."),
    500: errorResponse("Operational error."),
  },
});

const audioRoute = createRoute({
  method: "get",
  path: "/api/audiobooks/{conversionId}/audio.mp3",
  request: { params: conversionParamsSchema },
  responses: {
    200: { content: { "audio/mpeg": { schema: binarySchema } }, description: "Complete MP3." },
    206: { content: { "audio/mpeg": { schema: binarySchema } }, description: "MP3 byte range." },
    304: { description: "Not modified." },
    404: errorResponse("Audiobook not found."),
    416: errorResponse("Invalid range."),
  },
});

const audioHeadRoute = createRoute({
  method: "head",
  path: "/api/audiobooks/{conversionId}/audio.mp3",
  request: { params: conversionParamsSchema },
  responses: {
    200: { description: "MP3 headers." },
    304: { description: "Not modified." },
    404: errorResponse("Audiobook not found."),
  },
});

const captionsRoute = createRoute({
  method: "get",
  path: "/api/audiobooks/{conversionId}/captions.vtt",
  request: { params: conversionParamsSchema },
  responses: {
    200: { content: { "text/vtt": { schema: z.string() } }, description: "Timed narration text." },
    404: errorResponse("Audiobook not found."),
  },
});

const epubRoute = createRoute({
  method: "get",
  path: "/api/audiobooks/{conversionId}/book.epub",
  request: { params: conversionParamsSchema },
  responses: {
    200: {
      content: { "application/epub+zip": { schema: binarySchema } },
      description: "Complete EPUB.",
    },
    304: { description: "Not modified." },
    404: errorResponse("Audiobook not found."),
  },
});

const epubHeadRoute = createRoute({
  method: "head",
  path: "/api/audiobooks/{conversionId}/book.epub",
  request: { params: conversionParamsSchema },
  responses: {
    200: { description: "EPUB headers." },
    304: { description: "Not modified." },
    404: errorResponse("Audiobook not found."),
  },
});

type WebAppApiEnvironment<Bindings extends object> = {
  Bindings: Bindings;
  Variables: { requestId: string };
};
type WebAppApiRouteHandler<Route, Bindings extends object> = Route extends Parameters<
  typeof createRoute
>[0]
  ? (
      ...args: Parameters<
        RouteHandler<Route & { getRoutingPath(): string }, WebAppApiEnvironment<Bindings>>
      >
    ) => Response | Promise<Response>
  : never;
export type WebAppApiHandlers<Bindings extends object> = {
  exchangeSession: WebAppApiRouteHandler<typeof exchangeSessionRoute, Bindings>;
  getGrant: WebAppApiRouteHandler<typeof getGrantRoute, Bindings>;
  getGrantConversions: WebAppApiRouteHandler<typeof getGrantConversionsRoute, Bindings>;
  getConversion: WebAppApiRouteHandler<typeof getConversionRoute, Bindings>;
  startConversion: WebAppApiRouteHandler<typeof startConversionRoute, Bindings>;
  getAudiobook: WebAppApiRouteHandler<typeof audiobookRoute, Bindings>;
  getAudio: WebAppApiRouteHandler<typeof audioRoute, Bindings>;
  headAudio: WebAppApiRouteHandler<typeof audioHeadRoute, Bindings>;
  getCaptions: WebAppApiRouteHandler<typeof captionsRoute, Bindings>;
  getEpub: WebAppApiRouteHandler<typeof epubRoute, Bindings>;
  headEpub: WebAppApiRouteHandler<typeof epubHeadRoute, Bindings>;
};

/** Creates the typed HTTP interface used by the web application. */
export function createWebAppApi<Bindings extends object>(handlers: WebAppApiHandlers<Bindings>) {
  return new OpenAPIHono<WebAppApiEnvironment<Bindings>>({ defaultHook })
    .openapi(exchangeSessionRoute, handlers.exchangeSession)
    .openapi(getGrantRoute, handlers.getGrant)
    .openapi(getGrantConversionsRoute, handlers.getGrantConversions)
    .openapi(getConversionRoute, handlers.getConversion)
    .openapi(startConversionRoute, handlers.startConversion)
    .openapi(audiobookRoute, handlers.getAudiobook)
    .openapi(audioRoute, handlers.getAudio)
    .openapi(audioHeadRoute, handlers.headAudio)
    .openapi(captionsRoute, handlers.getCaptions)
    .openapi(epubRoute, handlers.getEpub)
    .openapi(epubHeadRoute, handlers.headEpub);
}

const unavailable = (): never => {
  throw new Error("Contract application cannot handle requests.");
};

/** Creates a handler-less application used only by local OpenAPI generation. */
export function createWebAppContractApp() {
  return createWebAppApi({
    exchangeSession: unavailable,
    getGrant: unavailable,
    getGrantConversions: unavailable,
    getConversion: unavailable,
    startConversion: unavailable,
    getAudiobook: unavailable,
    getAudio: unavailable,
    headAudio: unavailable,
    getCaptions: unavailable,
    getEpub: unavailable,
    headEpub: unavailable,
  });
}

function defaultHook(
  result: { success: boolean; error?: { issues: Array<{ message: string }> } },
  context: {
    get(name: "requestId"): string;
    json(value: unknown, status: 400): Response;
  },
) {
  return result.success
    ? undefined
    : context.json(
        {
          error: {
            code: "invalid-input",
            message: result.error?.issues[0]?.message ?? "Request validation failed.",
            requestId: context.get("requestId"),
          },
        },
        400,
      );
}
