import assert from "node:assert/strict";
import test from "node:test";
import defaults from "../emails/dist/defaults.json";
import {
  booleanEmailSettingKeys,
  defaultEmailSettings,
  emailHtmlToText,
  emailTemplateBadge,
  readEmailSettings,
  shouldSendEmailImmediate,
  emailTemplateFields,
  emailTemplateFors,
  fillEmailText,
  renderEmail,
  sanitizeEmailHtml,
  unknownPlaceholders,
  type EmailTemplateFor,
} from "../src/lib/email/templates";

const codeLine = /Use this code to (?:reset your VolunTime password|accept the invite):\s*([A-Za-z0-9_-]+)/;

function content(kind: EmailTemplateFor) {
  const item = defaults.find((entry) => entry.for === kind)!;
  return { subject: item.subject, heading: item.heading, preview: item.preview, template: item.html };
}

const sample = { subject: "Hello {{user.name}}", heading: "Hi", preview: "", template: "<p>{{user.name}}</p>" };

test("nested fields fill, encode in html, and stay raw in text", () => {
  const filled = renderEmail(sample, { user: { name: `A<B> & "C"` } });
  assert.match(filled.html, /<p style="[^"]*">A&lt;B&gt; &amp; &quot;C&quot;<\/p>/);
  assert.match(filled.text, /A<B> & "C"/);
  assert.equal(filled.subject, `Hello A<B> & "C"`);
});

test("does not expand placeholders introduced by a value", () => {
  assert.equal(fillEmailText("Hello {{user.name}}", { user: { name: "{{user.name}}" } }), "Hello {{user.name}}");
});

test("strips line breaks from the subject and turns them into <br> in html", () => {
  const filled = renderEmail(sample, { user: { name: "Acme\r\nNorth" } });
  assert.equal(filled.subject, "Hello Acme North");
  assert.match(filled.html, />Acme<br>North</);
});

test("throws when a used field is missing", () => {
  assert.throws(() => renderEmail(sample, {}), /Missing email field user\.name/);
  assert.throws(() => renderEmail(sample, { user: {} }), /Missing email field user\.name/);
});

test("unknown placeholders are reported per email type", () => {
  assert.deepEqual(unknownPlaceholders("Invite", "{{invite.code}} {{entry.hours}}"), ["entry.hours"]);
  assert.deepEqual(unknownPlaceholders("LoggedTime", "{{entry.hours}} {{user.firstName}}"), []);
});

