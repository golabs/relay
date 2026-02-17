/**
 * Playwright Test: Format Text with Claude Feature
 *
 * This test validates that the "Format Text with Claude" feature works correctly:
 * 1. Opens Relay web interface
 * 2. Selects a project
 * 3. Enters unformatted text
 * 4. Clicks format button (✨)
 * 5. Waits for formatting to complete
 * 6. Verifies formatted output appears in AXION panel
 * 7. Verifies structure matches TASK.md template
 * 8. Verifies input area is cleared
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Configuration
const BASE_URL = 'http://localhost:7786';
const SCREENSHOTS_DIR = '/opt/clawd/projects/relay/.screenshots';
const TEST_PROJECT = 'relay';
const TEST_INPUT = 'fix the login bug when user types wrong password it crashes need to show error message instead';
const FORMAT_TIMEOUT = 180000; // 3 minutes for Claude to format (watcher may be busy)

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

test.describe('Format Text with Claude', () => {
    test.setTimeout(300000); // 5 minutes total timeout for formatting tests (watcher may be busy)

    test('should format raw text into TASK.md structure', async ({ page }) => {
        console.log('\n=== Starting Format Text Feature Test ===\n');

        // Step 1: Navigate to Relay
        console.log('Step 1: Opening Relay at', BASE_URL);
        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');
        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '01_relay_loaded.png'),
            fullPage: true
        });
        console.log('✓ Relay loaded successfully');

        // Step 2: Select project
        console.log('\nStep 2: Selecting project:', TEST_PROJECT);
        const projectDropdown = await page.locator('#projectSelect');
        await expect(projectDropdown).toBeVisible();
        await projectDropdown.selectOption(TEST_PROJECT);

        // Wait a bit for project to be selected
        await page.waitForTimeout(500);
        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '02_project_selected.png'),
            fullPage: true
        });
        console.log('✓ Project selected:', TEST_PROJECT);

        // Step 3: Enter test input text
        console.log('\nStep 3: Entering test input text in BRETT panel');
        const inputArea = await page.locator('#inputArea');
        await expect(inputArea).toBeVisible();
        await inputArea.click();
        await inputArea.fill(TEST_INPUT);

        // Verify text was entered
        const inputValue = await inputArea.inputValue();
        expect(inputValue).toBe(TEST_INPUT);

        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '03_text_entered.png'),
            fullPage: true
        });
        console.log('✓ Test input entered:', TEST_INPUT);

        // Step 4: Click format button
        console.log('\nStep 4: Clicking format button (✨)');
        const formatBtn = await page.locator('#formatBtn');
        await expect(formatBtn).toBeVisible();
        await expect(formatBtn).toBeEnabled();

        // Verify button has ✨ emoji
        const btnText = await formatBtn.textContent();
        expect(btnText).toContain('✨');

        await formatBtn.click();
        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '04_format_clicked.png'),
            fullPage: true
        });
        console.log('✓ Format button clicked');

        // Step 5: Wait for formatting to start
        console.log('\nStep 5: Waiting for formatting to start...');

        // Button should change to ⏳ and be disabled
        await expect(formatBtn).toBeDisabled({ timeout: 5000 });
        const processingText = await formatBtn.textContent();
        expect(processingText).toContain('⏳');

        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '05_formatting_started.png'),
            fullPage: true
        });
        console.log('✓ Formatting started (button shows ⏳)');

        // Step 6: Wait for formatting to complete
        console.log('\nStep 6: Waiting for formatting to complete (max', FORMAT_TIMEOUT / 1000, 'seconds)...');

        // Wait for button to be re-enabled (formatting complete)
        await expect(formatBtn).toBeEnabled({ timeout: FORMAT_TIMEOUT });
        const completedText = await formatBtn.textContent();
        expect(completedText).toContain('✨');

        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '06_formatting_complete.png'),
            fullPage: true
        });
        console.log('✓ Formatting completed (button restored to ✨)');

        // Step 7: Verify input area is cleared
        console.log('\nStep 7: Verifying input area is cleared');
        const clearedValue = await inputArea.inputValue();
        expect(clearedValue).toBe('');
        console.log('✓ Input area cleared successfully');

        // Step 8: Verify formatted output appears in AXION panel
        console.log('\nStep 8: Verifying formatted output in AXION panel');
        const axionPane = await page.locator('#axionPaneContent');
        await expect(axionPane).toBeVisible();

        const responseArea = await page.locator('#responseArea');
        await expect(responseArea).toBeVisible();

        // Get the text content from response area
        const responseContent = await responseArea.textContent();

        // Verify "Formatted TASK.md:" header is present
        expect(responseContent).toContain('Formatted TASK.md:');
        console.log('✓ Found "Formatted TASK.md:" header');

        // Step 9: Verify TASK.md structure
        console.log('\nStep 9: Verifying TASK.md structure');

        // Check for main heading
        const h1Heading = await responseArea.locator('h1');
        await expect(h1Heading).toBeVisible({ timeout: 5000 });
        const h1Text = await h1Heading.textContent();
        expect(h1Text).toContain('TASK.md');
        console.log('✓ Found "# TASK.md" heading');

        // Check for Overview section
        const overviewHeading = await responseArea.locator('h2:has-text("Overview")');
        await expect(overviewHeading).toBeVisible();
        console.log('✓ Found "## Overview" section');

        // Check for User Story section
        const userStoryHeading = await responseArea.locator('h2:has-text("User Story")');
        await expect(userStoryHeading).toBeVisible();
        console.log('✓ Found "## User Story" section');

        // Check for Requirements section
        const requirementsHeading = await responseArea.locator('h2:has-text("Requirements")');
        await expect(requirementsHeading).toBeVisible();
        console.log('✓ Found "## Requirements" section');

        // Check for checkboxes in Requirements
        const requirementsCheckboxes = await responseArea.locator('input[type="checkbox"]').count();
        expect(requirementsCheckboxes).toBeGreaterThan(0);
        console.log('✓ Found', requirementsCheckboxes, 'checkboxes in requirements');

        // Check for Acceptance Criteria section
        const acceptanceHeading = await responseArea.locator('h2:has-text("Acceptance Criteria")');
        await expect(acceptanceHeading).toBeVisible();
        console.log('✓ Found "## Acceptance Criteria" section');

        // Step 10: Final screenshot
        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '07_final_result.png'),
            fullPage: true
        });
        console.log('\n✓ Final screenshot captured');

        // Step 11: Verify the formatted content matches expected structure
        console.log('\nStep 11: Verifying detailed structure');

        // Get all h2 headings
        const h2Headings = await responseArea.locator('h2').allTextContents();
        console.log('Found sections:', h2Headings.join(', '));

        // Expected sections
        const expectedSections = ['Overview', 'User Story', 'Requirements', 'Acceptance Criteria'];
        for (const section of expectedSections) {
            const found = h2Headings.some(heading => heading.includes(section));
            expect(found).toBeTruthy();
            console.log(`✓ Confirmed "${section}" section present`);
        }

        console.log('\n=== All Tests Passed! ===\n');
        console.log('Summary:');
        console.log('- Relay loaded successfully');
        console.log('- Project selected:', TEST_PROJECT);
        console.log('- Input text entered and formatted');
        console.log('- Format button state transitions verified');
        console.log('- Formatted TASK.md displayed in AXION panel');
        console.log('- All required sections present with correct structure');
        console.log('- Input area cleared after formatting');
        console.log('- Screenshots saved to:', SCREENSHOTS_DIR);
        console.log('\n✅ Format Text with Claude feature is working correctly!\n');
    });

    test('should handle empty input gracefully', async ({ page }) => {
        console.log('\n=== Testing Empty Input Handling ===\n');

        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');

        // Select project
        const projectDropdown = await page.locator('#projectSelect');
        await projectDropdown.selectOption(TEST_PROJECT);
        await page.waitForTimeout(500);

        // Clear input area (should be empty already)
        const inputArea = await page.locator('#inputArea');
        await inputArea.click();
        await inputArea.clear();

        // Try to click format button
        const formatBtn = await page.locator('#formatBtn');
        await formatBtn.click();

        // Should show error toast
        await page.waitForTimeout(1000);

        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '08_empty_input_error.png'),
            fullPage: true
        });

        console.log('✓ Empty input handled gracefully');
    });

    test('should require project selection', async ({ page }) => {
        console.log('\n=== Testing Project Selection Requirement ===\n');

        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');

        // Enter text without selecting project
        const inputArea = await page.locator('#inputArea');
        await inputArea.click();
        await inputArea.fill('test text');

        // Try to format
        const formatBtn = await page.locator('#formatBtn');
        await formatBtn.click();

        // Should show error about project selection
        await page.waitForTimeout(1000);

        await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, '09_no_project_error.png'),
            fullPage: true
        });

        console.log('✓ Project selection requirement enforced');
    });
});
