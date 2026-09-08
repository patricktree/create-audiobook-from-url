import { expect, test } from "@playwright/test";

test("renders the contained button variant", async ({ mount }) => {
  const component = await mount("app/design-system/button/Contained");

  await expect(component.getByRole("button", { name: "Start conversion" })).toHaveAttribute(
    "data-variant",
    "contained",
  );
});

test("records button clicks in the story", async ({ mount }) => {
  const component = await mount("app/design-system/button/CountsClicks");

  await component.getByRole("button", { name: "Record click" }).click();

  await expect(component.getByTestId("click-count")).toHaveValue("1");
});
