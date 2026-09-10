import { expect, test } from "vitest";

import { routeApplicationDomain } from "#src/domain-routing.ts";

test.each(["GET", "HEAD"])(
  "redirects old trial links on %s without losing query parameters",
  async (method) => {
    for (const pathname of ["/trials/existing", "/app/trials/existing", "/trials/existing/"]) {
      const response = routeApplicationDomain(
        new Request(
          `https://create-audiobook-from-url.patricktree.me${pathname}?from=email&tag=a&tag=b`,
          { method },
        ),
      );
      expect(response?.status).toBe(308);
      expect(response?.headers.get("Location")).toBe(
        `https://cup-audio.com${pathname}?from=email&tag=a&tag=b`,
      );
      expect(response?.headers.get("Location")).not.toContain("#");
    }
  },
);

test("does not retain old-domain application or API access", async () => {
  for (const pathname of [
    "/",
    "/app/",
    "/api/operator/grants",
    "/api/grants/existing",
    "/.well-known/assetlinks.json",
    "/trials/existing/extra",
  ]) {
    const response = routeApplicationDomain(
      new Request(`https://create-audiobook-from-url.patricktree.me${pathname}`),
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.has("Location")).toBe(false);
  }
  const response = routeApplicationDomain(
    new Request("https://create-audiobook-from-url.patricktree.me/trials/existing", {
      method: "POST",
    }),
  );
  expect(response?.status).toBe(404);
});

test("leaves the new domain and local development to the application router", () => {
  for (const origin of ["https://cup-audio.com", "http://localhost:5173"]) {
    expect(routeApplicationDomain(new Request(`${origin}/trials/existing`))).toBeUndefined();
  }
});

test("redirects www to the canonical domain", () => {
  const response = routeApplicationDomain(
    new Request("https://www.cup-audio.com/app/trials/existing?from=email"),
  );
  expect(response?.status).toBe(308);
  expect(response?.headers.get("Location")).toBe(
    "https://cup-audio.com/app/trials/existing?from=email",
  );
});
