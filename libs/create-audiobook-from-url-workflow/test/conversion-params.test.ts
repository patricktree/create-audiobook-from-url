import { expect, test } from "vitest";

import { conversionParamsSchema } from "#src/conversion-params.ts";

test("accepts a valid source URL", () => {
  expect(
    conversionParamsSchema.parse({
      sourceUrl: "https://www.derstandard.at/story/example",
      grantId: "9c5cf475-6d1e-4c89-a835-1180f5c062be",
    }),
  ).toEqual({
    sourceUrl: "https://www.derstandard.at/story/example",
    grantId: "9c5cf475-6d1e-4c89-a835-1180f5c062be",
  });
});

test("rejects a missing source URL", () => {
  expect(() => conversionParamsSchema.parse({})).toThrow(/sourceUrl/);
});
