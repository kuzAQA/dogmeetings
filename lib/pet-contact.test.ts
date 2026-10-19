import assert from "node:assert/strict";
import test from "node:test";
import { formatPhoneContact, normalizeContact, contactError, contactHref } from "./pet-contact.ts";

test("phone contacts accept pasted Russian numbers, format partial input and dial canonical numbers", () => {
  assert.equal(formatPhoneContact("89111233111"), "+7 (911) 123 31-11");
  assert.equal(formatPhoneContact("9111233111"), "+7 (911) 123 31-11");
  assert.equal(formatPhoneContact("+7 (911) 123-31-11"), "+7 (911) 123 31-11");
  assert.equal(normalizeContact("phone", "7991233111"), "+77991233111");
  assert.ok(contactError("phone", "791112331111"));
  assert.equal(formatPhoneContact("9"), "+7 (9");
  assert.equal(normalizeContact("phone", "+7 (911) 123 31-11"), "+79111233111");
  assert.equal(contactHref("phone", "+79111233111"), "tel:+79111233111");
  assert.ok(contactError("phone", "911"));
  assert.ok(contactError("phone", "letters 9111233111"));
});

test("Telegram keeps one @ and only builds safe username links", () => {
  assert.equal(normalizeContact("telegram", " @@myName "), "@myName");
  assert.equal(contactHref("telegram", "@myName"), "https://t.me/myName");
  assert.ok(contactError("telegram", "@bad/name"));
  assert.ok(contactError("telegram", "@"));
  assert.equal(contactHref("telegram", "@bad/name"), undefined);
});

test("empty contacts stay optional and other contacts remain plain text", () => {
  assert.equal(contactError("phone", ""), "");
  assert.equal(contactError("other", "Email: me@example.com"), "");
  assert.equal(contactHref("other", "javascript:alert(1)"), undefined);
  assert.ok(contactError("invalid", ""));
  assert.ok(contactError("other", "a".repeat(121)));
});
