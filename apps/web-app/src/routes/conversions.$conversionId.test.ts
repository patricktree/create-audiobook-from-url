import { expect, test } from "@playwright/test";

test("renders pending-conversion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount("routes/conversions.$conversionId/PendingConversion");
  await expect(
    component.getByRole("status").filter({ hasText: "Selecting narration content..." }),
  ).toBeVisible();
  await expect(component.getByTestId("cup-fill")).toBeVisible();
  await expect(component).toHaveScreenshot("pending-conversion.png");
});

test("renders failed-conversion", async ({ mount }) => {
  const component = await mount("routes/conversions.$conversionId/FailedConversion");
  await expect(component.getByText("Speech synthesis failed.", { exact: true })).toBeVisible();
  await expect(component).toHaveScreenshot("failed-conversion.png");
});

test("renders conversion-load-error", async ({ mount }) => {
  const component = await mount("routes/conversions.$conversionId/ConversionLoadError");
  await expect(
    component.getByRole("heading", { name: "The conversion could not be opened." }),
  ).toBeVisible();
  await expect(component).toHaveScreenshot("conversion-load-error.png");
});

for (const { story, fillPercentage } of [
  { story: "StartingConversion", fillPercentage: 12.5 },
  { story: "PendingConversion", fillPercentage: 37.5 },
  { story: "HalfCompleteConversion", fillPercentage: 62.5 },
  { story: "FinalizingConversion", fillPercentage: 100 },
]) {
  test("fills the Cup to " + fillPercentage + "% for " + story, async ({ mount, page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const component = await mount("routes/conversions.$conversionId/" + story);
    const fill = component.getByTestId("cup-fill").locator("span");
    await expect
      .poll(() =>
        fill.evaluate((element) => {
          const cupBounds = element.parentElement!.getBoundingClientRect();
          return (
            (100 * (cupBounds.bottom - element.getBoundingClientRect().top)) / cupBounds.height
          );
        }),
      )
      .toBe(fillPercentage);
    await expect.poll(() => fill.evaluate((element) => element.getAnimations().length)).toBe(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(fill).toHaveCSS("transition-duration", "0s");
  });
}

test("advances and resets the interactive conversion", async ({ mount }) => {
  const component = await mount("routes/conversions.$conversionId/InteractiveConversion");
  await expect(component.getByText("Starting conversion...")).toBeVisible();
  for (let index = 0; index < 4; index++)
    await component.getByRole("button", { name: "Next phase" }).click();
  await expect(component.getByText("Producing narration audio...")).toBeVisible();
  await expect(component.getByText("4 of 8 phases completed (50%)")).toBeVisible();
  await expect(component.getByTestId("cup-fill").locator("span")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 37.5)",
  );
  for (let index = 0; index < 3; index++)
    await component.getByRole("button", { name: "Next phase" }).click();
  await expect(component.getByText("Finalizing conversion...")).toBeVisible();
  await component.getByRole("button", { name: "Start again" }).click();
  await expect(component.getByText("Starting conversion...")).toBeVisible();
});
