/** Keeps historical trial links working while the application moves to its canonical domain. */
export function routeApplicationDomain(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.hostname === "www.cup-audio.com")
    return Response.redirect(`https://cup-audio.com${url.pathname}${url.search}`, 308);
  if (url.hostname !== "create-audiobook-from-url.patricktree.me") return undefined;
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    /^\/(?:app\/)?trials\/[^/]+\/?$/.test(url.pathname)
  ) {
    // Omit a fragment so browsers carry the original trial credential to the new domain.
    return Response.redirect(`https://cup-audio.com${url.pathname}${url.search}`, 308);
  }
  return new Response("Not Found", { status: 404 });
}
