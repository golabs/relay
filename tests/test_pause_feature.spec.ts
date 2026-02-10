/**
 * Test Pause/Interrupt feature
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Pause Feature', () => {
    test('pause button appears during job and allows interruption', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // Take initial screenshot - pause button should be hidden
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/ec79729b_pause_01_initial.png`,
            fullPage: true
        });

        // Check pause button is hidden initially
        const pauseBtn = page.locator('#pauseBtn');
        const initialDisplay = await pauseBtn.evaluate(el => window.getComputedStyle(el).display);
        console.log('Initial pause button display:', initialDisplay);
        expect(initialDisplay).toBe('none');

        // Simulate a job starting by calling startStreaming
        await page.evaluate(() => {
            (window as any).currentJobId = 'test-job-123';
            if ((window as any).startStreaming) {
                (window as any).startStreaming();
            }
            if ((window as any).updatePauseButton) {
                (window as any).updatePauseButton();
            }
        });

        await page.waitForTimeout(200);

        // Take screenshot showing pause button visible
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/ec79729b_pause_02_button_visible.png`,
            fullPage: true
        });

        // Check pause button is now visible
        const duringJobDisplay = await pauseBtn.evaluate(el => window.getComputedStyle(el).display);
        console.log('During job pause button display:', duringJobDisplay);
        expect(duringJobDisplay).not.toBe('none');

        // Check button text is "Pause"
        const btnText = await pauseBtn.textContent();
        console.log('Pause button text:', btnText);
        expect(btnText).toContain('Pause');

        // Click pause button
        await pauseBtn.click();
        await page.waitForTimeout(300);

        // Take screenshot showing paused state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/ec79729b_pause_03_paused.png`,
            fullPage: true
        });

        // Check button now says "Continue"
        const pausedText = await pauseBtn.textContent();
        console.log('After pause button text:', pausedText);
        expect(pausedText).toContain('Continue');

        // Check isPaused state
        const isPaused = await page.evaluate(() => (window as any).isPaused);
        console.log('isPaused:', isPaused);
        expect(isPaused).toBe(true);

        console.log('Pause feature test passed!');
    });
});
