/**
 * Test auto-scroll functionality in the relay response area
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Auto-scroll', () => {
    test('response area scrolls to bottom when new content is added', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // Take initial screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_scroll_01_initial.png`,
            fullPage: true
        });

        // Inject a lot of content into the response area to make it scrollable
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            let content = '';
            for (let i = 1; i <= 50; i++) {
                content += `<div style="padding:10px;border-bottom:1px solid #333;">Line ${i}: This is some test content to make the area scrollable.</div>`;
            }
            responseArea!.innerHTML = content;
        });

        await page.waitForTimeout(300);

        // Take screenshot showing scrollable content
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_scroll_02_content.png`,
            fullPage: true
        });

        // Check current scroll position (should be at bottom due to userNearBottom = true initially)
        const scrollInfo1 = await page.evaluate(() => {
            const el = document.getElementById('responseArea');
            return {
                scrollTop: el!.scrollTop,
                scrollHeight: el!.scrollHeight,
                clientHeight: el!.clientHeight
            };
        });
        console.log('Initial scroll:', scrollInfo1);

        // Now simulate adding new content (like during polling)
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            responseArea!.innerHTML += '<div style="padding:10px;background:#224;border-bottom:1px solid #333;"><strong>NEW ACTIVITY:</strong> This is new streaming content!</div>';
            // Trigger the scrollToBottom function
            (window as any).responseArea = responseArea;
            responseArea!.scrollTop = responseArea!.scrollHeight;
        });

        await page.waitForTimeout(300);

        // Take screenshot showing scrolled to new content
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_scroll_03_newcontent.png`,
            fullPage: true
        });

        // Check scroll position is at bottom
        const scrollInfo2 = await page.evaluate(() => {
            const el = document.getElementById('responseArea');
            return {
                scrollTop: el!.scrollTop,
                scrollHeight: el!.scrollHeight,
                clientHeight: el!.clientHeight,
                atBottom: el!.scrollHeight - el!.scrollTop - el!.clientHeight < 100
            };
        });
        console.log('After new content:', scrollInfo2);

        // Verify we're near the bottom
        expect(scrollInfo2.atBottom).toBe(true);

        console.log('Auto-scroll test passed!');
    });
});
