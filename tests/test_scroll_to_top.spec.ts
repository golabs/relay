/**
 * Test that AXION panel scrolls to top when sending messages or clicking workflow buttons
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Scroll to Top', () => {
    test('AXION scrolls to top when Send is clicked', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // First, add a lot of content to make the area scrollable
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            let content = '';
            for (let i = 1; i <= 50; i++) {
                content += `<div style="padding:20px;border-bottom:1px solid #333;">Old message ${i}: This is some previous content to make scrolling possible.</div>`;
            }
            responseArea!.innerHTML = content;
            // Scroll to bottom first
            responseArea!.scrollTop = responseArea!.scrollHeight;
        });

        await page.waitForTimeout(300);

        // Verify we're at the bottom
        const scrollBefore = await page.evaluate(() => {
            const el = document.getElementById('responseArea');
            return { scrollTop: el!.scrollTop, scrollHeight: el!.scrollHeight };
        });
        console.log('Before send - scrollTop:', scrollBefore.scrollTop);
        expect(scrollBefore.scrollTop).toBeGreaterThan(100);

        // Take screenshot showing scrolled to bottom
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_scroll_01_at_bottom.png`,
            fullPage: true
        });

        // Type a message
        await page.fill('#inputArea', 'Test message');

        // Click send (this should trigger startStreaming which scrolls to top)
        // Note: Without a project selected, it will show an error but still test the scroll
        await page.click('#sendBtn');
        await page.waitForTimeout(500);

        // Take screenshot after send
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_scroll_02_after_send.png`,
            fullPage: true
        });

        // Check scroll position - should be at top (0) or near top
        const scrollAfter = await page.evaluate(() => {
            const el = document.getElementById('responseArea');
            return el!.scrollTop;
        });
        console.log('After send - scrollTop:', scrollAfter);

        // Should be at or near top
        expect(scrollAfter).toBeLessThan(100);
    });

    test('startStreaming function scrolls to top', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // Add content and scroll to bottom
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            let content = '';
            for (let i = 1; i <= 30; i++) {
                content += `<div style="padding:30px;border-bottom:1px solid #333;">Content block ${i}</div>`;
            }
            responseArea!.innerHTML = content;
            responseArea!.scrollTop = responseArea!.scrollHeight;
        });

        // Verify scrolled down
        const before = await page.evaluate(() => document.getElementById('responseArea')!.scrollTop);
        console.log('Before startStreaming:', before);
        expect(before).toBeGreaterThan(0);

        // Call startStreaming directly
        await page.evaluate(() => {
            (window as any).startStreaming && (window as any).startStreaming();
        });

        await page.waitForTimeout(300);

        // Check if scrolled to top
        const after = await page.evaluate(() => document.getElementById('responseArea')!.scrollTop);
        console.log('After startStreaming:', after);

        // Take screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_scroll_03_after_startStreaming.png`,
            fullPage: true
        });

        expect(after).toBe(0);
    });
});
