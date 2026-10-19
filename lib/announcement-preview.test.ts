import assert from "node:assert/strict";
import test from "node:test";
import { isAnnouncementPreviewEnabled } from "./announcement-preview.ts";

test("banner preview requires an explicit flag and a test host", () => {
  const previous = process.env.ANNOUNCEMENT_PREVIEW;
  try {
    for (const flag of [undefined, "0", "true", "1"]) {
      if (flag === undefined) delete process.env.ANNOUNCEMENT_PREVIEW;
      else process.env.ANNOUNCEMENT_PREVIEW = flag;
      for (const host of ["localhost:3000", "127.0.0.1:3001", "192.168.0.137:3001"]) {
        assert.equal(isAnnouncementPreviewEnabled(host), flag === "1");
      }
      for (const host of [null, "dogmeet.ru", "dogmeet.ru:443", "www.dogmeet.ru", "localhost.evil.test", "evil.test@localhost:3000"]) {
        assert.equal(isAnnouncementPreviewEnabled(host), false);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.ANNOUNCEMENT_PREVIEW;
    else process.env.ANNOUNCEMENT_PREVIEW = previous;
  }
});
