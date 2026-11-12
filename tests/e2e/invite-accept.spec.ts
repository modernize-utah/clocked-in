/**
 * Admin invites → accept → person on People. Local named seed only.
 */
import { expect, test } from "@playwright/test";
import { deleteMembershipByEmail, loginAsAdmin, loginBearer } from "./helpers";

const stamp = Date.now().toString(36);
const email = `e2e.invite+${stamp}@example.com`;
const username = `e2einv${stamp}`;
const password = "invite-pass-99";

test.afterAll(async ({ request }) => {
  await deleteMembershipByEmail(request, email);
});

test("admin invite is accepted and the person appears on People", async ({ page, request }) => {
  const signup = await request.post("/auth/user", {
    data: { username, email, password, firstName: "E2e", lastName: "Invitee" },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();

  await loginAsAdmin(page);
  await page.goto("/people/invites");
  await expect(page.getByText("Invite someone")).toBeVisible();
  await page.locator("#invite-first").fill("E2e");
  await page.locator("#invite-last").fill("Invitee");
  await page.locator("#invite-email").fill(email);
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const code = await waitForInviteCode(email);
  expect(code, "No invite code reached the mail sink. Start tests/http/mail-sink.mjs and point RESEND_API_URL at it.").toBeTruthy();
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#username").filter({ visible: true }).fill(username);
  await page.locator("#password").filter({ visible: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(`/accept?code=${code}`);
  await page.getByRole("button", { name: "Join organization" }).click();
  await expect(page).toHaveURL(/dashboard/);

  const admin = await loginBearer(request);
  await page.context().clearCookies();
  await loginAsAdmin(page);
  await page.goto("/people");
  await expect(page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "E2e Invitee", exact: true })).toBeVisible();
  expect(admin.user.id).toBeTruthy();
});

async function waitForInviteCode(to: string) {
  const sink = process.env.MAIL_SINK_URL || "http://127.0.0.1:5399";
  const deadline = Date.now() + 4000;
  const pattern = /Use this code to accept the invite:\s*([A-Z0-9-]{14})/;
  while (Date.now() < deadline) {
    const response = await fetch(`${sink}/emails?to=${encodeURIComponent(to)}`).catch((error: unknown) => {
      throw new Error(`The mail sink at ${sink} is not reachable: ${error instanceof Error ? error.message : String(error)}`);
    });
    if (response.ok) {
      const messages = (await response.json()) as { text?: string }[];
      const match = pattern.exec(messages.at(-1)?.text ?? "");
      if (match) {
        return match[1];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}
