/**
 * Test Auto-Read toggle functionality
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Auto-Read Feature', () => {
    test('auto-read button toggles on and off', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // Take initial screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/3ac5bb98_autoread_01_initial.png`,
            fullPage: true
        });

        // Find the auto-read button
        const autoReadBtn = page.locator('#autoReadBtn');
        await expect(autoReadBtn).toBeVisible();

        // Check initial state (should be off)
        const initialText = await autoReadBtn.textContent();
        console.log('Initial button text:', initialText);
        expect(initialText).toContain('Off');

        // Click to enable auto-read
        await autoReadBtn.click();
        await page.waitForTimeout(300);

        // Take screenshot with auto-read on
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/3ac5bb98_autoread_02_enabled.png`,
            fullPage: true
        });

        // Check it's now on
        const enabledText = await autoReadBtn.textContent();
        console.log('After enable:', enabledText);
        expect(enabledText).toContain('On');

        // Check button styling changed
        const bgColor = await autoReadBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
        console.log('Button background when on:', bgColor);

        // Check localStorage was updated
        const savedSettings = await page.evaluate(() => {
            return localStorage.getItem('chatRelayVoices');
        });
        console.log('Saved settings:', savedSettings);
        expect(savedSettings).toContain('"autoRead":true');

        // Click to disable
        await autoReadBtn.click();
        await page.waitForTimeout(300);

        // Take screenshot with auto-read off
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/3ac5bb98_autoread_03_disabled.png`,
            fullPage: true
        });

        // Check it's off again
        const disabledText = await autoReadBtn.textContent();
        console.log('After disable:', disabledText);
        expect(disabledText).toContain('Off');

        // Check localStorage was updated
        const savedSettings2 = await page.evaluate(() => {
            return localStorage.getItem('chatRelayVoices');
        });
        expect(savedSettings2).toContain('"autoRead":false');
    });

    test('auto-read setting persists after refresh', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // Enable auto-read
        await page.click('#autoReadBtn');
        await page.waitForTimeout(300);

        // Refresh page
        await page.reload();
        await page.waitForTimeout(500);

        // Check button state after refresh
        const btnText = await page.locator('#autoReadBtn').textContent();
        console.log('After refresh:', btnText);
        expect(btnText).toContain('On');

        // Take screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/3ac5bb98_autoread_04_persisted.png`,
            fullPage: true
        });
    });
});
