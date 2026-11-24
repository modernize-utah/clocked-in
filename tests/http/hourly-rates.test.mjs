import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertHourlyRate,
  assertList,
  assertMoney,
  callApi,
  createJson,
  inKind,
  label,
  remove,
  signUp,
  suite,
} from "./client.mjs";

describe("hourly rates", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("rateadmin");
    ctx.member = await signUp("ratemember");
    ctx.volunteer = await signUp("ratevol");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Rate org") });
    ctx.category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Rate category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Rate project"),
      accessType: "Public",
    });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.volunteer.email,
      role: "VOLUNTEER",
    });
    await acceptInvite(ctx.volunteer.accessToken, ctx.volunteer.email);
  });

  test("creating an tenant seeds a default volunteer rate", async () => {
    const response = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, { token: ctx.admin.accessToken });
    assertList(response.json);
    assert.equal(response.json.items.length, 1);
    ctx.defaultRate = response.json.items[0];
    assertHourlyRate(ctx.defaultRate, {
      tenantId: ctx.org.id,
      type: "Volunteer",
      name: "Volunteer",
      perHourRate: 35.47,
      isDefault: true,
    });
  });

  test("admins can add, default, archive, and delete rates", async () => {
    ctx.professional = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Professional",
      name: "Counsel",
      perHourRate: 80,
    });
    assertHourlyRate(ctx.professional, {
      tenantId: ctx.org.id,
      type: "Professional",
      name: "Counsel",
      perHourRate: 80,
      isDefault: false,
    });
    const asDefault = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { type: "Professional", name: "Default counsel", perHourRate: 90, isDefault: true },
    });
    assertError(asDefault, 400, "validation_error", "Only a volunteer rate can be the default.");

    ctx.otherVolunteer = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Volunteer",
      name: "Board",
      perHourRate: 50,
      isDefault: true,
    });
    assert.equal(ctx.otherVolunteer.isDefault, true);
    const listed = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, { token: ctx.admin.accessToken });
    const previous = listed.json.items.find((item) => item.id === ctx.defaultRate.id);
    assert.equal(previous.isDefault, false);
    ctx.defaultRate = ctx.otherVolunteer;

    const archivedDefault = await callApi(`/hourly-rates/${ctx.defaultRate.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isArchived: true },
    });
    assertError(archivedDefault, 400, "validation_error", "The default volunteer rate cannot be archived.");
    const deletedDefault = await callApi(`/hourly-rates/${ctx.defaultRate.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(deletedDefault, 409, "conflict", "The default volunteer rate cannot be deleted.");

    const archived = await callApi(`/hourly-rates/${ctx.professional.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isArchived: true },
    });
    assert.equal(archived.status, 200);
    assert.equal(archived.json.isArchived, true);
    const stillListed = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, { token: ctx.member.accessToken });
    assert.equal(stillListed.json.items.some((item) => item.id === ctx.professional.id && item.isArchived), true);
  });

  test("volunteers lock to the default rate and members can choose another", async () => {
    const volunteerOwn = await createJson(ctx.volunteer.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-12",
      hourlyRateId: ctx.professional.id,
    });
    assert.equal(volunteerOwn.hourlyRateId, ctx.defaultRate.id);
    assertMoney(volunteerOwn.hourlyRate, 50);
    assertMoney(volunteerOwn.inKindValue, 50);

    const memberOwn = await createJson(ctx.member.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-12",
    });
    assert.equal(memberOwn.hourlyRateId, ctx.defaultRate.id);
    assertMoney(memberOwn.hourlyRate, 50);

    const restored = await callApi(`/hourly-rates/${ctx.professional.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isArchived: false },
    });
    assert.equal(restored.status, 200);
    const selected = await createJson(ctx.member.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 30,
      occurredOn: "2026-10-13",
      hourlyRateId: ctx.professional.id,
    });
    assert.equal(selected.hourlyRateId, ctx.professional.id);
    assertMoney(selected.hourlyRate, 80);
    assertMoney(selected.inKindValue, inKind(30, 80));

    const forVolunteer = await createJson(ctx.admin.accessToken, `/users/${ctx.volunteer.user.id}/time-entries`, {
      mode: "Duration",
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-14",
      hourlyRateId: ctx.professional.id,
    });
    assert.equal(forVolunteer.hourlyRateId, ctx.professional.id);
    assertMoney(forVolunteer.hourlyRate, 80);

    await callApi(`/hourly-rates/${ctx.professional.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isArchived: true },
    });
    const archived = await callApi("/time/duration", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        tenantId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-15",
        hourlyRateId: ctx.professional.id,
      },
    });
    assertError(archived, 400, "validation_error", "This hourly rate is archived.");
  });

  test("patching volunteerHourlyRate updates the default rate", async () => {
    const updated = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { volunteerHourlyRate: 41.25 },
    });
    assertMoney(updated.json.volunteerHourlyRate, 41.25);
    const listed = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, { token: ctx.admin.accessToken });
    const currentDefault = listed.json.items.find((item) => item.isDefault);
    assertMoney(currentDefault.perHourRate, 41.25);
  });

  test("source is optional and can be cleared", async () => {
    const cited = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Volunteer",
      name: "Cited",
      perHourRate: 40,
      source: "  Independent Sector  ",
    });
    assertHourlyRate(cited, {
      tenantId: ctx.org.id,
      type: "Volunteer",
      name: "Cited",
      perHourRate: 40,
      isDefault: false,
      source: "Independent Sector",
    });

    const omitted = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Professional",
      name: "Uncited",
      perHourRate: 70,
    });
    assert.equal(omitted.source, null);

    const blank = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { type: "Professional", name: "Blank source", perHourRate: 71, source: "   " },
    });
    assert.equal(blank.status, 201);
    assert.equal(blank.json.source, null);

    const tooLong = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { type: "Professional", name: "Long source", perHourRate: 72, source: "x".repeat(201) },
    });
    assertError(tooLong, 400, "validation_error", "source must be 200 characters or fewer.");

    const cleared = await callApi(`/hourly-rates/${cited.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { source: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.source, null);

    const restored = await callApi(`/hourly-rates/${cited.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { source: "State bar" },
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.json.source, "State bar");
  });

  test("a referenced rate cannot be deleted", async () => {
    const unused = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Volunteer",
      name: "Unused",
      perHourRate: 20,
    });
    await remove(ctx.admin.accessToken, `/hourly-rates/${unused.id}`);
    const missing = await callApi(`/hourly-rates/${unused.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
    const blocked = await callApi(`/hourly-rates/${ctx.defaultRate.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(blocked, 409, "conflict", "The default volunteer rate cannot be deleted.");
  });
});
