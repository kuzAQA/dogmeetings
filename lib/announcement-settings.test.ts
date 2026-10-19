import assert from "node:assert/strict";
import test from "node:test";
import { allowsAnnouncement, parseAnnouncementExclusions, validExtensionDays, maxExtensionDays } from "./announcement-settings.ts";

const home = { city: "Москва", district: "Центр", complex: "Парк" };
const empty = { cities: [], districts: [], complexes: [] };

test("empty exclusions preserve the existing universal audience, including unknown geography", () => {
  assert.equal(allowsAnnouncement(empty, home), true);
  assert.equal(allowsAnnouncement(empty, null), true);
});

test("any excluded level vetoes the audience; parent names disambiguate districts and complexes", () => {
  assert.equal(allowsAnnouncement({ ...empty, cities: ["Москва", "Казань"] }, home), false);
  assert.equal(allowsAnnouncement({ ...empty, districts: [{ city: "Москва", district: "Центр" }] }, home), false);
  assert.equal(allowsAnnouncement({ ...empty, complexes: [home] }, home), false);
  assert.equal(allowsAnnouncement({ cities: ["Казань"], districts: [{ city: "Москва", district: "Центр" }], complexes: [] }, home), false);
  assert.equal(allowsAnnouncement({ ...empty, districts: [{ city: "Казань", district: "Центр" }] }, home), true);
  assert.equal(allowsAnnouncement({ ...empty, complexes: [{ ...home, district: "Юг" }] }, home), true);
  assert.equal(allowsAnnouncement({ cities: ["Казань"], districts: [], complexes: [{ ...home, city: "Казань" }] }, home), true);
});

test("unknown values never match exclusions, while known parents still apply", () => {
  const exclusions = { cities: ["Москва"], districts: [{ city: "Москва", district: "Центр" }], complexes: [home] };
  assert.equal(allowsAnnouncement(exclusions, null), true);
  assert.equal(allowsAnnouncement(exclusions, { city: "", district: "", complex: "" }), true);
  assert.equal(allowsAnnouncement(exclusions, { ...home, district: "", complex: "" }), false);
  assert.equal(allowsAnnouncement({ ...empty, complexes: [home] }, { ...home, complex: "" }), true);
});

test("exclusion payloads require complete geographical keys", () => {
  assert.deepEqual(parseAnnouncementExclusions(empty), empty);
  assert.deepEqual(parseAnnouncementExclusions({ ...empty, complexes: [home] }), { ...empty, complexes: [home] });
  for (const value of [null, {}, { ...empty, cities: [""] }, { ...empty, cities: [5] }, { ...empty, districts: [{ district: "Центр" }] }, { ...empty, complexes: [{ city: "Москва", complex: "Парк" }] }]) {
    assert.equal(parseAnnouncementExclusions(value), null);
  }
});

test("extension accepts only positive integer days within the date storage boundary", () => {
  for (const value of [undefined, null, "", "1", 0, -1, 0.5, NaN, Infinity, 1e100]) assert.equal(validExtensionDays(value), false);
  assert.equal(validExtensionDays(1), true);
  assert.equal(validExtensionDays(7), true);
  assert.equal(maxExtensionDays("9999-12-30T23:59:59.999Z"), 1);
  assert.equal(maxExtensionDays("9999-12-31T23:59:59.999Z"), 0);
  assert.equal(validExtensionDays(2, "9999-12-30T23:59:59.999Z"), false);
});

test("schedule validates booleans, absolute dates and interval; Moscow fields round trip", async () => {
  const { parseAnnouncementSchedule, announcementDateInput, announcementDateValue } = await import("./announcement-settings.ts");
  const schedule = { permanent: false, startsAt: "2026-10-20T12:00:00+03:00", endsAt: null };
  assert.deepEqual(parseAnnouncementSchedule(schedule), { ...schedule, startsAt: "2026-10-20T09:00:00.000Z" });
  assert.deepEqual(parseAnnouncementSchedule({ permanent: true, startsAt: null, endsAt: null }), { permanent: true, startsAt: null, endsAt: null });
  for (const invalid of [{ ...schedule, permanent: "false" }, { ...schedule, startsAt: "2026-10-20T12:00" }, { ...schedule, startsAt: "bad" }, { ...schedule, startsAt: "2026-02-30T00:00:00Z" }, { ...schedule, endsAt: schedule.startsAt }, { ...schedule, endsAt: "2026-10-19T00:00:00Z" }]) {
    assert.equal(parseAnnouncementSchedule(invalid), null);
  }
  assert.equal(announcementDateInput(schedule.startsAt), "2026-10-20T12:00:00");
  assert.equal(announcementDateValue("2026-10-20T12:00:00"), "2026-10-20T12:00:00+03:00");
  assert.equal(announcementDateValue(""), null);
});
