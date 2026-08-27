import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const listings = [
  { slug: "daisyui", url: "https://daisyui.com" },
  { slug: "dribbble", url: "https://dribbble.com" },
  { slug: "excalidraw", url: "https://excalidraw.com" },
  { slug: "fontshare", url: "https://www.fontshare.com" },
  { slug: "iconify", url: "https://iconify.design" },
  { slug: "lapa-ninja", url: "https://www.lapa.ninja" },
  { slug: "lucide", url: "https://lucide.dev" },
  { slug: "poly-pizza", url: "https://poly.pizza" },
  { slug: "shadcn-ui", url: "https://ui.shadcn.com" },
  { slug: "undraw", url: "https://undraw.co" },
  { slug: "unsplash", url: "https://unsplash.com" },
];

const outDir = path.join(process.cwd(), "public", "previews");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ["--disable-blink-features=AutomationControlled"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  locale: "en-US",
});
const page = await context.newPage();

const ok = [];
for (const { slug, url } of listings) {
  const dest = path.join(outDir, `${slug}.jpg`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);
    for (const label of ["Accept all", "Accept", "I agree", "Got it", "OK"]) {
      const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
      if (await btn.count()) {
        await btn.first().click({ timeout: 1500 }).catch(() => {});
      }
    }
    await page.screenshot({
      path: dest,
      type: "jpeg",
      quality: 70,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    if (fs.statSync(dest).size < 4000) {
      throw new Error("screenshot too small");
    }
    console.log("captured", slug, fs.statSync(dest).size);
    ok.push(slug);
  } catch (err) {
    console.error("miss", slug, err.message);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  }
}

await browser.close();

const dir = path.join(process.cwd(), "src", "content", "directories");
for (const slug of ok) {
  const md = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(md)) continue;
  const text = fs.readFileSync(md, "utf8");
  fs.writeFileSync(md, text.replace(/^preview: .*$/m, `preview: /previews/${slug}.jpg`));
  const svg = path.join(outDir, `${slug}.svg`);
  if (fs.existsSync(svg)) fs.unlinkSync(svg);
}

console.log("done", ok.join(",") || "none");
if (!ok.length) process.exit(1);
