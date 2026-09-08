import { z } from "zod";

import type { SourcePageCookie } from "@create-audiobook-from-url/prepare-source-material";

const SOURCE_PAGE_COOKIES_SCHEMA = z.array(
  z.strictObject({
    name: z.string().min(1),
    value: z.string(),
    domain: z
      .string()
      .regex(/^\.?[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/i),
    path: z.string().startsWith("/"),
  }),
);

/** Validates runtime cookie configuration without exposing cookie values in errors. */
export function parseSourcePageCookies(configuration: string | undefined): SourcePageCookie[] {
  if (configuration === undefined) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    throw new Error("SOURCE_PAGE_COOKIES_JSON must contain valid JSON");
  }

  const result = SOURCE_PAGE_COOKIES_SCHEMA.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      "SOURCE_PAGE_COOKIES_JSON must be an array of cookies with a non-empty name, string value, hostname domain, and absolute path",
    );
  }

  return result.data;
}
