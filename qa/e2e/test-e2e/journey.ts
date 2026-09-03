import type { Page } from "@playwright/test";

import { expect, gotoPage, type WorkerEnvironment } from "#test-e2e/fixtures.ts";

const CONTROLLED_SOURCE_URL = "https://source.example.test/fixture";

export async function openNewTrial(
  page: Page,
  workerEnvironment: WorkerEnvironment,
): Promise<{ grantId: string }> {
  const grant = await workerEnvironment.createGrant();

  await gotoPage(page, grant.trialLink);
  await expect(page).toHaveURL(`${workerEnvironment.origin}/trials/${grant.grantId}`);
  await expect(page.getByRole("heading", { name: "Just Listen." })).toBeVisible();
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
  expect(await page.content()).not.toContain("#credential=");

  return { grantId: grant.grantId };
}

export async function startConversion(page: Page): Promise<void> {
  await page.getByLabel("URL").fill(CONTROLLED_SOURCE_URL);
  await page.getByRole("button", { name: "Upload & listen" }).click();
  await expect(page).toHaveURL(/\/conversions\/[0-9a-f-]+$/);
}
