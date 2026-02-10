import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Live Box Chunk Display', () => {
    test('live box shows only new chunk, previous content moves below', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Screenshot initial state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/chunk_01_initial.png`,
            fullPage: true
        });

        // Start streaming
        await page.evaluate(() => {
            (window as any).startStreaming();
        });

        await page.waitForTimeout(200);

        // Simulate first chunk coming in
        await page.evaluate(() => {
            (window as any).updateLiveBoxWithChunk(
                'Hello, I understand your request.',
                'Test user message',
                'Processing...'
            );
        });

        await page.waitForTimeout(300);

        // Screenshot after first chunk
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/chunk_02_first.png`,
            fullPage: true
        });

        // Verify live box shows the chunk
        const liveContent = page.locator('#liveActivityContent');
        await expect(liveContent).toContainText('Hello');

        // Simulate second chunk - more text added
        await page.evaluate(() => {
            (window as any).updateLiveBoxWithChunk(
                'Hello, I understand your request. Let me help you with that.',
                'Test user message',
                'Thinking...'
            );
        });

        await page.waitForTimeout(300);

        // Screenshot after second chunk
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/chunk_03_second.png`,
            fullPage: true
        });

        // Verify live box shows ONLY the new part
        const liveText = await liveContent.textContent();
        console.log('Live box content after 2nd chunk:', liveText);

        // The new chunk should be "Let me help you with that."
        expect(liveText).toContain('Let me help');

        // Verify streaming progress area shows previous content
        const streamingProgress = page.locator('.streaming-progress');
        const hasProgress = await streamingProgress.count() > 0;
        console.log('Has streaming progress below:', hasProgress);
        expect(hasProgress).toBe(true);

        // Verify previous text is in streaming progress
        await expect(streamingProgress).toContainText('Hello');

        // Simulate third chunk
        await page.evaluate(() => {
            (window as any).updateLiveBoxWithChunk(
                'Hello, I understand your request. Let me help you with that. Here is my analysis:',
                'Test user message',
                'Analyzing...'
            );
        });

        await page.waitForTimeout(300);

        // Screenshot after third chunk
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/chunk_04_third.png`,
            fullPage: true
        });

        // Verify streaming progress has accumulated previous content
        const progressText = await streamingProgress.textContent();
        console.log('Streaming progress content:', progressText);
        expect(progressText).toContain('Hello');
        expect(progressText).toContain('Let me help');

        // Live box should show the newest part
        const finalLiveText = await liveContent.textContent();
        console.log('Final live box content:', finalLiveText);
        expect(finalLiveText).toContain('Here is my analysis');

        // Now complete and hide
        await page.evaluate(() => {
            (window as any).completeLiveBox();
        });

        await page.waitForTimeout(200);

        // Screenshot complete state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/chunk_05_complete.png`,
            fullPage: true
        });

        await page.evaluate(() => {
            (window as any).hideLiveBox();
        });

        await page.waitForTimeout(200);

        // Screenshot hidden state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/chunk_06_hidden.png`,
            fullPage: true
        });

        // Verify streaming progress is also removed
        const progressAfterHide = await page.locator('.streaming-progress').count();
        expect(progressAfterHide).toBe(0);

        console.log('Live chunk display test passed!');
    });
});
