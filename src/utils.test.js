import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes, timeRemaining, transferName } from "./utils.js";

test("formatBytes returns readable units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
});

test("timeRemaining handles future and expired timestamps", () => {
  const future = new Date(Date.now() + 65_000).toISOString();
  const value = timeRemaining(future);
  assert.match(value, /^1:0[0-9]$/);
  assert.equal(timeRemaining(new Date(Date.now() - 1_000).toISOString()), "expired");
});

test("transferName uses ISO date prefix", () => {
  const fixedDate = new Date("2026-01-02T10:00:00.000Z");
  assert.equal(transferName(fixedDate), "Origin_Transfer_2026-01-02");
});
