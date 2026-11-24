import { expect, test } from "@playwright/test";
import { adminPassword, caswjTenant, loginAsAdmin, loginBearer } from "./helpers";

test.describe("tenant subdomain host", () => {
  test("pins login, hides org switcher and signup on {slug}.localhost:3025, and keeps apex switcher intact", async ({
    page,
    request,
  }, testInfo) => {
    const session = await loginBearer(request);
    const headers = { authorization: `Bearer ${session.accessToken}` };
    const tenant = await caswjTenant(request, session.accessToken);
    const slug = "caswj-e2e";

    const otherCreated = await request.post("/tenants", {
      headers,
      data: { name: `Other E2E Org ${Date.now()}` },
    });
    expect(otherCreated.ok(), await otherCreated.text()).toBeTruthy();
    const otherOrg = (await otherCreated.json()) as { id: string; name: string };

    const patched = await request.patch(`/tenants/${tenant.id}`, {
      headers,
      data: { slug },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();

    try {
      const tenantUrl = new URL(testInfo.project.use.baseURL ?? "http://localhost:3025");
      tenantUrl.hostname = `${slug}.localhost`;
      const tenantOrigin = tenantUrl.origin;

      const tenantOrgs = await request.get(`${tenantOrigin}/tenants`, { headers });
      expect(tenantOrgs.ok(), await tenantOrgs.text()).toBeTruthy();
      const tenantOrgsBody = (await tenantOrgs.json()) as { items: Array<{ id: string }> };
      expect(tenantOrgsBody.items.map((item) => item.id)).toEqual([tenant.id]);

      const otherOrgOnTenant = await request.get(`${tenantOrigin}/tenants/${otherOrg.id}`, { headers });
      expect(otherOrgOnTenant.status()).toBe(404);

      await page.goto(`${tenantOrigin}/signup`);
      await expect(page).toHaveURL(`${tenantOrigin}/login`);
      await expect(page.getByRole("link", { name: /Create an? account/i })).toHaveCount(0);

      await page.locator("#username").filter({ visible: true }).fill("jbaddley");
      await page.locator("#password").filter({ visible: true }).fill(adminPassword());
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { waitUntil: "commit" });

      await page.context().addCookies([
        {
          name: "clocked-in-org",
          value: tenant.id,
          url: tenantOrigin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      await page.goto(`${tenantOrigin}/dashboard`);
      await expect(page.getByText(tenant.name).first()).toBeVisible();
      await expect(page.getByRole("button", { name: new RegExp(tenant.name) })).toHaveCount(0);
      await expect(page.getByText(otherOrg.name)).toHaveCount(0);

      await page.goto(`${tenantOrigin}/settings/tenant`);
      await expect(page.getByText("White-label address")).toBeVisible();

      await loginAsAdmin(page);
      await page.goto("/dashboard");
      const switcher = page.getByRole("button", { name: new RegExp(tenant.name) });
      await expect(switcher).toBeVisible();
      await switcher.click();
      await expect(page.getByRole("menuitem", { name: /New tenant/i })).toBeVisible();
    } finally {
      await request.patch(`/tenants/${tenant.id}`, {
        headers,
        data: { slug: null },
      });
      await request.delete(`/tenants/${otherOrg.id}`, { headers });
    }
  });
});
