/**
 * Test screenshot functionality in the relay system
 * Verifies that screenshots are captured, stored, and displayed correctly
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Screenshot Functionality', () => {
    test('relay page loads and shows screenshot gallery', async ({ page }) => {
        // Take initial screenshot
        await page.goto(RELAY_URL);
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_01_relay_loaded.png`,
            fullPage: true
        });

        // Verify page loaded
        await expect(page.locator('h1')).toContainText('Relay');

        // Click the Screenshots button
        await page.click('button:has-text("Screenshots")');
        await page.waitForTimeout(1000);

        // Take screenshot of gallery
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_02_screenshot_gallery.png`,
            fullPage: true
        });

        // Verify gallery appears
        const gallery = page.locator('text=Recent Screenshots');
        await expect(gallery).toBeVisible();
    });

    test('screenshots API returns correct data', async ({ request }) => {
        const response = await request.get(`${RELAY_URL}/api/screenshots`);
        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data.screenshots).toBeDefined();
        expect(data.screenshots.length).toBeGreaterThan(0);

        // Verify screenshot object structure
        const screenshot = data.screenshots[0];
        expect(screenshot.name).toBeDefined();
        expect(screenshot.url).toContain('/screenshots/');
        expect(screenshot.size).toBeGreaterThan(0);
    });

    test('screenshot images are served correctly', async ({ request }) => {
        // First get list of screenshots
        const listResponse = await request.get(`${RELAY_URL}/api/screenshots`);
        const data = await listResponse.json();

        if (data.screenshots.length > 0) {
            // Try to fetch the first screenshot
            const imgUrl = `${RELAY_URL}${data.screenshots[0].url}`;
            const imgResponse = await request.get(imgUrl);

            expect(imgResponse.status()).toBe(200);
            expect(imgResponse.headers()['content-type']).toContain('image');
        }
    });

    test('ClaimsAI app screenshots can be captured', async ({ page }) => {
        // Navigate to ClaimsAI
        await page.goto('http://localhost:3456');
        await page.waitForLoadState('networkidle');

        // Take login page screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_03_claimsai_login.png`,
            fullPage: true
        });

        // Login
        await page.fill('input[name="username"]', 'admin');
        await page.fill('input[name="password"]', 'admin123');
        await page.click('button[type="submit"]');

        // Wait for dashboard
        await page.waitForURL('**/dashboard**', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // Take dashboard screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_04_claimsai_dashboard.png`,
            fullPage: true
        });

        // Navigate to Claims History
        await page.click('a:has-text("Claims History")');
        await page.waitForTimeout(1000);

        // Take claims history screenshot
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_05_claimsai_claims.png`,
            fullPage: true
        });

        console.log('Screenshots captured successfully:');
        console.log('- f9bd28aa_03_claimsai_login.png');
        console.log('- f9bd28aa_04_claimsai_dashboard.png');
        console.log('- f9bd28aa_05_claimsai_claims.png');
    });
});
