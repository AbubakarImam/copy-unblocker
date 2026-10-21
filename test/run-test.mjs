// Loads the extension into Chromium with Playwright and checks the test page.
// Run with: npm install && npm test
import { chromium } from "playwright";
import path from "node:path";
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "test/blocked-page.html"));
const server = http.createServer((_, res) => res.end(html)).listen(0);
const url = `http://localhost:${server.address().port}/`;

const ctx = await chromium.launchPersistentContext("", {
  channel: "chromium", // the full browser; the slim headless one can't load extensions
  headless: true,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
let [worker] = ctx.serviceWorkers();
if (!worker) worker = await ctx.waitForEvent("serviceworker");

// Fire each kind of event the page tries to block, and report whether it got cancelled.
async function check(page) {
  return page.evaluate(() => {
    const text = document.getElementById("text");
    const box = document.getElementById("box");
    const cancelled = (el, event) => !el.dispatchEvent(event);
    const opts = { bubbles: true, cancelable: true, composed: true };
    return {
      copyBlocked: cancelled(text, new Event("copy", opts)),
      cutBlocked: cancelled(text, new Event("cut", opts)),
      pasteBlocked: cancelled(box, new Event("paste", opts)),
      rightClickBlocked: cancelled(text, new MouseEvent("contextmenu", opts)),
      selectBlocked: cancelled(text, new Event("selectstart", opts)),
      ctrlCBlocked: cancelled(text, new KeyboardEvent("keydown", { ...opts, key: "c", ctrlKey: true })),
      cssUserSelect: getComputedStyle(text).userSelect,
    };
  });
}

const page = await ctx.newPage();
await page.goto(url);
const off = await check(page);
console.log("extension OFF:", off);

await worker.evaluate(() => chrome.storage.sync.set({ sites: { localhost: true } }));
await page.waitForTimeout(300);
const on = await check(page);
console.log("extension ON: ", on);

// A real mouse selection, which the page tries to wipe every 500ms
await page.click("#text", { clickCount: 3 });
await page.waitForTimeout(700);
const selected = await page.evaluate(() => getSelection().toString());
console.log("selected text after 700ms:", JSON.stringify(selected));

await ctx.close();
server.close();

const ok =
  off.copyBlocked && // sanity check: the test page really does block things
  !on.copyBlocked && !on.cutBlocked && !on.pasteBlocked && !on.rightClickBlocked &&
  !on.selectBlocked && !on.ctrlCBlocked && on.cssUserSelect === "text" &&
  selected.includes("Try to select");
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
