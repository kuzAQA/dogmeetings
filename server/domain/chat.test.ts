import assert from "node:assert/strict";
import test from "node:test";
import { chatText, messageLength } from "./chat.ts";

test("chat counts Unicode code points consistently and normalizes line endings", () => {
  assert.equal(messageLength("🐕".repeat(2000)), 2000);
  assert.equal(chatText("🐕".repeat(2000)), "🐕".repeat(2000));
  assert.equal(chatText("a\r\nb\rc"), "a\nb\nc");
  assert.equal(chatText("<b>текст</b>"), "<b>текст</b>");
});

test("chat rejects whitespace, non-text, NUL and more than 2000 code points", () => {
  for (const value of [null, {}, 1, "", " \n\t\r", "x\0y", "🐕".repeat(2001)]) {
    assert.equal(chatText(value), null);
  }
});
