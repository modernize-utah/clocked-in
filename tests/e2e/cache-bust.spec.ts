/**
 * Read-only crawl of a remote host. Set E2E_ENV=PROD or STAGING
 * (npm run test:e2e:prod / test:e2e:staging).
 * Each view is opened with a fresh query so the CDN stores a new response,
 * then every link is clicked once. The first click has to change the view.
 */
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe.configure({ mode: "serial" });

const shellHeading: Record<string, RegExp | string> = {
  "/dashboard": /Welcome back/,
  "/log": "Log time",
  "/log/own": "Log time",
  "/log/member": "Log time",
  "/log/group": "Log time",
  "/entries": "Entries",
  "/reports": /Report|Summary/,
  "/people": "People",
  "/people/invites": "People",
  "/people/connections": "People",
  "/people/roles": "People",
  "/settings": "Settings",
  "/about-prototype": "Guide",
  "/settings/tenant": "Settings",
  "/settings/tenants": "Settings",
  "/settings/lists": "Settings",
  "/settings/theme": "Settings",
  "/settings/brand": "Settings",
  "/settings/email": "Settings",
  "/profile": "Profile",
};

const viewCopy: Record<string, RegExp | string> = {
  "/": "Track volunteer time",
  "/login": "Sign in to log and review volunteer hours.",
  "/signup": "Create your account",
  "/forgot-password": "Reset your password",
  "/dashboard": /Welcome back/,
  "/log": "Start timer",
  "/log/own": "Start timer",
  "/log/member": "Add time for a member",
  "/log/group": "Record a session",
  "/entries": "All time",
  "/reports": "All time",
  "/people": "Volunteers log their own time",
  "/people/invites": "Invite someone",
  "/people/connections": "Link two people so they can log time for each other.",
  "/people/roles": "Roles",
  "/settings": "Hourly rates",
  "/about-prototype": "How this app works",
  "/settings/tenant": "Hourly rates",
  "/settings/tenants": /Teams or sites inside/,
  "/settings/lists": /give it a start and end date/,
  "/settings/theme": /Chart palettes stay/,
  "/settings/brand": "Square mark for the browser tab",
  "/settings/email": "When emails are sent",
  "/profile": "Name, contact, and sign-in are saved together.",
  "/accept": "Accept an invite",
};

const signedInPaths = [
  "/dashboard",
  "/log/own",
  "/log/member",
  "/log/group",
  "/entries",
  "/reports",
  "/reports/new",
  "/dashboard/design",
  "/needs",
  "/feedback",
  "/people",
  "/people/invites",
  "/people/connections",
  "/people/roles",
  "/settings/tenant",
  "/settings/tenants",
  "/settings/lists",
  "/settings/theme",
  "/settings/brand",
  "/settings/email",
  "/profile",
  "/accept",
];

test.beforeEach(async ({ context, page }) => {
  const client = await context.newCDPSession(page);
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.clearBrowserCache");
  await context.route("**/*", async (route) => {
    const headers = {
      ...route.request().headers(),
      "cache-control": "no-cache",
      pragma: "no-cache",
    };
    await route.continue({ headers });
  });
});

