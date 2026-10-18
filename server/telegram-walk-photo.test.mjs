import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { sendTelegramWalkNotification } from "./telegram-walk-photo.mjs";

const image = await sharp({ create: { width: 600, height: 600, channels: 3, background: "red" } })
  .composite([{ input: await sharp({ create: { width: 600, height: 50, channels: 3, background: "blue" } }).png().toBuffer(), top: 0, left: 0 }])
  .avif().toBuffer();
const body = { chat_id: "123", text: "<b>Прогулка</b> &amp; 🐕", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "Открыть", url: "https://dogmeet.ru" }]] } };

test("photo preserves HTML and buttons, with a centered 325×250 crop above macOS caption width", async () => {
  const calls = [];
  await sendTelegramWalkNotification(body, async () => image, async (...args) => { calls.push(args); return true; });
  assert.equal(calls.length, 1);
  const [method, form] = calls[0];
  assert.equal(method, "sendPhoto");
  for (const key of ["chat_id", "parse_mode"]) assert.equal(form.get(key), body[key]);
  assert.equal(form.get("caption"), body.text);
  assert.equal(form.get("reply_markup"), JSON.stringify(body.reply_markup));
  const output = Buffer.from(await form.get("photo").arrayBuffer());
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 325);
  assert.equal(metadata.height, 250);
  assert.ok(metadata.width >= 320);
  assert.equal(metadata.width * 300, metadata.height * 390);
  const pixel = await sharp(output).extract({ left: 162, top: 0, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(pixel[0] > 200 && pixel[2] < 30, "center cover removes the blue top edge");
});

test("missing, corrupt, unavailable and rejected photos fall back to original text once", async () => {
  for (const scenario of ["missing", "corrupt", "unavailable", "false", "throw"]) {
    const calls = [];
    const result = await sendTelegramWalkNotification(body, async () => {
      if (scenario === "unavailable") throw new Error("photo unavailable");
      return scenario === "missing" ? null : scenario === "corrupt" ? Buffer.from("bad") : image;
    }, async (method, data) => {
      calls.push([method, data]);
      if (method === "sendPhoto") {
        if (scenario === "throw") throw new Error("photo rejected");
        return false;
      }
      return true;
    });
    assert.equal(result, true);
    const texts = calls.filter(([method]) => method === "sendMessage");
    assert.equal(texts.length, 1);
    assert.equal(texts[0][1], body);
  }
});

test("caption boundary counts rendered HTML; long text is preserved once even if photo fails", async () => {
  for (const length of [1024, 1025]) {
    for (const photoFails of [false, true]) {
      const message = { ...body, text: `<b>${"&amp;".repeat(length)}</b>` };
      const calls = [];
      await sendTelegramWalkNotification(message, async () => image, async (method, data) => {
        calls.push([method, data]);
        if (method === "sendPhoto" && photoFails) throw new Error("photo rejected");
        return true;
      });
      assert.equal(calls.filter(([method]) => method === "sendMessage").length, length > 1024 || photoFails ? 1 : 0);
      const text = calls.find(([method]) => method === "sendMessage");
      if (text) assert.equal(text[1], message);
      const form = calls.find(([method]) => method === "sendPhoto")?.[1];
      if (length <= 1024) assert.equal(form.get("caption"), message.text);
      else assert.equal(form, undefined);
    }
  }
  let calls = 0;
  await assert.rejects(sendTelegramWalkNotification({ ...body, text: "x".repeat(1025) }, async () => image, async () => { calls++; throw new Error("text failed"); }));
  assert.equal(calls, 1);
});
