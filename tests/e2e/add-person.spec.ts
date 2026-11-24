/**
 * Add person dialog: success closes it; a conflict keeps it open with the error
 * in the dialog (toasts sit behind the top layer). Local seed only — skipped in prod.
 */
import { expect, test, type Locator } from "@playwright/test";
import { deleteMembershipByEmail, loginAsAdmin } from "./helpers";

test.describe.configure({ mode: "serial" });

let createdEmail: string | undefined;

test.afterEach(async ({ request }) => {
  if (!createdEmail) return;
  await deleteMembershipByEmail(request, createdEmail);
  createdEmail = undefined;
});

test("add person closes on success and shows a conflict in the dialog", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/people");
  await expect(page.getByRole("button", { name: "Add person" })).toBeVisible();

  const stamp = Date.now().toString(36);
  const person = {
    firstName: "E2e",
    lastName: "Addperson",
    email: `e2e.addperson+${stamp}@example.com`,
    username: `e2eadd${stamp}`,
    password: "temp-pass-99",
  };
  createdEmail = person.email;

  await page.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByRole("dialog", { name: "Add person" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Email user" })).toBeChecked();
  await dialog.getByRole("checkbox", { name: "Email user" }).click();
  await fillAddPerson(dialog, person);
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Person added.")).toBeVisible();

  await page.getByRole("button", { name: "Add person" }).click();
  await expect(dialog).toBeVisible();
  await fillAddPerson(dialog, person);
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("This person is already in the tenant.");
  await expect(dialog.getByRole("alert")).toBeVisible();
});

async function fillAddPerson(
  dialog: Locator,
  person: { firstName: string; lastName: string; email: string; username: string; password: string },
) {
  await dialog.getByLabel("First name").fill(person.firstName);
  await dialog.getByLabel("Last name").fill(person.lastName);
  await dialog.getByLabel("Email", { exact: true }).fill(person.email);
  await dialog.getByLabel("Username", { exact: true }).fill(person.username);
  await dialog.getByLabel("Temporary password").fill(person.password);
}
