import { expect, test } from "@playwright/test";

test("renders landing", async ({ mount }) => {
  const component = await mount("routes/index/LandingPage");
  await expect(component.getByRole("heading", { name: "Cup" })).toBeVisible();
  await expect(component).toHaveScreenshot("landing.png");
});
