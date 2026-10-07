// The private apps' home-screen icon (docs/apps.md, "The home-screen app"): the site's SJPJr badge
// (assets/images/sj-512.png, as in the site's header) on the light theme's cream, since iOS fills a
// transparent icon with black. Cropped to the badge itself (its file has room around it), it fills
// 84% of the square for iPhones and the manifest's "any" icons (the clouds clear the rounded
// corners), and 68% for the "maskable" one, whose outer edge a launcher may cut to a circle.
//   node tools/app-icons.mjs        (writes assets/images/app-icon-{512,192,180}.png and
//                                    app-icon-maskable-512.png; commit them)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const CREAM = '#faf7f2'; // --bg (light)
const badge = `data:image/png;base64,${readFileSync('assets/images/sj-512.png').toString('base64')}`;
const icons = [['app-icon', 512, 0.84], ['app-icon', 192, 0.84], ['app-icon', 180, 0.84], ['app-icon-maskable', 512, 0.68]];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, px, fill] of icons) {
  await page.setViewportSize({ width: px, height: px });
  // the badge drawn on a canvas, cropped to where it isn't transparent, then centred at `fill`
  await page.setContent(`<style>html,body{margin:0}canvas{display:block}</style><canvas width="${px}" height="${px}"></canvas>`);
  await page.locator('canvas').evaluate(async (canvas, [src, fill, bg]) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const probe = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d');
    probe.drawImage(img, 0, 0);
    const { data } = probe.getImageData(0, 0, img.width, img.height);
    let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (data[(y * img.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, k = (canvas.width * fill) / Math.max(w, h), ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x0, y0, w, h, (canvas.width - w * k) / 2, (canvas.height - h * k) / 2, w * k, h * k);
  }, [badge, fill, CREAM]);
  const file = `assets/images/${name}-${px}.png`;
  writeFileSync(file, await page.locator('canvas').screenshot());
  console.log(file);
}
await browser.close();
