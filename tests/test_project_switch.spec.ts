/**
 * Test that panel sizes stay consistent when switching projects
 */
import { test, expect } from '@playwright/test';

const RELAY_URL = 'http://localhost:7786';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test('panel sizes remain consistent when switching projects', async ({ page }) => {
    await page.goto(RELAY_URL);
    await page.waitForTimeout(500);

    // Take initial screenshot
    await page.screenshot({
        path: `${SCREENSHOT_DIR}/3ac5bb98_project_01_initial.png`,
        fullPage: true
    });

    // Get initial pane dimensions
    const initialDims = await page.evaluate(() => {
        const responsePane = document.querySelector('.response-pane') as HTMLElement;
        const inputPane = document.querySelector('.input-pane') as HTMLElement;
        return {
            response: {
                width: responsePane?.offsetWidth,
                height: responsePane?.offsetHeight,
                flex: window.getComputedStyle(responsePane).flex
            },
            input: {
                width: inputPane?.offsetWidth,
                height: inputPane?.offsetHeight,
                flex: window.getComputedStyle(inputPane).flex
            }
        };
    });
    console.log('Initial dimensions:', initialDims);

    // Check what projects are available
    const projects = await page.evaluate(() => {
        const select = document.getElementById('projectSelect') as HTMLSelectElement;
        return Array.from(select.options).map(o => o.value);
    });
    console.log('Available projects:', projects);

    // Select a project if available
    const testProject = projects.find(p => p && p !== '');
    if (testProject) {
        console.log('Selecting project:', testProject);

        // Select the project
        await page.selectOption('#projectSelect', testProject);
        await page.waitForTimeout(1000);

        // Take screenshot after selecting project
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/3ac5bb98_project_02_after_select.png`,
            fullPage: true
        });

        // Get dimensions after project change
        const afterDims = await page.evaluate(() => {
            const responsePane = document.querySelector('.response-pane') as HTMLElement;
            const inputPane = document.querySelector('.input-pane') as HTMLElement;
            return {
                response: {
                    width: responsePane?.offsetWidth,
                    height: responsePane?.offsetHeight,
                    flex: window.getComputedStyle(responsePane).flex
                },
                input: {
                    width: inputPane?.offsetWidth,
                    height: inputPane?.offsetHeight,
                    flex: window.getComputedStyle(inputPane).flex
                }
            };
        });
        console.log('After project change:', afterDims);

        // Check if dimensions changed significantly
        const responseDiff = Math.abs((afterDims.response.width || 0) - (initialDims.response.width || 0));
        const inputDiff = Math.abs((afterDims.input.width || 0) - (initialDims.input.width || 0));

        console.log('Response width diff:', responseDiff);
        console.log('Input width diff:', inputDiff);

        // Widths should be similar (within 50px tolerance)
        expect(responseDiff).toBeLessThan(50);
        expect(inputDiff).toBeLessThan(50);

        // Switch to another project or back to no project
        await page.selectOption('#projectSelect', '');
        await page.waitForTimeout(500);

        // Take screenshot after switching away
        await page.screenshot({
            path: `${SCREENSHOT_DIR}/3ac5bb98_project_03_no_project.png`,
            fullPage: true
        });
    } else {
        console.log('No projects available to test');
    }
});
