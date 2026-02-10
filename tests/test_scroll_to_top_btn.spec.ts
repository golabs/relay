import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Scroll to Top Button', () => {
    test('button appears when scrolled down and scrolls to top when clicked', async ({ page }) => {
        // Capture console messages
        page.on('console', msg => console.log('PAGE:', msg.text()));

        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Screenshot initial state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/scroll_btn_01_initial.png`,
            fullPage: true
        });

        // Verify button exists but is hidden
        const scrollBtn = page.locator('#scrollToTopBtn');
        await expect(scrollBtn).toHaveCount(1);

        const initialVisibility = await scrollBtn.evaluate(el =>
            window.getComputedStyle(el).visibility
        );
        expect(initialVisibility).toBe('hidden');
        console.log('Initial button visibility:', initialVisibility);

        // Add a lot of content to make the pane scrollable
        await page.evaluate(() => {
            const responseArea = document.getElementById('responseArea');
            let content = '';
            for (let i = 0; i < 50; i++) {
                content += `<div class="message-entry"><p>Message ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p></div>`;
            }
            responseArea!.innerHTML = content;
        });

        await page.waitForTimeout(200);

        // Screenshot with content
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/scroll_btn_02_with_content.png`,
            fullPage: true
        });

        // Scroll down - check which element is scrollable
        await page.evaluate(() => {
            const pane = document.getElementById('axionPaneContent');
            const responseArea = document.getElementById('responseArea');

            console.log('pane:', pane?.scrollHeight, pane?.clientHeight, 'scrollable:', (pane?.scrollHeight || 0) > (pane?.clientHeight || 0));
            console.log('responseArea:', responseArea?.scrollHeight, responseArea?.clientHeight, 'scrollable:', (responseArea?.scrollHeight || 0) > (responseArea?.clientHeight || 0));

            // Try scrolling the pane
            if (pane && pane.scrollHeight > pane.clientHeight) {
                pane.scrollTop = 500;
                console.log('Scrolled pane to:', pane.scrollTop);
            }

            // Also try scrolling responseArea
            if (responseArea && responseArea.scrollHeight > responseArea.clientHeight) {
                responseArea.scrollTop = 500;
                console.log('Scrolled responseArea to:', responseArea.scrollTop);
            }

            // Call update function
            if ((window as any).updateScrollToTopButton) {
                (window as any).updateScrollToTopButton();
            }
        });

        await page.waitForTimeout(300);

        // Screenshot scrolled down
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/scroll_btn_03_scrolled_down.png`,
            fullPage: true
        });

        // Verify button is now visible
        const afterScrollVisibility = await scrollBtn.evaluate(el =>
            window.getComputedStyle(el).visibility
        );
        expect(afterScrollVisibility).toBe('visible');
        console.log('After scroll visibility:', afterScrollVisibility);

        // Check button has visible class
        const hasVisibleClass = await scrollBtn.evaluate(el =>
            el.classList.contains('visible')
        );
        expect(hasVisibleClass).toBe(true);
        console.log('Has visible class:', hasVisibleClass);

        // Click the button
        await scrollBtn.click();
        await page.waitForTimeout(500);

        // Screenshot after clicking
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/scroll_btn_04_after_click.png`,
            fullPage: true
        });

        // Verify we scrolled to top
        const scrollTop = await page.evaluate(() => {
            const pane = document.getElementById('axionPaneContent');
            // Also dispatch scroll event to update button state
            pane?.dispatchEvent(new Event('scroll'));
            return pane!.scrollTop;
        });
        expect(scrollTop).toBeLessThan(50); // Allow small margin
        console.log('Scroll position after click:', scrollTop);

        // Button should be hidden again
        const finalVisibility = await scrollBtn.evaluate(el =>
            window.getComputedStyle(el).visibility
        );
        expect(finalVisibility).toBe('hidden');
        console.log('Final visibility:', finalVisibility);

        console.log('Scroll to top button test passed!');
    });
});
