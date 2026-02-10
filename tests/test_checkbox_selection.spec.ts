import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Checkbox Selection in Questions Modal', () => {
    test('can select multiple options with checkboxes', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Trigger showQuestionsModal with test questions
        await page.evaluate(() => {
            const questions = [
                {
                    id: 'features',
                    text: 'Which features do you want to enable?',
                    type: 'choice',
                    options: [
                        { key: 'a', text: 'Feature A - Authentication' },
                        { key: 'b', text: 'Feature B - Logging' },
                        { key: 'c', text: 'Feature C - Caching' },
                        { key: 'd', text: 'Feature D - Analytics' }
                    ]
                }
            ];
            (window as any).showQuestionsModal(questions, 'Preview text here');
        });

        await page.waitForTimeout(300);

        // Screenshot initial state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/cc1cb539_checkbox_01_initial.png`,
            fullPage: true
        });

        // Verify checkboxes exist (not radio buttons)
        const checkboxes = page.locator('input[type="checkbox"][name="features"]');
        const count = await checkboxes.count();
        expect(count).toBe(4);
        console.log(`Found ${count} checkboxes`);

        // Select multiple options - click directly on the checkboxes
        await page.locator('input[value="a"]').click();
        await page.waitForTimeout(100);
        await page.locator('input[value="b"]').click();
        await page.waitForTimeout(100);
        await page.locator('input[value="d"]').click();
        await page.waitForTimeout(200);

        // Screenshot after multi-selection
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/cc1cb539_checkbox_02_multiselect.png`,
            fullPage: true
        });

        // Verify all three are checked
        const isAChecked = await page.locator('input[value="a"]').isChecked();
        const isBChecked = await page.locator('input[value="b"]').isChecked();
        const isCChecked = await page.locator('input[value="c"]').isChecked();
        const isDChecked = await page.locator('input[value="d"]').isChecked();

        expect(isAChecked).toBe(true);
        expect(isBChecked).toBe(true);
        expect(isCChecked).toBe(false);
        expect(isDChecked).toBe(true);

        console.log('Checkbox states - A:', isAChecked, 'B:', isBChecked, 'C:', isCChecked, 'D:', isDChecked);

        // Verify selected classes
        const selectedCount = await page.locator('.question-option.selected').count();
        expect(selectedCount).toBe(3);
        console.log(`Selected options count: ${selectedCount}`);

        // Test unselecting - click B to uncheck it
        await page.locator('input[value="b"]').click();
        await page.waitForTimeout(200);

        // Screenshot after unselecting
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/cc1cb539_checkbox_03_unselect.png`,
            fullPage: true
        });

        const isBStillChecked = await page.locator('input[value="b"]').isChecked();
        expect(isBStillChecked).toBe(false);

        const selectedCountAfter = await page.locator('.question-option.selected').count();
        expect(selectedCountAfter).toBe(2);
        console.log(`Selected options after uncheck: ${selectedCountAfter}`);

        console.log('Checkbox multi-selection test passed!');
    });

    test('answers are combined with comma when multiple selected', async ({ page }) => {
        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Track API call data
        let capturedAnswers: any = null;

        // Mock the API call to capture what gets sent
        await page.route('**/api/chat/answers', async (route) => {
            const request = route.request();
            const postData = JSON.parse(request.postData() || '{}');
            console.log('Submitted answers:', JSON.stringify(postData, null, 2));
            capturedAnswers = postData.answers;

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'success' })
            });
        });

        // Set up required state for submit to work
        await page.evaluate(() => {
            (window as any).currentJobId = 'test-job-123';
            (window as any).pendingQuestions = [
                {
                    id: 'colors',
                    text: 'Which colors do you like?',
                    type: 'choice',
                    options: [
                        { key: 'red', text: 'Red' },
                        { key: 'blue', text: 'Blue' },
                        { key: 'green', text: 'Green' }
                    ]
                }
            ];
        });

        // Show questions modal
        await page.evaluate(() => {
            const questions = [
                {
                    id: 'colors',
                    text: 'Which colors do you like?',
                    type: 'choice',
                    options: [
                        { key: 'red', text: 'Red' },
                        { key: 'blue', text: 'Blue' },
                        { key: 'green', text: 'Green' }
                    ]
                }
            ];
            (window as any).showQuestionsModal(questions, '');
        });

        await page.waitForTimeout(300);

        // Select red and green (not blue)
        await page.locator('input[value="red"]').click();
        await page.locator('input[value="green"]').click();
        await page.waitForTimeout(200);

        // Screenshot before submit
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/cc1cb539_checkbox_04_presubmit.png`,
            fullPage: true
        });

        // Click submit - button text is "Send Answers"
        await page.click('text=Send Answers');
        await page.waitForTimeout(500);

        // Screenshot after submit
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/cc1cb539_checkbox_05_submitted.png`,
            fullPage: true
        });

        console.log('Captured answers:', capturedAnswers);

        // Should be "red, green" (comma-separated)
        expect(capturedAnswers?.colors).toBe('red, green');

        console.log('Answer combination test passed!');
    });
});
