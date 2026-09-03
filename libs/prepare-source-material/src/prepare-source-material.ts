import { parseFragment, serialize } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

const DERSTANDARD_CONSENT_COOKIE = {
  name: "DSGVO_ZUSAGE_V1",
  value: "true",
  domain: ".derstandard.at",
  path: "/",
} as const;

const MEANINGFUL_EMPTY_ELEMENT_TAG_NAMES = new Set<string>([
  "audio",
  "br",
  "canvas",
  "embed",
  "hr",
  "iframe",
  "img",
  "object",
  "source",
  "track",
  "video",
  "wbr",
]);

const IRRELEVANT_ELEMENT_TAG_NAMES = new Set<string>([
  "button",
  "figure",
  "footer",
  "form",
  "input",
  "nav",
  "noscript",
  "script",
  "style",
  "svg",
]);
const NARRATION_TEXT_ELEMENT_TAG_NAMES = new Set<string>([
  "blockquote",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "p",
  "pre",
  "td",
  "th",
]);
// Keep equivalent static pages; rendering often adds small dynamic counters and page chrome.
const BETTER_SOURCE_MATERIAL_TEXT_FACTOR = 1.1;
const SOURCE_PAGE_JAVASCRIPT_MODES = [false, true] as const;
const RENDERED_SOURCE_PAGE_READY_TIMEOUT_MS = 30_000;
const RENDERED_SOURCE_PAGE_READINESS = {
  minimumBlockCount: 2,
  minimumLongTextLength: 500,
  minimumTextLength: 200,
  narrationTextSelector: "blockquote, figcaption, h1, h2, h3, h4, h5, h6, li, p, pre, td, th",
} as const;
const NON_PUBLIC_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00_00_00_00, 0x00_ff_ff_ff],
  [0x0a_00_00_00, 0x0a_ff_ff_ff],
  [0x64_40_00_00, 0x64_7f_ff_ff],
  [0x7f_00_00_00, 0x7f_ff_ff_ff],
  [0xa9_fe_00_00, 0xa9_fe_ff_ff],
  [0xac_10_00_00, 0xac_1f_ff_ff],
  [0xc0_00_00_00, 0xc0_00_00_ff],
  [0xc0_a8_00_00, 0xc0_a8_ff_ff],
  [0xc6_12_00_00, 0xc6_13_ff_ff],
  [0xe0_00_00_00, 0xff_ff_ff_ff],
];

type RenderedSourcePageReadinessOptions = typeof RENDERED_SOURCE_PAGE_READINESS;
type SourcePage = {
  route(pattern: string, handler: (route: InterceptedRoute) => Promise<void>): Promise<unknown>;
  context(): {
    addCookies(
      cookies: Array<{ name: string; value: string; domain: string; path: string }>,
    ): Promise<void>;
  };
  goto(
    url: string,
    options: { waitUntil: "domcontentloaded" },
  ): Promise<{ status(): number } | null>;
  waitForFunction(
    pageFunction: (options: RenderedSourcePageReadinessOptions) => boolean,
    argument: RenderedSourcePageReadinessOptions,
    options: { timeout: number },
  ): Promise<unknown>;
  locator(selector: "body"): { innerHTML(): Promise<string> };
  title(): Promise<string>;
  close(): Promise<void>;
};

/** Supplies browser pages used to load source material. */
export type Browser = {
  newPage(options: { javaScriptEnabled: boolean }): Promise<SourcePage>;
};
type InterceptedRoute = {
  request(): { url(): string };
  continue(): Promise<void>;
  abort(errorCode: "blockedbyclient"): Promise<void>;
};

/** Cleaned source HTML and the title used to begin narration. */
export type SourceMaterial = {
  html: string;
  title: string;
};

/** Prepares source material from a URL through a supplied transport. */
export type SourceMaterialPreparer = (url: string) => Promise<SourceMaterial>;

/** Supplies the browser and URL used to load one source page. */
export type LoadSourcePageOptions = {
  browser: Browser;
  javaScriptEnabled: boolean;
  url: string;
};

/** Browser-loaded page content before source cleanup and title selection. */
export type LoadedSourcePage = {
  bodyHtml: string;
  documentTitle: string;
  responseStatus: number;
};

/** Loads source-page HTML and document metadata through a browser. */
export type SourcePageLoader = (options: LoadSourcePageOptions) => Promise<LoadedSourcePage>;

