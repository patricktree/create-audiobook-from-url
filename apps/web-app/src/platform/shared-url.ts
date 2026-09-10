const HTTP_URL_PATTERN = /https?:\/\/[^\s<>]+/iu;

export function extractSharedUrl(text: string): string | undefined {
  const url = text.match(HTTP_URL_PATTERN)?.[0];
  return url !== undefined && URL.canParse(url) ? url : undefined;
}
