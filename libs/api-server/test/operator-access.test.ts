import { expect, test } from "vitest";

import { LOCAL_OPERATOR_ACCESS_TOKEN } from "@create-audiobook-from-url/operator-api.routes";

import { isDevelopmentOperatorRequest } from "#src/operator-access.ts";

test("accepts the local operator token on loopback URLs", () => {
  const request = new Request("http://localhost/api/operator/grants", {
    headers: { "Cf-Access-Token": LOCAL_OPERATOR_ACCESS_TOKEN },
  });

  expect(isDevelopmentOperatorRequest(request)).toBe(true);
});

test("accepts the local operator token on Tailnet URLs", () => {
  const request = new Request(
    "http://macbook-pro-pkerschbaum.oberhasli-universe.ts.net:5173/api/operator/grants",
    { headers: { "Cf-Access-Token": LOCAL_OPERATOR_ACCESS_TOKEN } },
  );

  expect(isDevelopmentOperatorRequest(request)).toBe(true);
});

test.each([
  ["a missing token", "http://localhost/api/operator/not-found", undefined],
  [
    "the local token on a deployed URL",
    "https://example.com/api/operator/not-found",
    LOCAL_OPERATOR_ACCESS_TOKEN,
  ],
])("rejects %s", (_description, url, accessToken) => {
  const request = new Request(
    url,
    accessToken === undefined ? undefined : { headers: { "Cf-Access-Token": accessToken } },
  );

  expect(isDevelopmentOperatorRequest(request)).toBe(false);
});
