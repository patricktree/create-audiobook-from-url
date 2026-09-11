import { expect, test } from "@playwright/test";
import { format } from "oxfmt";
import { parseFragment, serializeOuter } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

import {
  type Browser as SourceMaterialBrowser,
  prepareSourceMaterial,
} from "#src/prepare-source-material.ts";

const SOURCE_PAGES = [
  {
    snapshotFilename: "anthropic.html",
    stabilizeSourceMaterial: (html: string) =>
      html.replace(
        /http:\/\/claude\.ai\/redirect\/website\.v1\.[^"]+/g,
        "http://claude.ai/redirect/[redirect-id]",
      ),
    url: "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
  },
  {
    snapshotFilename: "cloudflare.html",
    stabilizeSourceMaterial: (html: string) => html,
    url: "https://blog.cloudflare.com/kitesurf/",
  },
  {
    snapshotFilename: "gates-notes.html",
    stabilizeSourceMaterial: (html: string) =>
      extractElementById(html, "a_turbulent_ai_era_and_critical_choices_to_make_a").replace(
        /(published <span class="ArtDateTime">)[^<]+(<\/span>)/,
        "$1[relative publication date]$2",
      ),
    url: "https://www.gatesnotes.com/a-turbulent-ai-era-and-critical-choices-to-make",
  },
] as const;

for (const { snapshotFilename, stabilizeSourceMaterial, url } of SOURCE_PAGES) {
  test(`prepares source material for ${url}`, async ({ browser: playwrightBrowser }) => {
    const chromiumMajorVersion = playwrightBrowser.version().split(".")[0];

    if (!chromiumMajorVersion) {
      throw new Error("Expected Chromium to report its version");
    }

    const browser: SourceMaterialBrowser = {
      newPage: ({ javaScriptEnabled }) =>
        playwrightBrowser.newPage({
          extraHTTPHeaders: {
            "sec-ch-ua": `"Chromium";v="${chromiumMajorVersion}", "Not=A?Brand";v="99"`,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Linux"',
          },
          javaScriptEnabled,
          locale: "en-GB",
          // Some public sites reject Chromium's default HeadlessChrome identifier at the edge.
          userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromiumMajorVersion}.0.0.0 Safari/537.36`,
        }),
    };
    const sourceMaterial = await prepareSourceMaterial({ browser, url });
    const fullHtml = `<html><head><title>${escapeHtml(sourceMaterial.title)}</title></head><body>${sourceMaterial.html}</body></html>`;
    const stableFullHtml = stabilizeSourceMaterial(fullHtml);
    const { code: formattedFullHtml } = await format(snapshotFilename, stableFullHtml);

    expect(formattedFullHtml).toMatchSnapshot(snapshotFilename);
  });
}

function extractElementById(html: string, elementId: string): string {
  const documentFragment = parseFragment(html);
  const element = findElementById(documentFragment, elementId);

  if (!element) {
    throw new Error(`Expected source material to contain element #${elementId}`);
  }

  return serializeOuter(element);
}

function findElementById(
  parentNode: DefaultTreeAdapterMap["parentNode"],
  elementId: string,
): DefaultTreeAdapterMap["element"] | undefined {
  for (const childNode of parentNode.childNodes) {
    if (!("tagName" in childNode)) {
      continue;
    }

    if (
      childNode.attrs.some((attribute) => attribute.name === "id" && attribute.value === elementId)
    ) {
      return childNode;
    }

    const descendant = findElementById(childNode, elementId);

    if (descendant) {
      return descendant;
    }
  }

  return undefined;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
