// The private apps' home-screen icons (docs/apps.md, "The home-screen app"): each app's line
// drawing, in the site's cream on the space theme's night blue with the accent orange, drawn as SVG
// here and saved as PNGs at the sizes iPhones and the manifest ask for. The drawing sits inside the
// middle 70%, so the same picture works where it's cut to a circle or a squircle ("maskable").
//   node tools/app-icons.mjs        (writes assets/images/app-<name>-{512,192,180}.png; commit them)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const NIGHT = ['#161a33', '#0c0e1e'], CREAM = '#faf7f2', ORANGE = '#ff7a45'; // --bg-2 and --bg (dark), --bg (light), --accent (dark)
// each drawing on a 24-unit grid, in the wardrobe's line style
const ART = {
  // the closet's hanger (apps/wardrobe.html, #i-closet), its hook in orange
  wardrobe: `<g transform="translate(0 2.3)"><path d="M12 7.5V7a2 2 0 1 0-2-2" stroke="${ORANGE}"/><path d="M12 7.5 2.8 14.6a1 1 0 0 0 .6 1.8h17.2a1 1 0 0 0 .6-1.8z" stroke="${CREAM}"/></g>`, // centred
  // a bowl, with steam in orange
  recipes: `<path d="M3.5 12.5h17a8.5 8.5 0 0 1-17 0z" stroke="${CREAM}"/><path d="M9 21h6" stroke="${CREAM}"/><path d="M9 9c-1-1.2 1-2.3 0-3.5M12.5 9c-1-1.2 1-2.3 0-3.5M16 9c-1-1.2 1-2.3 0-3.5" stroke="${ORANGE}"/>`,
};
const svg = (art, px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NIGHT[0]}"/><stop offset="1" stop-color="${NIGHT[1]}"/></linearGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <g transform="translate(20 19) scale(2.5)" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${art}</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, art] of Object.entries(ART)) {
  for (const px of [512, 192, 180]) {
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<style>html,body{margin:0}</style>${svg(art, px)}`);
    const file = `assets/images/app-${name}-${px}.png`;
    writeFileSync(file, await page.locator('svg').screenshot({ omitBackground: false }));
    console.log(file);
  }
}
await browser.close();
