// Record the demo video by driving the real board + agent in Chrome.
// Needs a running `npm run dev` with a model key, Chrome, and ffmpeg on PATH.
//
//   node scripts/record-demo.ts            -> docs/demo.mp4
//
// Everything on screen is live: real pages, real tool calls, real model output.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";

const BASE = process.env.HACKDESK_URL ?? "http://127.0.0.1:2000";
const BOARD = `${BASE}/eve/v1/hackdesk`;
const CHROME =
  process.env.CHROME_PATH ??
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync)!;
const W = 1440;
const H = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_CSS = `
  .chat{width:600px!important;max-height:86vh!important}
  #log{max-height:66vh!important}
  #cap{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99;background:#7c9cffee;color:#fff;
    padding:10px 20px;border-radius:12px;font:600 20px/1.35 system-ui;box-shadow:0 8px 30px #0008;max-width:80vw;text-align:center;transition:opacity .3s}
  #cap small{display:block;font-weight:500;font-size:14px;opacity:.9}
  #title{position:fixed;inset:0;z-index:100;background:#0b0d10;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#e6edf3;font-family:system-ui}
  #title h1{font-size:72px;margin:0;letter-spacing:-.03em}#title p{font-size:24px;color:#8b98a5;margin:14px 0 0}
`;

async function prep(page: Page) {
  await page.addStyleTag({ content: DEMO_CSS });
}

async function caption(page: Page, text: string, sub = "") {
  await page.evaluate(
    (t, s) => {
      let el = document.getElementById("cap");
      if (!el) {
        el = document.createElement("div");
        el.id = "cap";
        document.body.appendChild(el);
      }
      el.innerHTML = t + (s ? `<small>${s}</small>` : "");
      el.style.opacity = "1";
    },
    text,
    sub,
  );
}

async function chat(page: Page, message: string, { reload = true } = {}) {
  await page.evaluate(() => ((document.getElementById("chat") as HTMLDetailsElement).open = true));
  await page.click("#q");
  await page.type("#q", message, { delay: 28 });
  await sleep(300);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => (window as any).__busy === true, { timeout: 10_000 }).catch(() => {});
  await page.waitForFunction(() => (window as any).__busy === false, { timeout: 240_000, polling: 500 });
  await sleep(2500);
  if (reload) {
    await page.waitForNavigation({ timeout: 4000 }).catch(() => {});
    await prep(page);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: W, height: H },
  args: [`--window-size=${W},${H}`, "--force-dark-mode", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await page.goto(BOARD, { waitUntil: "networkidle0" });
await prep(page);

const recorder = await page.screencast({ path: "docs/demo.webm" });

// 1. Title
await page.evaluate(() => {
  const t = document.createElement("div");
  t.id = "title";
  t.innerHTML = "<h1>hackdesk</h1><p>a submission desk for people who enter too many hackathons</p><p style='font-size:18px'>built with eve</p>";
  document.body.appendChild(t);
});
await sleep(3500);
await page.evaluate(() => document.getElementById("title")?.remove());

// 2. Track the eve challenge: the "before Dec 11" trap
await caption(page, "Give it a challenge URL", "it reads the page, finds the real deadline, builds the checklist");
await chat(page, "track https://eve.dev/challenge");
await caption(page, "It caught the fine print", '"Submit before Dec 11" + no timezone → plan for Dec 10, 10:00 UTC');
await page.evaluate(() => document.querySelectorAll("details.assume").forEach((d) => ((d as HTMLDetailsElement).open = true)));
await sleep(5000);

// 3. A second challenge with a PT deadline after DST ended
await caption(page, "Another challenge, another timezone", '"11:59 PM PT" on Nov 29 → PST, UTC−8 (DST ended Nov 1)');
await chat(page, "track https://vast-showcase.vercel.app");
await sleep(3500);

// 4. Prioritize
await caption(page, "What should I do next?", "ranked by exact time left and open required items");
await chat(page, "what should I work on right now?", { reload: false });
await sleep(3000);

// 5. Audit (board button, no model) then judge (subagent reads the code)
await caption(page, "One-click repo audit", "dependencies, tests, CI, demo video, live link… with a fix for each");
const auditBtn = await page.$("button[data-audit]");
if (auditBtn) {
  await auditBtn.click();
  await page.waitForFunction(() => !document.querySelector("button[data-audit]")?.hasAttribute("disabled"), { timeout: 60_000 });
  await sleep(5000);
}
await caption(page, "A strict judge subagent", "scores you on the challenge's own criteria after reading your code");
await chat(page, "judge my eve entry github.com/0xChand/hackdesk", { reload: false });
await sleep(4000);

// 6. Post
await caption(page, "Draft the post", "X-accurate length, required @mentions checked, never posts by itself");
await chat(page, "draft my X post for the eve challenge", { reload: false });
await sleep(4000);

// 7. Outro
await caption(page, "Also: iCal feed with alarms · page-change watcher · MCP server for Claude Code", "github.com/0xChand/hackdesk");
await sleep(5000);

await recorder.stop();
await browser.close();

execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "docs/demo.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", "docs/demo.mp4"]);
console.log("wrote docs/demo.mp4");
