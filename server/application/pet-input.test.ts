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

test("description accepts 100 UTF-16 units, rejects 101 and preserves legacy updates", () => {
  for (const mode of ["create", "update"] as const) {
    const data = form();
    const parse = () => mode === "create" ? parsePetMutation(data, mode) : parsePetMutation(data, mode);
    const legacy = parse();
    assert.ok(legacy.ok);
    assert.equal(Object.hasOwn(legacy.value, "description"), false);
    for (const value of ["а".repeat(100), "🐶".repeat(50)]) {
      data.set("description", value);
      const result = parse();
      assert.ok(result.ok);
      assert.equal(result.value.description, value);
    }
    data.set("description", "а".repeat(101));
    const tooLong = parse();
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.match(tooLong.error, /100/);
    data.set("description", " ".repeat(101));
    assert.equal(parse().ok, false);
    data.set("description", "   ");
    const cleared = parse();
    assert.ok(cleared.ok);
    assert.equal(cleared.value.description, null);
  }
});

test("pet API persists description across POST, GET and PATCH; empty clears and omitted preserves", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const ts = await import("typescript");
  const table = { pets: new Proxy({}, { get: (_, key) => key }), petCollaborators: {} };
  let saved: Record<string, unknown> | null = null;
  const query = (kind: string, target?: unknown, selection?: Record<string, string>) => {
    let values: Record<string, unknown> = {};
    const chain = {
      from(value: unknown) { target = value; return chain; },
      where() { return chain; }, orderBy() { return chain; }, limit() { return chain; },
      values(value: Record<string, unknown>) { values = value; return chain; },
      set(value: Record<string, unknown>) { values = value; return chain; },
      returning(value: Record<string, string>) { selection = value; return chain; },
      then(resolve: (value: unknown) => void) {
        if (target !== table.pets) return Promise.resolve([]).then(resolve);
        if (kind !== "select") saved = { createdAt: new Date(), updatedAt: new Date(), description: null, ...saved, ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) };
        const rows = saved ? [Object.fromEntries(Object.entries(selection ?? {}).map(([key, column]) => [key, saved![column]]))] : [];
        return Promise.resolve(rows).then(resolve);
      }
    };
    return chain;
  };
  const db = { select: (selection: Record<string, string>) => query("select", undefined, selection), insert: (target: unknown) => query("insert", target), update: (target: unknown) => query("update", target) };
  const imports: Record<string, unknown> = {
    "drizzle-orm": { eq: () => null, and: () => null, or: () => null, desc: () => null, inArray: () => null },
    "../../../db": { withDb: (callback: (value: typeof db) => unknown) => callback(db) },
    "../../../db/schema": table,
    "../../../lib/database-error": { databaseErrorMessage: () => "Database error" },
    "../../../lib/session": { getClientSession: async () => ({ clientId: "owner" }), isSameOriginRequest: () => true, privateJson: Response.json },
    "../../../server/application/pet-input": { parsePetMutation },
    "../../../server/domain/pet": await import("../domain/pet.ts"),
    "../../../server/pet-photo.mjs": { PetPhotoError: class extends Error {} },
    "../../../server/transport/request-json": {}
  };
  const exports: Record<string, (request: Request) => Promise<Response>> = {};
  const source = readFileSync(new URL("../../app/api/pets/route.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: (name: string) => { assert.ok(name in imports, name); return imports[name]; }, Response, Request, File, Date, crypto
  });
  const send = async (method: string, description?: string) => {
    const data = form();
    if (saved) data.set("petId", String(saved.id));
    if (description !== undefined) data.set("description", description);
    return exports[method](new Request("http://localhost/api/pets", { method, ...(method === "GET" ? {} : { body: data }) }));
  };
  const created = await send("POST", "а".repeat(100));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).pet.description, "а".repeat(100));
  assert.equal((await (await send("GET")).json()).pets[0].description, "а".repeat(100));
  assert.equal((await send("PATCH", "б".repeat(101))).status, 400);
  assert.equal((await (await send("PATCH", "Новое описание")).json()).pet.description, "Новое описание");
  await send("PATCH");
  assert.equal((await (await send("GET")).json()).pets[0].description, "Новое описание");
  assert.equal((await (await send("PATCH", "")).json()).pet.description, null);
  assert.equal((await (await send("GET")).json()).pets[0].description, null);
});
