#!/usr/bin/env node
"use strict";

/**
 * side-quest-watch: notices long unbroken stretches at the computer and
 * offers a Side Quest. No dependencies, no network calls of its own, and its
 * only state is a small JSON file in your home directory.
 *
 *   npx side-quest-watch                 # defaults: 90 min, http://localhost:3000
 *   npx side-quest-watch --threshold 60 --url http://localhost:3000
 *   npx side-quest-watch --once          # print current idle seconds and exit
 */

const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseIoregIdle, parseMillis, step, questUrl } = require("../lib.js");

function parseArgs(argv) {
  const opts = {
    thresholdMin: 90,
    intervalSec: 60,
    idleResetMin: 5,
    cooldownMin: 30,
    quietStart: 22,
    quietEnd: 7,
    url: process.env.SIDE_QUEST_URL || "http://localhost:3000",
    once: false,
    noOpen: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--threshold") (opts.thresholdMin = Number(v)), i++;
    else if (a === "--interval") (opts.intervalSec = Number(v)), i++;
    else if (a === "--idle-reset") (opts.idleResetMin = Number(v)), i++;
    else if (a === "--cooldown") (opts.cooldownMin = Number(v)), i++;
    else if (a === "--quiet") {
      const [s, e] = String(v).split("-").map(Number);
      opts.quietStart = s;
      opts.quietEnd = e;
      i++;
    } else if (a === "--url") (opts.url = v), i++;
    else if (a === "--once") opts.once = true;
    else if (a === "--no-open") opts.noOpen = true;
    else if (a === "--help" || a === "-h") {
      console.log(`side-quest-watch
  --threshold <min>   continuous activity before a nudge (default 90)
  --interval <sec>    how often to check idle time (default 60)
  --idle-reset <min>  idle this long and the streak resets (default 5)
  --cooldown <min>    minimum gap between nudges (default 30)
  --quiet <h-h>       no nudges between these hours (default 22-7)
  --url <url>         where Side Quest runs (default http://localhost:3000)
  --no-open           notify only, do not open the browser
  --once              print idle seconds and exit`);
      process.exit(0);
    }
  }
  return opts;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 10_000, windowsHide: true }, (err, stdout) => resolve(err ? null : stdout));
  });
}

const WIN_IDLE = `
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Idle {
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
  public static uint Ms() { var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l); GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.dwTime; }
}
'@
[Idle]::Ms()`;

/** Seconds since the last keyboard/mouse input, or null if this OS is not supported. */
async function idleSeconds() {
  if (process.platform === "darwin") {
    const out = await run("ioreg", ["-c", "IOHIDSystem"]);
    return out ? parseIoregIdle(out) : null;
  }
  if (process.platform === "win32") {
    const out = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN_IDLE]);
    return out ? parseMillis(out) : null;
  }
  // Linux/X11. Wayland compositors generally do not expose idle time to xprintidle.
  const out = await run("xprintidle", []);
  return out ? parseMillis(out) : null;
}

function notify(title, body) {
  if (process.platform === "darwin") {
    spawn("osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`]);
  } else if (process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(8000, '${title.replace(/'/g, "")}', '${body.replace(/'/g, "")}', 'Info'); Start-Sleep 9; $n.Dispose()`;
    spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("notify-send", ["-a", "Side Quest", title, body], { stdio: "ignore" }).on("error", () => undefined);
  }
}

function openUrl(url) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => undefined).unref();
}

const STATE_DIR = path.join(os.homedir(), ".side-quest");
const STATE_FILE = path.join(STATE_DIR, "watch.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { sessionStart: null, lastActive: null, lastNudge: null };
  }
}

function saveState(s) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...s, updatedAt: new Date().toISOString() }, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const first = await idleSeconds();
  if (first === null) {
    console.error(
      process.platform === "linux"
        ? "Could not read idle time. Install xprintidle (e.g. `sudo apt install xprintidle`); Wayland sessions are not supported."
        : "Could not read idle time on this system."
    );
    process.exit(1);
  }
  if (opts.once) {
    console.log(first);
    return;
  }
  console.log(`side-quest-watch: nudging after ${opts.thresholdMin} min of continuous activity. State: ${STATE_FILE}`);
  let state = loadState();
  const tick = async () => {
    const idle = await idleSeconds();
    if (idle === null) return;
    const res = step(state, Date.now(), idle, opts);
    state = res.state;
    saveState(state);
    if (res.nudge) {
      notify("Side Quest", `${res.minutes} minutes on screen. A 20-minute quest is waiting outside.`);
      if (!opts.noOpen) openUrl(questUrl(opts.url, res.minutes));
    }
  };
  await tick();
  setInterval(tick, opts.intervalSec * 1000);
}

main();
