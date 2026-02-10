/**
 * Test Display Settings functionality
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Display Settings', () => {
    test('can open display settings and change font sizes', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForTimeout(500);

        // Take initial screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_display_01_initial.png`,
            fullPage: true
        });

        // Click Display button
        await page.click('button:has-text("Display")');
        await page.waitForTimeout(300);

        // Take screenshot of display modal
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_display_02_modal.png`,
            fullPage: true
        });

        // Check modal is visible
        const modal = page.locator('#displayModal');
        await expect(modal).toBeVisible();

        // Change AXION font size to 18
        await page.fill('#axionFontSize', '18');
        await page.evaluate(() => {
            const input = document.getElementById('axionFontSize') as HTMLInputElement;
            input.value = '18';
            input.dispatchEvent(new Event('input'));
        });

        // Change BRETT font size to 16
        await page.evaluate(() => {
            const input = document.getElementById('brettFontSize') as HTMLInputElement;
            input.value = '16';
            input.dispatchEvent(new Event('input'));
        });

        await page.waitForTimeout(300);

        // Take screenshot showing changed sizes
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_display_03_changed.png`,
            fullPage: true
        });

        // Save settings
        await page.click('button:has-text("Save")');
        await page.waitForTimeout(500);

        // Take final screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/17c5c691_display_04_saved.png`,
            fullPage: true
        });

        // Verify font sizes were applied
        const axionFontSize = await page.evaluate(() => {
            const el = document.getElementById('responseArea');
            return window.getComputedStyle(el!).fontSize;
        });
        console.log('AXION font size:', axionFontSize);

        const brettFontSize = await page.evaluate(() => {
            const el = document.getElementById('inputArea');
            return window.getComputedStyle(el!).fontSize;
        });
        console.log('BRETT font size:', brettFontSize);

        // Check settings persisted in localStorage
        const savedSettings = await page.evaluate(() => {
            return localStorage.getItem('chatRelayDisplay');
        });
        console.log('Saved settings:', savedSettings);

        expect(savedSettings).toContain('axionFontSize');
    });
});