test("sanitizer keeps the allowlist and drops everything else", () => {
  assert.equal(
    sanitizeEmailHtml('<p onclick="x()">Hi <strong>there</strong><script>alert(1)</script><img src=x onerror=y></p>'),
    "<p>Hi <strong>there</strong></p>",
  );
  assert.equal(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
  assert.equal(sanitizeEmailHtml('<a href="javascript&#58;alert(1)">x</a>'), "<a>x</a>");
  assert.equal(sanitizeEmailHtml('<a href="https://a.example/?q=1&amp;r=2" target="_blank">x</a>'), '<a href="https://a.example/?q=1&amp;r=2">x</a>');
  assert.equal(sanitizeEmailHtml('<a href="{{entry.url}}">Go</a>'), '<a href="{{entry.url}}">Go</a>');
  assert.equal(sanitizeEmailHtml('<a href="https://evil.example/?c={{reset.code}}">Reset</a>'), "<a>Reset</a>");
  assert.equal(sanitizeEmailHtml('<a href="{{reset.url}}?c={{reset.code}}">Reset</a>'), "<a>Reset</a>");
  assert.equal(
    sanitizeEmailHtml('<span data-placeholder="user.firstName" class="chip">{{user.firstName}}</span>'),
    '<span data-placeholder="user.firstName">{{user.firstName}}</span>',
  );
  assert.equal(sanitizeEmailHtml("<p>1 < 2 & 3 > 2</p>"), "<p>1 &lt; 2 &amp; 3 &gt; 2</p>");
  assert.equal(sanitizeEmailHtml("<style>p{}</style><p>ok</p>"), "<p>ok</p>");
});

test("plain text keeps links and paragraphs", () => {
  assert.equal(
    emailHtmlToText('<p>Hi &amp; bye</p><p><a href="https://x.example">Review</a></p><ul><li>One</li></ul>'),
    "Hi & bye\n\nReview (https://x.example)\n\n- One",
  );
});

test("every email type has a default that only uses its catalog fields", () => {
  assert.deepEqual(defaults.map((item) => item.for).sort(), [...emailTemplateFors].sort());
  for (const item of defaults) {
    const kind = item.for as EmailTemplateFor;
    assert.deepEqual(unknownPlaceholders(kind, item.subject, item.heading, item.preview, item.html), [], item.for);
    assert.equal(sanitizeEmailHtml(item.html), item.html, item.for);
  }
  for (const field of ["entry.hours", "entry.date", "user.firstName", "organization.name"]) {
    assert.ok(field in emailTemplateFields.LoggedTime);
  }
});

test("a stored template cannot send a code to another site", () => {
  const stored = {
    subject: "Reset",
    heading: "Reset",
    preview: "",
    template: '<p><a href="https://evil.example/?c={{reset.code}}">Reset your password</a></p>',
  };
  const rendered = renderEmail(stored, { reset: { code: "424242", url: "https://clocked.example/forgot-password" } });
  assert.doesNotMatch(rendered.html, /evil\.example/);
  assert.doesNotMatch(rendered.text, /evil\.example/);
  assert.doesNotMatch(rendered.html, /424242/);
});

test("rendered defaults keep the mailed code lines and code box", () => {
  const resetUrl = "https://clocked.example/forgot-password?code=abc_123";
  const reset = renderEmail(content("PasswordReset"), { reset: { code: "abc_123", url: resetUrl } });
  assert.equal(codeLine.exec(reset.text)?.[1], "abc_123");
  assert.match(reset.html, /border:1px solid #D4AC59[^>]*><p style="[^"]*letter-spacing:0\.18em[^"]*">abc_123<\/p>/);
  assert.match(reset.text, /https:\/\/clocked\.example\/forgot-password\?code=abc_123/);
  assert.equal(reset.subject, "Your VolunTime password reset code");

  const invite = renderEmail(content("Invite"), {
    organization: { name: "North <Org>" },
    invite: {
      targetKind: "Organization",
      targetName: "North <Org>",
      roleName: "Staff",
      code: "invite-9",
      url: "https://clocked.example/accept?code=invite-9",
    },
    user: { username: "norg" },
  });
  assert.equal(codeLine.exec(invite.text)?.[1], "invite-9");
  assert.match(invite.html, /North &lt;Org&gt;/);
  assert.match(invite.text, /Your username will be norg/);
  assert.match(invite.html, /href="https:\/\/clocked\.example\/accept\?code=invite-9"/);
  assert.equal(invite.subject, "North <Org> invited you to join VolunTime");
  assert.match(invite.html, /VolunTime<\/p><h1[^>]*>You have an invite<\/h1>/);
});

test("LoggedTime default renders hours and date", () => {
  const filled = renderEmail(content("LoggedTime"), {
    user: { firstName: "Jamie" },
    organization: { name: "Harbor" },
    entry: { hours: "2.5", date: "Tue, Oct 27, 2026", url: "https://x.example/log" },
  });
  assert.equal(filled.subject, "Your hours for Harbor were saved");
  assert.match(filled.text, /2\.5 hours were saved on Tue, Oct 27, 2026\./);
  assert.match(filled.text, /Review your hours \(https:\/\/x\.example\/log\)/);
});

test("readEmailSettings normalizes values and shouldSendEmailImmediate enforces frequency and toggles", () => {
  const defaults = readEmailSettings(null);
  assert.deepEqual(defaults, defaultEmailSettings);
  for (const kind of emailTemplateFors) {
    assert.equal(shouldSendEmailImmediate(defaults, kind), true, kind);
  }

  const custom = readEmailSettings({
    LoggedTime: "weekly",
    UnclassifiedEntry: "off",
    AccessRequestReceived: false,
    NeedSubmitted: "invalid",
  });
  assert.equal(custom.LoggedTime, "weekly");
  assert.equal(custom.UnclassifiedEntry, "off");
  assert.equal(custom.AccessRequestReceived, false);
  assert.equal(custom.NeedSubmitted, true);

  assert.equal(shouldSendEmailImmediate(custom, "LoggedTime"), false);
  assert.equal(shouldSendEmailImmediate(custom, "UnclassifiedEntry"), false);
  assert.equal(shouldSendEmailImmediate(custom, "AccessRequestReceived"), false);
  assert.equal(shouldSendEmailImmediate(custom, "NeedSubmitted"), true);
  assert.equal(shouldSendEmailImmediate(custom, "Invite"), true);
  assert.equal(shouldSendEmailImmediate(custom, "Welcome"), true);
  assert.equal(shouldSendEmailImmediate(custom, "PasswordReset"), true);

  assert.deepEqual(emailTemplateBadge("Invite", true, custom), { label: "Always on", variant: "secondary" });
  assert.deepEqual(emailTemplateBadge("Welcome", false, custom), { label: "Always on", variant: "secondary" });
  assert.deepEqual(emailTemplateBadge("PasswordReset", true, custom), { label: "Always on", variant: "secondary" });
  assert.deepEqual(emailTemplateBadge("LoggedTime", true, custom), { label: "Weekly digest", variant: "secondary" });
  assert.deepEqual(emailTemplateBadge("LoggedTime", false, custom), { label: "Off", variant: "outline" });
  assert.deepEqual(emailTemplateBadge("UnclassifiedEntry", true, custom), { label: "Off", variant: "outline" });
  assert.deepEqual(emailTemplateBadge("AccessRequestReceived", true, custom), { label: "Off", variant: "outline" });
  assert.deepEqual(emailTemplateBadge("NeedSubmitted", true, custom), { label: "On", variant: "secondary" });

  for (const key of booleanEmailSettingKeys) {
    const toggledOff = readEmailSettings({ [key]: false });
    assert.equal(toggledOff[key], false, `${key} should be false`);
    assert.equal(shouldSendEmailImmediate(toggledOff, key), false, `${key} should not send when false`);
    assert.deepEqual(emailTemplateBadge(key, true, toggledOff), { label: "Off", variant: "outline" });
  }
});
