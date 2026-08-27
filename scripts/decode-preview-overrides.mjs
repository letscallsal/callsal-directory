import fs from "node:fs";
import path from "node:path";

const slugs = ["lapa-ninja", "poly-pizza", "unsplash"];
const overrideDir = path.join(process.cwd(), "scripts", "preview-overrides");
const outDir = path.join(process.cwd(), "public", "previews");
const mdDir = path.join(process.cwd(), "src", "content", "directories");
fs.mkdirSync(outDir, { recursive: true });

const ok = [];
for (const slug of slugs) {
  const b64path = path.join(overrideDir, `${slug}.jpg.b64`);
  if (!fs.existsSync(b64path)) continue;
  const dest = path.join(outDir, `${slug}.jpg`);
  const bytes = Buffer.from(fs.readFileSync(b64path, "utf8"), "base64");
  if (bytes.length < 4000) {
    console.error("too small", slug, bytes.length);
    continue;
  }
  fs.writeFileSync(dest, bytes);
  const svg = path.join(outDir, `${slug}.svg`);
  if (fs.existsSync(svg)) fs.unlinkSync(svg);
  const md = path.join(mdDir, `${slug}.md`);
  if (fs.existsSync(md)) {
    const text = fs.readFileSync(md, "utf8");
    fs.writeFileSync(md, text.replace(/^preview: .*$/m, `preview: /previews/${slug}.jpg`));
  }
  ok.push(slug);
  console.log("decoded", slug, bytes.length);
}

console.log("done", ok.join(",") || "none");
if (!ok.length) process.exit(1);
