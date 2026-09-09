import { expect, test } from "@playwright/test";

test("renders pending-conversion", async ({ mount }) => {
  const component = await mount("routes/conversions.$conversionId/PendingConversion");
  await expect(
    component.getByRole("progressbar", { name: "Selecting narration content..." }),
  ).toBeVisible();
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
