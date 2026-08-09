import test from "node:test";
import assert from "node:assert/strict";
import { filterDisplayableItems } from "./utils.js";

test("active timeframe + existing storage object => displayed", async () => {
  const rows = [
    {
      id: "1",
      file_name: "photo.jpg",
      mime_type: "image/jpeg",
      storage_path: "abc/photo.jpg",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  ];

  const items = await filterDisplayableItems(rows, async (item) => ({
    exists: true,
    item: { ...item, preview_url: "https://example.com/photo.jpg" },
  }));

  assert.equal(items.length, 1);
  assert.equal(items[0].id, "1");
});

test("active timeframe + missing storage object => NOT displayed", async () => {
  const rows = [
    {
      id: "2",
      file_name: "video.mp4",
      mime_type: "video/mp4",
      storage_path: "abc/video.mp4",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  ];

  const items = await filterDisplayableItems(rows, async () => ({
    exists: false,
  }));

  assert.equal(items.length, 0);
});
