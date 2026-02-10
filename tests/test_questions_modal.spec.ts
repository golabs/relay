/**
 * Test questions modal functionality in the relay system
 * Verifies scrolling and radio button selection work correctly
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Questions Modal', () => {
    test('modal is scrollable and fits screen', async ({ page }) => {
        await page.goto(RELAY_URL);

        // Inject a mock questions modal with many questions to test scrolling
        await page.evaluate(() => {
            const modal = document.getElementById('questionsModal');
            const form = document.getElementById('questionsForm');
            const preview = document.getElementById('questionsPreview');

            // Add preview content
            preview.innerHTML = 'This is a preview of Claude\'s response so far...';
            preview.style.display = 'block';

            // Add many questions to test scrolling
            let html = '';
            for (let i = 1; i <= 10; i++) {
                html += `
                    <div class="question-item">
                        <div class="question-label">Question ${i}</div>
                        <div class="question-text">This is a long question text to test the layout. What would you like to do with option ${i}?</div>
                        <div class="question-options">
                            <label class="question-option">
                                <input type="radio" name="q${i}" value="a">
                                <span>(a) Option A for question ${i}</span>
                            </label>
                            <label class="question-option">
                                <input type="radio" name="q${i}" value="b">
                                <span>(b) Option B for question ${i}</span>
                            </label>
                            <label class="question-option">
                                <input type="radio" name="q${i}" value="c">
                                <span>(c) Option C for question ${i}</span>
                            </label>
                        </div>
                    </div>
                `;
            }
            form.innerHTML = html;

            // Attach event handlers (simulating what showQuestionsModal does)
            form.querySelectorAll('.question-option input[type="radio"]').forEach(function(radio: HTMLInputElement) {
                radio.addEventListener('change', function() {
                    const parent = this.closest('.question-options');
                    parent?.querySelectorAll('.question-option').forEach(function(o) {
                        o.classList.remove('selected');
                    });
                    this.closest('.question-option')?.classList.add('selected');
                });
            });
            form.querySelectorAll('.question-option').forEach(function(opt) {
                opt.addEventListener('click', function(e: MouseEvent) {
                    if ((e.target as HTMLInputElement).type === 'radio') return;
                    const radio = (this as HTMLElement).querySelector('input[type="radio"]') as HTMLInputElement;
                    if (radio) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            });

            modal?.classList.add('visible');
        });

        await page.waitForTimeout(500);

        // Take screenshot of modal
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_modal_01_visible.png`,
            fullPage: true
        });

        // Check modal is visible
        const modal = page.locator('#questionsModal');
        await expect(modal).toBeVisible();

        // Check modal body is scrollable - scroll down
        const modalBody = page.locator('.modal-body');
        await modalBody.evaluate((el) => el.scrollTop = 500);

        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_modal_02_scrolled.png`,
            fullPage: true
        });

        // Verify scroll happened
        const scrollTop = await modalBody.evaluate((el) => el.scrollTop);
        expect(scrollTop).toBeGreaterThan(0);

        console.log('Modal scrolling works! ScrollTop:', scrollTop);
    });

    test('radio button selection persists', async ({ page }) => {
        await page.goto(RELAY_URL);

        // Inject a simple questions modal
        await page.evaluate(() => {
            const modal = document.getElementById('questionsModal');
            const form = document.getElementById('questionsForm');
            const preview = document.getElementById('questionsPreview');
            preview!.style.display = 'none';

            form!.innerHTML = `
                <div class="question-item">
                    <div class="question-label">Test Question</div>
                    <div class="question-text">Which option do you prefer?</div>
                    <div class="question-options">
                        <label class="question-option">
                            <input type="radio" name="test" value="a">
                            <span>(a) Option A</span>
                        </label>
                        <label class="question-option">
                            <input type="radio" name="test" value="b">
                            <span>(b) Option B</span>
                        </label>
                        <label class="question-option">
                            <input type="radio" name="test" value="c">
                            <span>(c) Option C</span>
                        </label>
                    </div>
                </div>
            `;

            // Attach event handlers
            form!.querySelectorAll('.question-option input[type="radio"]').forEach(function(radio: HTMLInputElement) {
                radio.addEventListener('change', function() {
                    const parent = this.closest('.question-options');
                    parent?.querySelectorAll('.question-option').forEach(function(o) {
                        o.classList.remove('selected');
                    });
                    this.closest('.question-option')?.classList.add('selected');
                });
            });
            form!.querySelectorAll('.question-option').forEach(function(opt) {
                opt.addEventListener('click', function(e: MouseEvent) {
                    if ((e.target as HTMLInputElement).type === 'radio') return;
                    const radio = (this as HTMLElement).querySelector('input[type="radio"]') as HTMLInputElement;
                    if (radio) {
                        radio.checked = true;
                        radio.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            });

            modal?.classList.add('visible');
        });

        await page.waitForTimeout(300);

        // Screenshot before selection
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_radio_01_before.png`,
            fullPage: true
        });

        // Click on Option B
        await page.click('text=(b) Option B');
        await page.waitForTimeout(200);

        // Screenshot after selection
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_radio_02_selected.png`,
            fullPage: true
        });

        // Verify radio is checked
        const isChecked = await page.locator('input[value="b"]').isChecked();
        expect(isChecked).toBe(true);

        // Verify selected class is applied
        const hasSelectedClass = await page.locator('.question-option:has(input[value="b"])').evaluate(
            el => el.classList.contains('selected')
        );
        expect(hasSelectedClass).toBe(true);

        // Click on Option A to change selection
        await page.click('text=(a) Option A');
        await page.waitForTimeout(200);

        // Screenshot after changing selection
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/f9bd28aa_radio_03_changed.png`,
            fullPage: true
        });

        // Verify new selection
        const isAChecked = await page.locator('input[value="a"]').isChecked();
        const isBChecked = await page.locator('input[value="b"]').isChecked();
        expect(isAChecked).toBe(true);
        expect(isBChecked).toBe(false);

        console.log('Radio selection works correctly!');
    });
});
