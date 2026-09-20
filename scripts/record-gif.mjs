import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

async function generateGif() {
  const framesDir = path.resolve(process.cwd(), 'docs/assets/frames');
  if (fs.existsSync(framesDir)) {
    fs.rmSync(framesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 720, deviceScaleFactor: 1 });

  let frameCount = 0;
  const captureFrame = async (repeats = 1) => {
    const filename = path.join(framesDir, `frame_${String(frameCount).padStart(5, '0')}.png`);
    await page.screenshot({ path: filename });
    frameCount++;
    for (let i = 1; i < repeats; i++) {
      const dup = path.join(framesDir, `frame_${String(frameCount).padStart(5, '0')}.png`);
      fs.copyFileSync(filename, dup);
      frameCount++;
    }
  };

  console.log('1. Loading landing page...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  // Hold landing page for ~20 frames (~2 seconds at 10 fps)
  await captureFrame(20);

  console.log('2. Clicking Create New Room...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && (b.textContent.includes('Create') || b.textContent.includes('New Room')));
    if (btn) btn.click();
  });

  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));
  // Hold empty room for ~10 frames (~1 second)
  await captureFrame(10);

  console.log('3. Typing clipboard text...');
  const textarea = await page.waitForSelector('textarea');
  const textToType = 'git clone https://github.com/0xReLogic/Clipboard-Sync.git';
  
  // Type in chunks to simulate typing smoothly
  const chunks = textToType.split(' ');
  for (let i = 0; i < chunks.length; i++) {
    await textarea.type((i === 0 ? '' : ' ') + chunks[i], { delay: 40 });
    await captureFrame(2);
  }
  // Hold typed state for ~8 frames
  await captureFrame(8);

  console.log('4. Submitting text to room...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sendBtn = buttons.find(b => b.textContent && (b.textContent.includes('Send') || b.textContent.includes('Sync')));
    if (sendBtn) sendBtn.click();
  });

  await new Promise(r => setTimeout(r, 600));
  // Hold synced card state for ~25 frames (~2.5 seconds)
  await captureFrame(25);

  console.log('5. Opening QR modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const qrBtn = buttons.find(b => b.textContent && (b.textContent.includes('Pair') || b.textContent.includes('QR')));
    if (qrBtn) qrBtn.click();
  });

  await new Promise(r => setTimeout(r, 600));
  // Hold QR modal for ~25 frames (~2.5 seconds)
  await captureFrame(25);

  await browser.close();
  console.log(`Captured ${frameCount} frames.`);

  console.log('Encoding GIF with ffmpeg...');
  const gifPath = path.resolve(process.cwd(), 'docs/assets/demo-preview.gif');
  
  // Use high quality palette generation
  execSync(
    `ffmpeg -y -framerate 10 -i "${framesDir}/frame_%05d.png" -vf "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`,
    { stdio: 'inherit' }
  );

  // Clean up frames directory
  fs.rmSync(framesDir, { recursive: true, force: true });
  console.log(`GIF generated successfully at: ${gifPath}`);
}

generateGif().catch(err => {
  console.error('Error generating GIF:', err);
  process.exit(1);
});
