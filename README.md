# `create-audiobook-from-url`

Turns the text at a URL into natural-sounding narration.

## Product idea

Many news articles, blog posts, and other online texts are worth listening to, even though they were published only as text.

Existing tools are designed for different use cases:

- Screen readers such as VoiceOver are designed for navigating web pages, so they interrupt the listening experience by announcing interface elements such as navigation menus.
- Conventional non-AI read-aloud and voice-over tools sound robotic.

This product

- uses AI to select exactly the parts of a page that a listener would want to hear
- and turns that into natural-sounding narration using the latest Gemini 3.1 Flash TTS model

## Conversion sequence

```text
Source URL
  -> fetch the page content with Playwright through Cloudflare Browser Run
  -> use AI to select the text to narrate (without rewriting anything)
  -> split the selected text into synchronization units (chunks)
  -> generate speech for each synchronization unit
  -> assemble the audio and create synchronization cues
  -> store the canonical audiobook in R2
  -> deliver EPUB 3, MP3, and WebVTT captions
```

Cloudflare Workflows runs the conversion as a durable, long-running process.  
Each stage has an explicit timeout and retry policy, and independently generated audio segments can be retried or reused without restarting the entire conversion.

## Platform architecture

- **Cloudflare Workers** hosts the SPA and the HTTP API.
- **Cloudflare Durable Objects with SQLite** store conversion grants and coordinate their mutable state.
- **Cloudflare Workflows** orchestrates long-running conversions, retries, and terminal outcomes.
- **Cloudflare R2** stores audio segments, assembled MP3 files, audiobook manifests, and generated exports.
- **Cloudflare Zero Trust Access** protects operator routes.
- **Cloudflare Workers AI** runs the open-source text-to-text model that selects narration content. The application calls its OpenAI-compatible API through the OpenAI SDK.
- **Cloudflare AI Gateway** routes Google AI Studio text-to-speech requests and records logs and request metadata.

## Technologies

| Area                 | Technologies                                                                      |
| -------------------- | --------------------------------------------------------------------------------- |
| Frontend SPA         | React, Base UI, Vite, TanStack Router, TanStack Query, TanStack Form, Linaria CSS |
| HTTP API             | Hono, OpenAPI, `@hono/zod-openapi`                                                |
| Durable state        | Cloudflare Durable Objects, SQLite, Drizzle ORM                                   |
| Object storage       | Cloudflare R2                                                                     |
| Durable workflow     | Cloudflare Workflows                                                              |
| Browser automation   | Playwright, Cloudflare Browser Run                                                |
| AI content selection | Cloudflare Workers AI, OpenAI SDK, `vitest-evals`                                 |
| Speech generation    | Cloudflare AI Gateway, Google AI Studio text-to-speech                            |
| Security             | Cloudflare Zero Trust Access, `jose`                                              |
| Output formats       | MP3, WebVTT, EPUB 3 Media Overlays                                                |
| Data and time        | Zod, Temporal                                                                     |
| Tooling and quality  | pnpm, Turborepo, TypeScript, Wrangler, Oxfmt, Oxlint, Vitest, Playwright Test     |

## Development

See [./AGENTS.md](./AGENTS.md).
