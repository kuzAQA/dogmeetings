import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
} });
const { parsePetMutation } = await import("./pet-input.ts");
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ petName: "Боня", ownerName: "Анна", breed: "Корги", petId: "00000000-0000-4000-8000-000000000001" })) data.set(key, value);
  return data;
}

test("pet contacts normalize and survive create/update validation", () => {
  for (const mode of ["create", "update"] as const) {
    const data = form();
    data.set("contactType", "phone");
    data.set("contact", "+7 (911) 123 31-11");
    const result = mode === "create" ? parsePetMutation(data, mode) : parsePetMutation(data, mode);
    assert.ok(result.ok);
    assert.equal(result.value.contact, "+79111233111");
    assert.equal(result.value.contactType, "phone");
  }
});

test("old clients preserve contacts, empty fields clear them, invalid contacts are rejected", () => {
  const data = form();
  const legacy = parsePetMutation(data, "update");
  assert.ok(legacy.ok);
  assert.equal(Object.hasOwn(legacy.value, "contact"), false);
  data.set("contactType", "telegram");
  data.set("contact", "");
  const cleared = parsePetMutation(data, "update");
  assert.ok(cleared.ok);
  assert.equal(cleared.value.contact, null);
  assert.equal(cleared.value.contactType, null);
  data.set("contact", "@bad/name");
  assert.equal(parsePetMutation(data, "create").ok, false);
  data.set("contact", "@myName");
  const telegram = parsePetMutation(data, "create");
  assert.ok(telegram.ok);
  assert.equal(telegram.value.contact, "@myName");
  data.set("contactType", "javascript");
  assert.equal(parsePetMutation(data, "update").ok, false);
});
