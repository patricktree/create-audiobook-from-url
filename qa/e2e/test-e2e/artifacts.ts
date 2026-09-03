import { expect } from "@playwright/test";
import { unzipSync } from "fflate";

import { analyzeMp3 } from "@create-audiobook-from-url/audiobook-production";

const decoder = new TextDecoder();

export async function validateAudiobookArtifacts({
  audioUrl,
  epubUrl,
}: {
  audioUrl: string;
  epubUrl: string;
}): Promise<void> {
  const audioResponse = await fetch(audioUrl);
  expect(audioResponse.status).toBe(200);
  expect(audioResponse.headers.get("Content-Type")).toBe("audio/mpeg");
  expect(audioResponse.headers.get("Accept-Ranges")).toBe("bytes");
  const audioEtag = audioResponse.headers.get("ETag");
  if (audioEtag === null) throw new Error("MP3 response did not include an ETag");
  const audio = new Uint8Array(await audioResponse.arrayBuffer());
  expect(Number(audioResponse.headers.get("Content-Length"))).toBe(audio.byteLength);
  expect(analyzeMp3(audio).durationMilliseconds).toBeGreaterThan(0);

  const audioHead = await fetch(audioUrl, { method: "HEAD" });
  expect(audioHead.status).toBe(200);
  expect(await audioHead.text()).toBe("");
  expect(Number(audioHead.headers.get("Content-Length"))).toBe(audio.byteLength);

  const audioRange = await fetch(audioUrl, { headers: { Range: "bytes=0-9" } });
  expect(audioRange.status).toBe(206);
  expect(audioRange.headers.get("Content-Range")).toBe(`bytes 0-9/${audio.byteLength}`);
  expect((await audioRange.arrayBuffer()).byteLength).toBe(10);

  const unchangedAudio = await fetch(audioUrl, { headers: { "If-None-Match": audioEtag } });
  expect(unchangedAudio.status).toBe(304);

  const epubResponse = await fetch(epubUrl);
  expect(epubResponse.status).toBe(200);
  expect(epubResponse.headers.get("Content-Type")).toBe("application/epub+zip");
  expect(epubResponse.headers.get("Content-Disposition")).toBe(
    'attachment; filename="audiobook.epub"',
  );
  const epubEtag = epubResponse.headers.get("ETag");
  if (epubEtag === null) throw new Error("EPUB response did not include an ETag");
  const epub = new Uint8Array(await epubResponse.arrayBuffer());
  const archive = unzipSync(epub);
  expect(decoder.decode(archive["mimetype"])).toBe("application/epub+zip");
  expect(decoder.decode(archive["META-INF/container.xml"])).toContain("EPUB/package.opf");
  expect(decoder.decode(archive["EPUB/package.opf"])).toContain(
    "A deterministic document about careful testing",
  );
  expect(decoder.decode(archive["EPUB/package.opf"])).toContain(CONTROLLED_SOURCE_MARKER);
  expect(decoder.decode(archive["EPUB/content.xhtml"])).toContain(
    "Keep the important boundaries real",
  );
  expect(decoder.decode(archive["EPUB/overlay.smil"])).toContain("<audio src=");
  expect(Object.keys(archive).some((name) => /^EPUB\/audio\/\d{5}\.mp3$/u.test(name))).toBe(true);

  const epubHead = await fetch(epubUrl, { method: "HEAD" });
  expect(epubHead.status).toBe(200);
  expect(await epubHead.text()).toBe("");
  expect(Number(epubHead.headers.get("Content-Length"))).toBe(epub.byteLength);
  const unchangedEpub = await fetch(epubUrl, { headers: { "If-None-Match": epubEtag } });
  expect(unchangedEpub.status).toBe(304);
}

const CONTROLLED_SOURCE_MARKER = "https://source.example.test/fixture";
