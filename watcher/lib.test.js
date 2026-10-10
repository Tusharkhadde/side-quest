"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseIoregIdle, parseMillis, step, isQuietHour, questUrl } = require("./lib.js");

const opts = { thresholdMin: 90, idleResetMin: 5, cooldownMin: 30, quietStart: 22, quietEnd: 7 };
const empty = { sessionStart: null, lastActive: null, lastNudge: null };

test("parses macOS ioreg output", () => {
  const out = `| |   "HIDIdleTime" = 4200000000\n| |   "Other" = 1`;
  assert.equal(parseIoregIdle(out), 4);
  assert.equal(parseIoregIdle("nothing"), null);
});

test("parses millisecond output", () => {
  assert.equal(parseMillis("12345\n"), 12);
  assert.equal(parseMillis("oops"), null);
});

test("nudges after the threshold of continuous activity, once per cooldown", () => {
  const t0 = new Date("2026-10-10T14:00:00").getTime();
  let s = empty;
  let last;
  for (let m = 0; m <= 95; m++) {
    last = step(s, t0 + m * 60_000, 10, opts);
    s = last.state;
    if (m < 90) assert.equal(last.nudge, false, `no nudge at ${m}`);
    if (m === 90) assert.equal(last.nudge, true);
    if (m > 90) assert.equal(last.nudge, false, "cooldown holds");
  }
  assert.ok(last.minutes >= 95);
});

test("an idle break resets the session", () => {
  const t0 = new Date("2026-10-10T14:00:00").getTime();
  let { state } = step(empty, t0, 0, opts);
  ({ state } = step(state, t0 + 60 * 60_000, 0, opts));
  const res = step(state, t0 + 70 * 60_000, 6 * 60, opts);
  assert.equal(res.minutes, 0);
  assert.equal(res.state.sessionStart, null);
});

test("quiet hours wrap around midnight", () => {
  assert.equal(isQuietHour(23, 22, 7), true);
  assert.equal(isQuietHour(3, 22, 7), true);
  assert.equal(isQuietHour(12, 22, 7), false);
});

test("builds the quest URL", () => {
  assert.equal(questUrl("http://localhost:3000/", 95), "http://localhost:3000/quest?new=1&screen=95");
});
