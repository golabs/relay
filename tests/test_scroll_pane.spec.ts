/**
 * Test scrolling on the correct element (pane-content, not responseArea)
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test('pane-content scrolls to top when startStreaming is called', async ({ page }) => {
    await page.goto(RELAY_URL);
    await page.waitForTimeout(500);

    // Check the pane-content element dimensions
    const dims = await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        const paneContent = responseArea!.parentElement;
        return {
            pane: {
                clientHeight: paneContent!.clientHeight,
                scrollHeight: paneContent!.scrollHeight,
                scrollTop: paneContent!.scrollTop
            },
            area: {
                clientHeight: responseArea!.clientHeight,
                scrollHeight: responseArea!.scrollHeight
            }
        };
    });
    console.log('Initial dimensions:', dims);

    // Add lots of content to make scrollable
    await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        let content = '';
        for (let i = 1; i <= 100; i++) {
            content += `<div style="padding:15px;border-bottom:1px solid #444;">Message ${i}: Lorem ipsum content here.</div>`;
        }
        responseArea!.innerHTML = content;
    });

    await page.waitForTimeout(200);

    // Check dimensions after adding content
    const dimsAfter = await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        const paneContent = responseArea!.parentElement;
        return {
            pane: {
                clientHeight: paneContent!.clientHeight,
                scrollHeight: paneContent!.scrollHeight,
                scrollTop: paneContent!.scrollTop,
                isScrollable: paneContent!.scrollHeight > paneContent!.clientHeight
            }
        };
    });
    console.log('After adding content:', dimsAfter);

    // Scroll pane-content to bottom
    await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        const paneContent = responseArea!.parentElement;
        paneContent!.scrollTop = paneContent!.scrollHeight;
    });

    await page.waitForTimeout(100);

    const scrolledPos = await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        const paneContent = responseArea!.parentElement;
        return paneContent!.scrollTop;
    });
    console.log('After scrolling pane to bottom:', scrolledPos);

    // Take screenshot at bottom
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/17c5c691_pane_scroll_bottom.png`,
        fullPage: true
    });

    // Now call startStreaming (should scroll pane to top)
    await page.evaluate(() => {
        if (typeof (window as any).startStreaming === 'function') {
            (window as any).startStreaming();
        }
    });

    await page.waitForTimeout(300);

    const finalPos = await page.evaluate(() => {
        const responseArea = document.getElementById('responseArea');
        const paneContent = responseArea!.parentElement;
        return paneContent!.scrollTop;
    });
    console.log('After startStreaming:', finalPos);

    // Take screenshot at top
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/17c5c691_pane_scroll_top.png`,
        fullPage: true
    });

    // Check if pane is scrollable
    if (dimsAfter.pane.isScrollable) {
        expect(finalPos).toBe(0);
    } else {
        console.log('Note: Pane is not scrollable in this viewport');
    }
});