/** Supplies the browser, URL, and page loader used to prepare source material. */
export type PrepareOptions = Omit<LoadSourcePageOptions, "javaScriptEnabled"> & {
  loadSourcePage?: SourcePageLoader;
};

/** Loads static and rendered source-page candidates and selects the better source material. */
export async function prepareSourceMaterial({
  browser,
  url,
  loadSourcePage = loadPublicSourcePage,
}: PrepareOptions): Promise<SourceMaterial> {
  const results = await Promise.allSettled(
    SOURCE_PAGE_JAVASCRIPT_MODES.map(async (javaScriptEnabled) =>
      prepareLoadedSourcePage(await loadSourcePage({ browser, javaScriptEnabled, url })),
    ),
  );
  const sourceMaterials = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (sourceMaterials.length > 0) {
    return selectBetterSourceMaterial(sourceMaterials);
  }

  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  const failureDescriptions = results.map((result, resultIndex) => {
    const loadMode = SOURCE_PAGE_JAVASCRIPT_MODES[resultIndex] ? "rendered" : "static";
    return `${loadMode}: ${result.status === "rejected" ? describeError(result.reason) : "no usable source material"}`;
  });

  throw new AggregateError(
    failures,
    `Expected at least one source-page load to produce audiobook source material (${failureDescriptions.join("; ")})`,
  );
}

/** Applies production cleanup and title selection to an already loaded source page. */
export function prepareLoadedSourcePage(sourcePage: LoadedSourcePage): SourceMaterial {
  if (sourcePage.responseStatus < 200 || sourcePage.responseStatus >= 300) {
    throw new Error(`Source page responded with HTTP ${sourcePage.responseStatus}`);
  }

  return {
    html: cleanAudiobookSourceMaterialHtml(sourcePage.bodyHtml),
    title: extractSourceTitle(sourcePage.bodyHtml, sourcePage.documentTitle),
  };
}

/** Loads a public source page while blocking scripts and non-public subresources. */
export async function loadPublicSourcePage({
  browser,
  javaScriptEnabled,
  url,
}: LoadSourcePageOptions): Promise<LoadedSourcePage> {
  const page = await browser.newPage({ javaScriptEnabled });

  try {
    assertPublicSourceUrl(url);
    await page.route("**/*", async (route: InterceptedRoute) => {
      try {
        assertPublicSourceUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });
    // Without a consent choice, Der Standard redirects to /consent/tcf and serves only a preview.
    await page.context().addCookies([DERSTANDARD_CONSENT_COOKIE]);
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });

    if (!response) {
      throw new Error("Expected source-page navigation to return an HTTP response");
    }

    if (javaScriptEnabled) {
      await page.waitForFunction(
        (options) => {
          const title = document.querySelector("h1")?.textContent?.trim() || document.title.trim();

          if (!title) {
            return false;
          }

          const semanticContentRoots = Array.from(
            document.querySelectorAll("article, main"),
          ).filter((element) => element.querySelector(options.narrationTextSelector));
          const contentRoots =
            semanticContentRoots.length > 0 ? semanticContentRoots : [document.body];

          return contentRoots.some((contentRoot) => {
            const narrationBlocks = Array.from(
              contentRoot.querySelectorAll(options.narrationTextSelector),
            )
              .filter((element) => !element.closest("footer, form, nav"))
              .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
              .filter((text) => text.length > 0);
            const narrationTextLength = narrationBlocks.reduce(
              (totalLength, text) => totalLength + text.length,
              0,
            );

            return (
              narrationTextLength >= options.minimumLongTextLength ||
              (narrationBlocks.length >= options.minimumBlockCount &&
                narrationTextLength >= options.minimumTextLength)
            );
          });
        },
        RENDERED_SOURCE_PAGE_READINESS,
        { timeout: RENDERED_SOURCE_PAGE_READY_TIMEOUT_MS },
      );
    }

    return {
      bodyHtml: await page.locator("body").innerHTML(),
      documentTitle: await page.title(),
      responseStatus: response.status(),
    };
  } finally {
    await page.close();
  }
}

function extractSourceTitle(bodyHtml: string, documentTitle: string): string {
  const documentFragment = parseFragment(bodyHtml);
  const heading = findFirstElement(documentFragment, "h1");
  const title = normalizeTitleText(heading ? extractNodeText(heading) : documentTitle);

  if (title.length === 0) {
    throw new Error("Expected the source page to have a title");
  }

  return title;
}

