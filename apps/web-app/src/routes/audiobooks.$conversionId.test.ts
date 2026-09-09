import { expect, test } from "@playwright/test";

test("renders audiobook", async ({ mount }) => {
  const component = await mount("routes/audiobooks.$conversionId/ReadyAudiobook");
  await expect(
    component.getByRole("heading", { name: "A deterministic document about careful testing" }),
  ).toBeVisible();
  await expect(component).toHaveScreenshot("audiobook.png");
});

test("renders audiobook-not-found", async ({ mount }) => {
  const component = await mount("routes/audiobooks.$conversionId/AudiobookNotFound");
  await expect(component.getByRole("heading", { name: "Audiobook not found." })).toBeVisible();
  await expect(component).toHaveScreenshot("audiobook-not-found.png");
});

test("renders audiobook-load-error", async ({ mount }) => {
  const component = await mount("routes/audiobooks.$conversionId/AudiobookLoadError");
  await expect(
    component.getByRole("heading", { name: "The audiobook could not be loaded." }),
  ).toBeVisible();
  await expect(component).toHaveScreenshot("audiobook-load-error.png");
});
