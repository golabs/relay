import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Message Queue', () => {
    test('multiple messages can be queued and displayed', async ({ page }) => {
        page.on('console', msg => console.log('PAGE:', msg.text()));

        await page.goto(RELAY_URL);
        await page.waitForLoadState('networkidle');

        // Screenshot initial state
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/queue_01_initial.png`,
            fullPage: true
        });

        // Simulate having a job already running
        await page.evaluate(() => {
            (window as any).currentJobId = 'test-job-123';
            (window as any).pendingUserMessage = 'First message being processed';
        });

        // Render the queue panel to show the processing message
        await page.evaluate(() => {
            (window as any).renderQueuePanel();
        });

        await page.waitForTimeout(200);

        // Screenshot with processing job
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/queue_02_processing.png`,
            fullPage: true
        });

        // Check queue panel is visible
        const queuePanel = page.locator('#queuePanel');
        const isVisible = await queuePanel.evaluate(el => el.classList.contains('visible'));
        console.log('Queue panel visible after setting currentJobId:', isVisible);
        expect(isVisible).toBe(true);

        // Add messages to the queue directly
        await page.evaluate(() => {
            (window as any).addToQueue('Second message in queue', [], [], 'relay');
        });
        await page.waitForTimeout(200);

        // Screenshot after first queue addition
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/queue_03_one_queued.png`,
            fullPage: true
        });

        // Check the queue count
        let queueCount = await page.locator('#queueCount').textContent();
        console.log('Queue count after 1st add:', queueCount);
        expect(queueCount).toContain('1');

        // Add another message
        await page.evaluate(() => {
            (window as any).addToQueue('Third message in queue', [], [], 'relay');
        });
        await page.waitForTimeout(200);

        // Screenshot after second queue addition
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/queue_04_two_queued.png`,
            fullPage: true
        });

        queueCount = await page.locator('#queueCount').textContent();
        console.log('Queue count after 2nd add:', queueCount);
        expect(queueCount).toContain('2');

        // Add a third message
        await page.evaluate(() => {
            (window as any).addToQueue('Fourth message in queue', [], [], 'relay');
        });
        await page.waitForTimeout(200);

        // Screenshot after third queue addition
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/queue_05_three_queued.png`,
            fullPage: true
        });

        queueCount = await page.locator('#queueCount').textContent();
        console.log('Queue count after 3rd add:', queueCount);
        expect(queueCount).toContain('3');

        // Verify queue items are displayed in the list
        const queueItems = page.locator('.queue-item');
        const itemCount = await queueItems.count();
        console.log('Total queue items displayed:', itemCount);
        // Should be 4: 1 processing + 3 queued
        expect(itemCount).toBe(4);

        // Verify the text content of queued items
        const queueList = await page.locator('#queueList').innerHTML();
        console.log('Queue list HTML:', queueList.substring(0, 500));

        // Processing item shows "Processing..." since pendingUserMessage was set after currentJobId
        expect(queueList).toContain('Processing');
        expect(queueList).toContain('Second message');
        expect(queueList).toContain('Third message');
        expect(queueList).toContain('Fourth message');

        console.log('Queue test passed!');
    });
});
