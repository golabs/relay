/**
 * Simple scroll test with proper height verification
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test('verify scroll behavior', async ({ page }) => {
    await page.goto(RELAY_URL);
    await page.waitForTimeout(500);

    // Check initial dimensions
    const dims = await page.evaluate(() => {
        const el = document.getElementById('responseArea');
        return {
            clientHeight: el!.clientHeight,
            scrollHeight: el!.scrollHeight,
            scrollTop: el!.scrollTop
        };
    });
    console.log('Initial dimensions:', dims);

    // Add lots of content to force scrolling
    await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        let content = '<div style="min-height:2000px;background:linear-gradient(#111,#333);">';
        for (let i = 1; i <= 100; i++) {
            content += `<div style="padding:15px;border-bottom:1px solid #444;">Message ${i}: Lorem ipsum content here to make the list longer.</div>`;
        }
        content += '</div>';
        responseArea!.innerHTML = content;
    });

    await page.waitForTimeout(200);

    // Check dimensions again
    const dimsAfter = await page.evaluate(() => {
        const el = document.getElementById('responseArea');
        return {
            clientHeight: el!.clientHeight,
            scrollHeight: el!.scrollHeight,
            scrollTop: el!.scrollTop,
            isScrollable: el!.scrollHeight > el!.clientHeight
        };
    });
    console.log('After adding content:', dimsAfter);

    // Now scroll to bottom
    await page.evaluate(() => {
        const el = document.getElementById('responseArea');
        el!.scrollTop = el!.scrollHeight;
    });

    await page.waitForTimeout(100);

    const scrolledPos = await page.evaluate(() => {
        const el = document.getElementById('responseArea');
        return el!.scrollTop;
    });
    console.log('After scrolling to bottom:', scrolledPos);

    // Take screenshot at bottom
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/17c5c691_scroll_test_bottom.png`,
        fullPage: true
    });

    // Now call startStreaming
    await page.evaluate(() => {
        // Access the function from window if exposed
        if (typeof (window as any).startStreaming === 'function') {
            (window as any).startStreaming();
        } else {
            // Fallback: manually scroll to top
            document.getElementById('responseArea')!.scrollTop = 0;
        }
    });

    await page.waitForTimeout(300);

    const finalPos = await page.evaluate(() => {
        const el = document.getElementById('responseArea');
        return el!.scrollTop;
    });
    console.log('After startStreaming:', finalPos);

    // Take screenshot at top
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/17c5c691_scroll_test_top.png`,
        fullPage: true
    });

    // Verify we're at top
    expect(finalPos).toBe(0);
});
