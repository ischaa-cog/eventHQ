import assert from "node:assert/strict";
import { test } from "node:test";
import { sortTrainingResources, vimeoPlayerUrl } from "./training-resources";

test("only Vimeo videos use inline players", () => {
  assert.equal(vimeoPlayerUrl("https://player.vimeo.com/video/855573003?title=0"), null);
  assert.equal(vimeoPlayerUrl("https://player.vimeo.com/video/855573003"), "https://player.vimeo.com/video/855573003");
  assert.equal(vimeoPlayerUrl("https://vimeo.com/855573003?h=abc123"), "https://player.vimeo.com/video/855573003?h=abc123");
  for (const url of [
    "https://player.vimeo.com.evil.test/video/1",
    "https://player.vimeo.com/video/1?redirect=https://evil.test",
    "https://evil.test/1", "javascript:alert(1)", "http://vimeo.com/1",
  ]) assert.equal(vimeoPlayerUrl(url), null);
});

test("reordering shared lessons keeps the entire category sequence stable", () => {
  const items = [
    { id: 1, isGlobal: true, orderIndex: 0 },
    { id: 2, isGlobal: true, orderIndex: 1 },
    { id: 3, isGlobal: true, orderIndex: 2 },
    { id: 4, isGlobal: false, orderIndex: 0 },
  ];
  const moved = [items[1], items[0], items[2]];
  const changed = moved.map((item, index) => ({ ...item, orderIndex: index * 10 }));
  assert.deepEqual(sortTrainingResources([...changed, items[3]]).map(item => item.id), [2, 1, 3, 4]);
});