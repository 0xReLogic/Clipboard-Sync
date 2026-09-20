import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const outDir = path.resolve(process.cwd(), 'docs/assets');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });

  console.log('Navigating to landing page...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, '01-landing-page.png') });
  console.log('Captured: 01-landing-page.png');

  // Find and click "Create New Room" button
  console.log('Clicking Create New Room...');
  const createBtn = await page.waitForSelector('button', { visible: true });
  // Find button with text 'Create New Room' or 'Create Room'
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && (b.textContent.includes('Create') || b.textContent.includes('New Room')));
    if (btn) btn.click();
  });

  // Wait for room to load
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: path.join(outDir, '02-room-initial.png') });
  console.log('Captured: 02-room-initial.png');

  // Type some text into the clipboard input
  console.log('Adding clipboard items...');
  const textarea = await page.$('textarea');
  if (textarea) {
    await textarea.type('git clone https://github.com/0xReLogic/Clipboard-Sync.git\ncd Clipboard-Sync && npm install');
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(outDir, '03-room-typing.png') });

    // Click "Send to Room"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const sendBtn = buttons.find(b => b.textContent && (b.textContent.includes('Send') || b.textContent.includes('Sync')));
      if (sendBtn) sendBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(outDir, '04-room-synced.png') });
    console.log('Captured: 04-room-synced.png');
  }

  // Open QR modal
  console.log('Opening QR Code modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const qrBtn = buttons.find(b => b.textContent && (b.textContent.includes('QR') || b.textContent.includes('Pair') || b.textContent.includes('Invite')));
    if (qrBtn) qrBtn.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, '05-qr-modal.png') });
  console.log('Captured: 05-qr-modal.png');

  await browser.close();
  console.log('Browser capture complete.');
}

run().catch(err => {
  console.error('Error running capture:', err);
  process.exit(1);
});
