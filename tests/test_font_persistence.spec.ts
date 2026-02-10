/**
 * Test that font settings persist after page refresh
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test('font settings persist after refresh', async ({ page }) => {
    await page.goto(RELAY_URL);
    await page.waitForTimeout(500);

    // Set font sizes via localStorage first (simulating saved settings)
    await page.evaluate(() => {
        localStorage.setItem('chatRelayDisplay', JSON.stringify({
            axionFontSize: 20,
            brettFontSize: 18
        }));
    });

    // Refresh the page
    await page.reload();
    await page.waitForTimeout(500);

    // Take screenshot after refresh
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/7d75f49c_font_persist_01_after_refresh.png`,
        fullPage: true
    });

    // Check if fonts were applied
    const axionFontSize = await page.evaluate(() => {
        const el = document.getElementById('responseArea');
        return window.getComputedStyle(el!).fontSize;
    });
    console.log('AXION font size after refresh:', axionFontSize);

    const brettFontSize = await page.evaluate(() => {
        const el = document.getElementById('inputArea');
        return window.getComputedStyle(el!).fontSize;
    });
    console.log('BRETT font size after refresh:', brettFontSize);

    // Verify the fonts are the saved sizes
    expect(axionFontSize).toBe('20px');
    expect(brettFontSize).toBe('18px');

    // Now open display settings and verify values are shown correctly
    await page.click('button:has-text("Display")');
    await page.waitForTimeout(300);

    // Take screenshot of display modal
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/7d75f49c_font_persist_02_modal.png`,
        fullPage: true
    });

    // Check slider values
    const axionSlider = await page.evaluate(() => {
        return (document.getElementById('axionFontSize') as HTMLInputElement).value;
    });
    const brettSlider = await page.evaluate(() => {
        return (document.getElementById('brettFontSize') as HTMLInputElement).value;
    });

    console.log('Slider values - AXION:', axionSlider, 'BRETT:', brettSlider);
    expect(axionSlider).toBe('20');
    expect(brettSlider).toBe('18');
});

test('full workflow: change, save, refresh, verify', async ({ page }) => {
    // Clear any existing settings
    await page.goto(RELAY_URL);
    await page.evaluate(() => localStorage.removeItem('chatRelayDisplay'));
    await page.reload();
    await page.waitForTimeout(500);

    // Initial font should be default (14px)
    const initialFont = await page.evaluate(() => {
        return window.getComputedStyle(document.getElementById('responseArea')!).fontSize;
    });
    console.log('Initial AXION font:', initialFont);

    // Open display settings
    await page.click('button:has-text("Display")');
    await page.waitForTimeout(300);

    // Change AXION font to 22px using slider
    await page.evaluate(() => {
        const input = document.getElementById('axionFontSize') as HTMLInputElement;
        input.value = '22';
        input.dispatchEvent(new Event('input'));
    });

    await page.waitForTimeout(200);

    // Save
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(500);

    // Take screenshot before refresh
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/7d75f49c_font_persist_03_before_refresh.png`,
        fullPage: true
    });

    // Refresh the page
    await page.reload();
    await page.waitForTimeout(500);

    // Take screenshot after refresh
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/7d75f49c_font_persist_04_after_refresh.png`,
        fullPage: true
    });

    // Verify font persisted
    const afterRefreshFont = await page.evaluate(() => {
        return window.getComputedStyle(document.getElementById('responseArea')!).fontSize;
    });
    console.log('AXION font after save and refresh:', afterRefreshFont);

    expect(afterRefreshFont).toBe('22px');
});
