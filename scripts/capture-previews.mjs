import fs from "node:fs";
import path from "node:path";

const listings = [
  { slug: "lapa-ninja", url: "https://www.lapa.ninja" },
  { slug: "poly-pizza", url: "https://poly.pizza" },
  { slug: "unsplash", url: "https://unsplash.com" },
];

const outDir = path.join(process.cwd(), "public", "previews");
fs.mkdirSync(outDir, { recursive: true });

const ok = [];
for (const { slug, url } of listings) {
  const dest = path.join(outDir, `${slug}.jpg`);
  const shot = `https://mini.s-shot.ru/1440x900/JPEG/1440/Z80/?${url}`;
  try {
    const res = await fetch(shot, {
      headers: { "User-Agent": "Mozilla/5.0 DirectoryPreview/1.0" },
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 50000 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      throw new Error(`bad jpeg ${buf.length}`);
    }
    fs.writeFileSync(dest, buf);
    const mdDir = path.join(process.cwd(), "src", "content", "directories");
    const md = path.join(mdDir, `${slug}.md`);
    if (fs.existsSync(md)) {
      const text = fs.readFileSync(md, "utf8");
      fs.writeFileSync(
        md,
        text.replace(/^preview: .*$/m, `preview: /previews/${slug}.jpg`),
      );
    }
    const svg = path.join(outDir, `${slug}.svg`);
    if (fs.existsSync(svg)) fs.unlinkSync(svg);
    ok.push(slug);
    console.log("captured", slug, buf.length);
  } catch (err) {
    console.error("miss", slug, err.message);
  }
}

console.log("done", ok.join(",") || "none");
if (ok.length !== listings.length) process.exit(1);
