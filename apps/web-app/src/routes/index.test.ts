import { expect, test } from "@playwright/test";

test("renders landing", async ({ mount }) => {
  const component = await mount("routes/index/LandingPage");
  await expect(component.getByRole("heading", { name: "Create Audiobook from URL" })).toBeVisible();
  await expect(component).toHaveScreenshot("landing.png");
});
