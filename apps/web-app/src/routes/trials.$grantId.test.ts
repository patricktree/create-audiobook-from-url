import { expect, test } from "@playwright/test";

test("renders an open Trial", async ({ mount }) => {
  const component = await mount("routes/trials.$grantId/OpenGrant");

  await expect(component.getByRole("heading", { name: "Just listen." })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "URL", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Turn into audio" })).toBeDisabled();
  await expect(component).toHaveScreenshot("open-trial.png");
});

test("rejects a malformed Trial credential", async ({ mount }) => {
  const component = await mount("routes/trials.$grantId/MalformedCredential");

  await expect(
    component.getByRole("heading", { name: "This Trial Link is invalid." }),
  ).toBeVisible();
  await expect(component).toHaveScreenshot("malformed-credential.png");
});