function findFirstElement(
  parentNode: DefaultTreeAdapterMap["parentNode"],
  tagName: string,
): DefaultTreeAdapterMap["element"] | undefined {
  for (const childNode of parentNode.childNodes) {
    if (!("tagName" in childNode)) {
      continue;
    }

    if (childNode.tagName === tagName) {
      return childNode;
    }

    const descendant = findFirstElement(childNode, tagName);

    if (descendant) {
      return descendant;
    }
  }

  return undefined;
}

function selectBetterSourceMaterial(sourceMaterials: readonly SourceMaterial[]): SourceMaterial {
  const [firstSourceMaterial, ...remainingSourceMaterials] = sourceMaterials;

  if (!firstSourceMaterial) {
    throw new Error("Expected at least one prepared source material candidate");
  }

  return remainingSourceMaterials.reduce(
    (bestSourceMaterial, sourceMaterial) =>
      getSourceMaterialTextLength(sourceMaterial) >
      getSourceMaterialTextLength(bestSourceMaterial) * BETTER_SOURCE_MATERIAL_TEXT_FACTOR
        ? sourceMaterial
        : bestSourceMaterial,
    firstSourceMaterial,
  );
}

function getSourceMaterialTextLength(sourceMaterial: SourceMaterial): number {
  const documentFragment = parseFragment(sourceMaterial.html);
  const contentRoot = findFirstElement(documentFragment, "article") ?? documentFragment;
  const narrationText = extractNarrationText(contentRoot);

  return normalizeTitleText(narrationText || extractNodeText(contentRoot)).length;
}

function extractNarrationText(parentNode: DefaultTreeAdapterMap["parentNode"]): string {
  return parentNode.childNodes
    .map((childNode) => {
      if (!("tagName" in childNode)) {
        return "";
      }

      return NARRATION_TEXT_ELEMENT_TAG_NAMES.has(childNode.tagName)
        ? extractNodeText(childNode)
        : extractNarrationText(childNode);
    })
    .join("");
}

function extractNodeText(parentNode: DefaultTreeAdapterMap["parentNode"]): string {
  return parentNode.childNodes
    .map((childNode) => {
      if ("value" in childNode) {
        return childNode.value;
      }

      return "tagName" in childNode ? extractNodeText(childNode) : "";
    })
    .join("");
}

function normalizeTitleText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export function cleanAudiobookSourceMaterialHtml(html: string): string {
  const documentFragment = parseFragment(html);

  removeIrrelevantAndEmptyElements(documentFragment);

  return serialize(documentFragment);
}

/** Rejects private, loopback, link-local, and metadata-service destinations. */
export function assertPublicSourceUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Source URL must use HTTP or HTTPS");
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, "$1")
    .replace(/\.$/u, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    throw new Error("Source destination is not public");
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const address = octets.reduce((result, octet) => result * 256 + octet, 0);
  return NON_PUBLIC_IPV4_RANGES.some(
    ([rangeStart, rangeEnd]) => address >= rangeStart && address <= rangeEnd,
  );
}

function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  const normalized = hostname.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(?:fc|fd)/u.test(normalized) || /^fe[89ab]/u.test(normalized)) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
  return mapped !== undefined && isPrivateIpv4(mapped);
}

function removeIrrelevantAndEmptyElements(parentNode: DefaultTreeAdapterMap["parentNode"]): void {
  for (let childIndex = parentNode.childNodes.length - 1; childIndex >= 0; childIndex -= 1) {
    const childNode = parentNode.childNodes[childIndex];

    if (!childNode || !("tagName" in childNode)) {
      continue;
    }

    if (IRRELEVANT_ELEMENT_TAG_NAMES.has(childNode.tagName)) {
      parentNode.childNodes.splice(childIndex, 1);
      continue;
    }

    removeIrrelevantAndEmptyElements(childNode);

    if (
      MEANINGFUL_EMPTY_ELEMENT_TAG_NAMES.has(childNode.tagName) ||
      childNode.childNodes.some(
        (grandchildNode) =>
          "tagName" in grandchildNode ||
          (grandchildNode.nodeName === "#text" && Boolean(grandchildNode.value.trim())),
      )
    ) {
      continue;
    }

    parentNode.childNodes.splice(childIndex, 1);
  }
}
