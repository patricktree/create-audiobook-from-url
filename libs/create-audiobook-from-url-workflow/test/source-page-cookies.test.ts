import { expect, test } from "vitest";

import { parseSourcePageCookies } from "#src/source-page-cookies.ts";

test("defaults to no cookies when configuration is absent", () => {
  expect(parseSourcePageCookies(undefined)).toEqual([]);
  expect(parseSourcePageCookies("[]")).toEqual([]);
});

test("parses domain-scoped cookies, including empty values", () => {
  const cookies = [{ name: "consent", value: "", domain: ".publisher.example", path: "/" }];
  expect(parseSourcePageCookies(JSON.stringify(cookies))).toEqual(cookies);
});

test.each([
  "",
  "private-invalid-json",
  "null",
  "{}",
  '[{"name":"consent","value":"private-value","domain":"publisher.example"}]',
  '[{"name":"","value":"private-value","domain":"publisher.example","path":"/"}]',
  '[{"name":"consent","value":true,"domain":"publisher.example","path":"/"}]',
  '[{"name":"consent","value":"private-value","domain":"https://publisher.example","path":"/"}]',
  '[{"name":"consent","value":"private-value","domain":"publisher.example","path":"relative"}]',
])("rejects malformed configuration without exposing values: %s", (configuration) => {
  expect(() => parseSourcePageCookies(configuration)).toThrow("SOURCE_PAGE_COOKIES_JSON");
  expect(() => parseSourcePageCookies(configuration)).not.toThrow("private-");
});
