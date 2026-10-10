"use strict";

/**
 * Pure logic for the desktop watcher, kept separate so it can be tested
 * without touching the OS.
 */

/** macOS: `ioreg -c IOHIDSystem` prints "HIDIdleTime" = <nanoseconds>. */
function parseIoregIdle(output) {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(output);
  return m ? Math.floor(Number(m[1]) / 1e9) : null;
}

/** Linux xprintidle and the Windows snippet both print milliseconds. */
function parseMillis(output) {
  const n = Number(String(output).trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n / 1000) : null;
}

/**
 * Advance the watcher state by one poll.
 * state: { sessionStart: ms|null, lastActive: ms|null, lastNudge: ms|null }
 * Returns { state, minutes, nudge }.
 */
function step(state, now, idleSeconds, opts) {
  const idleResetMs = opts.idleResetMin * 60_000;
  const next = { ...state };
  const lastInput = now - idleSeconds * 1000;
  if (idleSeconds * 1000 >= idleResetMs) {
    next.sessionStart = null;
    next.lastActive = lastInput;
    return { state: next, minutes: 0, nudge: false };
  }
  if (next.sessionStart === null || next.lastActive === null || lastInput - next.lastActive > idleResetMs) {
    next.sessionStart = lastInput;
  }
  next.lastActive = lastInput;
  const minutes = Math.floor((now - next.sessionStart) / 60_000);
  const cooledDown = next.lastNudge === null || now - next.lastNudge >= opts.cooldownMin * 60_000;
  const hour = new Date(now).getHours();
  const quiet = isQuietHour(hour, opts.quietStart, opts.quietEnd);
  const nudge = minutes >= opts.thresholdMin && cooledDown && !quiet;
  if (nudge) next.lastNudge = now;
  return { state: next, minutes, nudge };
}

function isQuietHour(hour, start, end) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function questUrl(base, minutes) {
  return `${base.replace(/\/$/, "")}/quest?new=1&screen=${minutes}`;
}

module.exports = { parseIoregIdle, parseMillis, step, isQuietHour, questUrl };
