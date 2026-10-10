// Capture every screen at 390x844 (iPhone 12-15 size) against a running app.
//
//   DEMO_MODE=1 npm run build && DEMO_MODE=1 npx next start -p 3100
//   npx -y playwright@1 install chromium      # once
//   BASE_URL=http://localhost:3100 node scripts/screenshots.mjs
//
// Optional: CHROME_PATH=/path/to/chrome to use an existing Chromium build.
// Not part of `npm test`; playwright is not a dependency of the app.
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const OUT = process.env.OUT_DIR || "docs/screenshots";
const PHOTO = process.env.PROOF_PHOTO || "public/icons/icon-512.png";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "en-IN",
  timezoneId: "Asia/Kolkata"
});
const page = await context.newPage();
const shot = async (name, fullPage = false) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log("saved", name);
};

// 1. First visit: landing
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.getByText("How it works").waitFor();
await shot("01-home");
await page.getByText("How it works").scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 200));
await shot("01b-home-how-it-works");
await page.evaluate(() => window.scrollTo(0, 0));

// 2. Demo quest (no location permission)
await page.getByRole("button", { name: /Try a demo quest/ }).click();
await page.getByText("Your side quest").waitFor({ timeout: 20000 });
await shot("02-quest");
await page.evaluate(() => window.scrollBy(0, 560));
await shot("02b-quest-steps");
await page.getByText("What left your device").click();
await page.getByText("Stayed on this phone").waitFor();
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot("03-what-left-your-device");

// 3. Voice mode
await page.getByRole("button", { name: /Go dark/ }).click();
await page.waitForURL(/\/voice/);
await shot("04-voice");
for (let i = 0; i < 5; i++) {
  await page.mouse.click(195, 420);
  await page.waitForTimeout(400);
  if (i === 0) {
    await page.getByRole("button", { name: "Show text" }).click();
    await shot("04b-voice-step");
  }
}
await page.waitForURL(/\/finish/, { timeout: 10000 });

// 4. Proof photo + stamp
await page.locator('input[type="file"]').setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: await readFile(PHOTO) });
await page.getByRole("button", { name: /Check my photo/ }).waitFor();
await shot("05-proof");
await page.getByRole("button", { name: /Check my photo/ }).click();
await page.getByText("See your journal").waitFor({ timeout: 20000 });
await shot("06-stamp");

// 5. Journal and settings
await page.goto(`${BASE}/journal`, { waitUntil: "load" });
await page.getByText("Time well spent").waitFor();
await shot("07-journal");
await page.goto(`${BASE}/settings`, { waitUntil: "load" });
await page.getByText("Open models").waitFor();
await shot("08-settings");
await page.getByText("Open models").scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, 300));
await shot("08b-settings-models");

// 6. Returning user home
await page.goto(`${BASE}/`, { waitUntil: "load" });
await shot("09-home-returning");

await browser.close();
