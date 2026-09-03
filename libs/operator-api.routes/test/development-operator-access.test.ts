import { expect, test } from "vitest";

import {
  isDevelopmentOperatorUrl,
  isLoopbackOperatorUrl,
} from "#src/development-operator-access.ts";

test.each([
  "http://localhost:8787",
  "http://127.0.0.1:8787",
  "http://macbook-pro-pkerschbaum.oberhasli-universe.ts.net:5173",
])("recognizes development operator URL %s", (url) => {
  expect(isDevelopmentOperatorUrl(new URL(url))).toBe(true);
});

test.each([
  "https://example.com",
  "http://localhost.example.com",
  "http://oberhasli-universe.ts.net.example.com",
])("rejects untrusted operator URL %s", (url) => {
  expect(isDevelopmentOperatorUrl(new URL(url))).toBe(false);
});

test.each(["http://localhost:8787", "http://127.0.0.1:8787"])(
  "recognizes loopback operator URL %s",
  (url) => {
    expect(isLoopbackOperatorUrl(new URL(url))).toBe(true);
  },
);

test("does not treat a Tailnet operator URL as loopback", () => {
  expect(
    isLoopbackOperatorUrl(new URL("http://macbook-pro-pkerschbaum.oberhasli-universe.ts.net:5173")),
  ).toBe(false);
});