test("public pages rebuild a cache and open on the first click", async ({ page }) => {
  const errors = watch(page);
  await rebuild(page, ["/", "/login", "/signup", "/forgot-password"]);
  await page.goto("/");
  await expectView(page, "/");
  await clickOnce(page, "/login");
  await clickOnce(page, "/forgot-password");
  await clickOnce(page, "/login");
  await clickOnce(page, "/signup");
  await clickOnce(page, "/login");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("signed-in views rebuild a cache and open on the first click", async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watch(page);
  await loginAsAdmin(page);
  await rebuild(page, signedInPaths);
  await page.goto("/dashboard");
  await expectView(page, "/dashboard");

  const seen = new Set<string>(["/dashboard"]);
  const queue: string[] = [];
  const discover = async () => {
    for (const href of await visiblePaths(page)) {
      if (!seen.has(href) && !queue.includes(href)) queue.push(href);
    }
  };
  await discover();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
  await discover();
  for (const href of ["/profile", "/accept"]) {
    if (!seen.has(href) && !queue.includes(href)) queue.push(href);
  }
  await page.keyboard.press("Escape");

  while (queue.length > 0) {
    const href = queue.shift()!;
    if (seen.has(href)) continue;
    await showLink(page, href);
    const landed = await clickOnce(page, href);
    seen.add(href);
    seen.add(landed);
    await discover();
    expect(errors, errors.join("\n")).toEqual([]);
  }

  const required = [
    "/dashboard",
    "/log/own",
    "/log/member",
    "/log/group",
    "/entries",
    "/reports",
    "/people",
    "/people/invites",
    "/people/roles",
    "/settings/tenant",
    "/settings/tenants",
    "/settings/lists",
    "/settings/theme",
    "/settings/brand",
    "/profile",
    "/accept",
  ];
  const missing = required.filter((path) => !seen.has(path));
  expect(missing, `visited ${[...seen].sort().join(" ")}`).toEqual([]);
  expect(errors, errors.join("\n")).toEqual([]);
});

function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function rebuild(page: Page, paths: string[]) {
  const bust = Date.now();
  for (const path of paths) {
    const response = await page.goto(`${path}?__bust=${bust}`, { waitUntil: "domcontentloaded" });
    expect(response, path).toBeTruthy();
    expect(response!.status(), `${path} rebuild`).toBeLessThan(400);
    await expectView(page, new URL(page.url()).pathname);
  }
}

const redirects: Record<string, string> = {
  "/log": "/log/own",
  "/settings": "/settings/tenant",
  "/settings/members": "/people",
  "/settings/roles": "/people/roles",
  "/groups": "/log/group",
};

async function showLink(page: Page, href: string) {
  const visible = () => page.locator(`a[href="${href}"]`).filter({ visible: true });
  if (await visible().count()) return;

  if (href === "/profile" || href === "/accept" || href === "/tenant") {
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(visible().first(), href).toBeVisible();
    return;
  }

  const nestedSetting = /^\/settings\/[^/]+\/./.test(href) ? href.split("/").slice(0, 3).join("/") : null;
  const host = nestedSetting
    ? nestedSetting
    : href.startsWith("/settings/")
      ? "/settings/tenant"
      : href.startsWith("/people/")
        ? "/people"
        : href.startsWith("/log/")
          ? "/log/own"
          : href.startsWith("/developer/")
            ? href === "/developer/api-keys"
              ? "/developer/mcp"
              : "/developer/api-keys"
            : "/dashboard";
  if (new URL(page.url()).pathname !== host) {
    await page.goto(host);
    await expectView(page, new URL(page.url()).pathname);
  }
  await expect(visible().first(), href).toBeVisible();
}

async function clickOnce(page: Page, href: string) {
  const start = new URL(page.url()).pathname;
  const link = page.locator(`a[href="${href}"]`).filter({ visible: true }).first();
  await expect(link, href).toBeVisible();
  await link.click();
  await expect
    .poll(() => new URL(page.url()).pathname, { message: `the first click stayed on ${start} instead of opening ${href}` })
    .not.toBe(start);
  const redirected = redirects[href];
  if (redirected) {
    await expect.poll(() => new URL(page.url()).pathname).toBe(redirected);
  }
  const landed = new URL(page.url()).pathname;
  await expectView(page, landed);
  return landed;
}

async function expectView(page: Page, path: string) {
  const surface = page.locator("main").filter({ visible: true });
  const heading = shellHeading[path];
  if (heading) {
    await expect(page.locator("header h1").filter({ visible: true })).toHaveText(heading);
  }

  const copy = viewCopy[path];
  if (copy) {
    await expect(surface.getByText(copy).first()).toBeVisible();
  }
}

async function visiblePaths(page: Page) {
  return page.locator("a[href]").evaluateAll((nodes) => {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      if (!(node instanceof HTMLAnchorElement) || node.hasAttribute("download")) continue;
      const raw = node.getAttribute("href") ?? "";
      if (!raw.startsWith("/") || raw.startsWith("//")) continue;
      const path = new URL(raw, location.origin).pathname;
      if (path === "/" || seen.has(path)) continue;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      seen.add(path);
      paths.push(path);
    }
    return paths;
  });
}
