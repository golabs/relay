import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Image Lightbox', () => {
    test('clicking an image opens lightbox and clicking closes it', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Add an image to the response area
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            responseArea!.innerHTML = `
                <div class="message-entry">
                    <p>Here's a test image:</p>
                    <img src="/screenshots/test_screenshot.png" alt="Test"
                         style="max-width:100%;border:1px solid var(--border);border-radius:8px;cursor:pointer;"
                         onclick="openLightbox(this.src)" title="Click to view">
                </div>
            `;
        });

        await page.waitForTimeout(200);

        // Screenshot before clicking
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/lightbox_01_before.png`,
            fullPage: true
        });

        // Verify lightbox is hidden
        const lightbox = page.locator('#imageLightbox');
        const initialDisplay = await lightbox.evaluate(el => window.getComputedStyle(el).display);
        expect(initialDisplay).toBe('none');
        console.log('Initial lightbox display:', initialDisplay);

        // Click the image
        await page.click('img[onclick*="openLightbox"]');
        await page.waitForTimeout(300);

        // Screenshot with lightbox open
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/lightbox_02_open.png`,
            fullPage: true
        });

        // Verify lightbox is visible
        const openDisplay = await lightbox.evaluate(el => window.getComputedStyle(el).display);
        expect(openDisplay).toBe('flex');
        console.log('Lightbox open display:', openDisplay);

        // Verify it has visible class
        const hasVisibleClass = await lightbox.evaluate(el => el.classList.contains('visible'));
        expect(hasVisibleClass).toBe(true);

        // Click on the lightbox background to close
        await lightbox.click({ position: { x: 10, y: 10 } }); // Click near edge, not on image
        await page.waitForTimeout(300);

        // Screenshot after close
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/lightbox_03_closed.png`,
            fullPage: true
        });

        // Verify lightbox is hidden again
        const closedDisplay = await lightbox.evaluate(el => window.getComputedStyle(el).display);
        expect(closedDisplay).toBe('none');
        console.log('Lightbox closed display:', closedDisplay);

        console.log('Lightbox test passed!');
    });

    test('pressing Escape closes the lightbox', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Add an image
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            responseArea!.innerHTML = `
                <img src="/screenshots/test_screenshot.png" onclick="openLightbox(this.src)" style="cursor:pointer;">
            `;
        });

        // Open lightbox
        await page.click('img');
        await page.waitForTimeout(200);

        // Verify it's open
        const lightbox = page.locator('#imageLightbox');
        const isVisible = await lightbox.evaluate(el => el.classList.contains('visible'));
        expect(isVisible).toBe(true);

        // Press Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Verify it's closed
        const isClosed = await lightbox.evaluate(el => !el.classList.contains('visible'));
        expect(isClosed).toBe(true);

        console.log('Escape key test passed!');
    });

    test('close button closes the lightbox', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Open lightbox directly
        await page.evaluate(() => {
            (window as any).openLightbox('/screenshots/test_screenshot.png');
        });
        await page.waitForTimeout(200);

        // Screenshot with lightbox open
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/lightbox_04_close_btn.png`,
            fullPage: true
        });

        // Verify it's open
        const lightbox = page.locator('#imageLightbox');
        expect(await lightbox.evaluate(el => el.classList.contains('visible'))).toBe(true);

        // Click close button
        await page.click('.lightbox-close');
        await page.waitForTimeout(200);

        // Verify it's closed
        expect(await lightbox.evaluate(el => !el.classList.contains('visible'))).toBe(true);

        console.log('Close button test passed!');
    });
});
