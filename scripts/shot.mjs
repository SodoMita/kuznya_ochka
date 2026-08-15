/* Headless screenshot of the built game for visual iteration.
   Usage: node scripts/shot.mjs out.png [--play]  (--play deploys towers + launches a wave) */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const out = process.argv[2] || 'shot.png';
const play = process.argv.includes('--play');

process.env.LD_LIBRARY_PATH = '/tmp/chromelibs/lib:' + (process.env.LD_LIBRARY_PATH || '');
const browser = await puppeteer.launch({
  args: [...chromium.args, '--no-sandbox'],
  executablePath: await chromium.executablePath(),
  defaultViewport: { width: 980, height: 1000 },
  headless: 'shell'
});
const page = await browser.newPage();
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:4173/index.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 800));

if (play) {
  await page.evaluate(() => new Promise(res => {
    const cv = document.getElementById('cv');
    const r = cv.getBoundingClientRect();
    function tap(el, x, y) {
      const opts = { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
    }
    /* deploy each affordable board onto the field a few times */
    let n = 0;
    const iv = setInterval(() => {
      const cards = document.querySelectorAll('#cards .card.runnable');
      let played = false;
      for (const c of cards) {
        tap(c, 10, 10);
        tap(cv, r.left + r.width * (0.25 + 0.5 * Math.random()), r.top + r.height * (0.25 + 0.5 * Math.random()));
        played = true;
        break;
      }
      if (++n > 14 || !played) {
        clearInterval(iv);
        const sb = document.getElementById('startBtn');
        if (sb) { tap(sb, 5, 5); }
        setTimeout(res, 6000); /* let the wave walk in */
      }
    }, 250);
  }));
}

await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
