import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Live Activity Box', () => {
    test('live box appears when streaming and shows content', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Screenshot initial state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/livebox_01_initial.png`,
            fullPage: true
        });

        // Verify live box exists but is hidden initially
        const liveBox = page.locator('#liveActivityBox');
        await expect(liveBox).toHaveCount(1);

        const initialDisplay = await liveBox.evaluate(el => window.getComputedStyle(el).display);
        expect(initialDisplay).toBe('none');
        console.log('Initial live box display:', initialDisplay);

        // Simulate starting streaming by calling startStreaming
        await page.evaluate(() => {
            (window as any).startStreaming();
        });

        await page.waitForTimeout(200);

        // Screenshot after startStreaming
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/livebox_02_active.png`,
            fullPage: true
        });

        // Verify live box is now visible
        const activeDisplay = await liveBox.evaluate(el => window.getComputedStyle(el).display);
        expect(activeDisplay).toBe('block');
        console.log('After startStreaming display:', activeDisplay);

        // Verify it has the 'active' class
        const hasActiveClass = await liveBox.evaluate(el => el.classList.contains('active'));
        expect(hasActiveClass).toBe(true);
        console.log('Has active class:', hasActiveClass);

        // Update the live box with some content
        await page.evaluate(() => {
            (window as any).updateLiveBox(
                '<div class="message-user"><strong>You:</strong> Test message</div>' +
                '<div class="message-assistant"><strong>Axion:</strong> This is a test response streaming...</div>',
                'Processing test...'
            );
        });

        await page.waitForTimeout(200);

        // Screenshot with content
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/livebox_03_with_content.png`,
            fullPage: true
        });

        // Verify content is in the live box
        const liveContent = page.locator('#liveActivityContent');
        await expect(liveContent).toContainText('Test message');
        await expect(liveContent).toContainText('test response streaming');
        console.log('Content verified in live box');

        // Verify status text
        const liveStatus = page.locator('#liveStatus');
        await expect(liveStatus).toContainText('Processing test');

        // Complete the live box
        await page.evaluate(() => {
            (window as any).completeLiveBox();
        });

        await page.waitForTimeout(200);

        // Screenshot complete state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/livebox_04_complete.png`,
            fullPage: true
        });

        // Verify complete class is added
        const hasCompleteClass = await liveBox.evaluate(el => el.classList.contains('complete'));
        expect(hasCompleteClass).toBe(true);
        console.log('Has complete class:', hasCompleteClass);

        // Hide the live box
        await page.evaluate(() => {
            (window as any).hideLiveBox();
        });

        await page.waitForTimeout(200);

        // Screenshot hidden state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/livebox_05_hidden.png`,
            fullPage: true
        });

        // Verify it's hidden again
        const hiddenDisplay = await liveBox.evaluate(el => window.getComputedStyle(el).display);
        expect(hiddenDisplay).toBe('none');
        console.log('After hide display:', hiddenDisplay);

        console.log('Live box test passed!');
    });

    test('history area is separate from live box', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Verify both elements exist
        const liveBox = page.locator('#liveActivityBox');
        const responseArea = page.locator('#responseArea');

        await expect(liveBox).toHaveCount(1);
        await expect(responseArea).toHaveCount(1);

        // They should be siblings in the pane-content
        const areSiblings = await page.evaluate(() => {
            const live = document.getElementById('liveActivityBox');
            const response = document.getElementById('responseArea');
            return live?.parentElement === response?.parentElement;
        });
        expect(areSiblings).toBe(true);
        console.log('Live box and response area are siblings:', areSiblings);

        // Live box should come before response area in DOM
        const liveBeforeResponse = await page.evaluate(() => {
            const live = document.getElementById('liveActivityBox');
            const response = document.getElementById('responseArea');
            if (!live || !response) return false;
            return live.compareDocumentPosition(response) & Node.DOCUMENT_POSITION_FOLLOWING;
        });
        expect(liveBeforeResponse).toBeTruthy();
        console.log('Live box is before response area in DOM');

        console.log('Structure test passed!');
    });
});
