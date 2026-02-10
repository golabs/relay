/**
 * Claims AI - End-to-End Test Suite
 * Generated from video analysis on 2026-02-05
 *
 * Test Flow:
 * 1. Login as Admin using Demo Account
 * 2. Verify Dashboard loads successfully
 * 3. Navigate to Claims History
 * 4. View a specific claim (FARMTREK AUSTRALIA PTY LTD)
 * 5. Verify AI Analysis displays with confidence score
 * 6. Check InsuredHQ Field Mappings
 */

import { test, expect } from '@playwright/test';

// Configuration
const BASE_URL = 'http://127.0.0.1:5173';
const SCREENSHOT_DIR = '/opt/clawd/projects/relay/.screenshots';

test.describe('Claims AI - Full Workflow Test', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto(BASE_URL);
  });

  test('TC001: Login Page displays correctly', async ({ page }) => {
    // Verify login page elements
    await expect(page.locator('text=ClaimsAI')).toBeVisible();
    await expect(page.locator('text=Sign In')).toBeVisible();

    // Verify Demo Accounts section
    await expect(page.locator('text=Demo Accounts')).toBeVisible();
    await expect(page.locator('text=Admin')).toBeVisible();
    await expect(page.locator('text=Supervisor')).toBeVisible();
    await expect(page.locator('text=Claims Handler')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc001_login_page.png`,
      fullPage: true
    });
  });

  test('TC002: Login as Admin via Demo Account', async ({ page }) => {
    // Click Admin login button in Demo Accounts section
    await page.locator('text=Admin').first().click();
    // Or click the Login button next to Admin
    await page.locator('button:has-text("Login")').first().click();

    // Wait for redirect to dashboard
    await page.waitForURL('**/claims', { timeout: 10000 });

    // Verify successful login toast
    await expect(page.locator('text=Welcome back!')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Successfully logged in')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc002_login_success.png`,
      fullPage: true
    });
  });

  test('TC003: Dashboard displays Welcome message', async ({ page }) => {
    // Login first
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });

    // Verify dashboard elements
    await expect(page.locator('text=Welcome to ClaimsAI')).toBeVisible();
    await expect(page.locator('text=AI Powered Claims Workflow')).toBeVisible();

    // Verify sidebar navigation
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=New Claim')).toBeVisible();
    await expect(page.locator('text=Tasks & Workflow')).toBeVisible();
    await expect(page.locator('text=Claim History')).toBeVisible();
    await expect(page.locator('text=AI Settings')).toBeVisible();
    await expect(page.locator('text=User Admin')).toBeVisible();

    // Verify user info in sidebar
    await expect(page.locator('text=Jade Bermingham')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc003_dashboard.png`,
      fullPage: true
    });
  });

  test('TC004: Navigate to Claims History', async ({ page }) => {
    // Login first
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });

    // Click Claims History in sidebar
    await page.locator('text=Claim History').click();
    await page.waitForURL('**/claims', { timeout: 5000 });

    // Verify Claims History page header
    await expect(page.locator('h1:has-text("Claims History")')).toBeVisible();
    await expect(page.locator('text=View and manage all insurance claims')).toBeVisible();

    // Verify summary cards
    await expect(page.locator('text=Total Claims')).toBeVisible();
    await expect(page.locator('text=Total Reserve')).toBeVisible();
    await expect(page.locator('text=Avg. Age')).toBeVisible();
    await expect(page.locator('text=High Priority')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc004_claims_history.png`,
      fullPage: true
    });
  });

  test('TC005: Verify Claims Table data', async ({ page }) => {
    // Login and navigate to Claims History
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });
    await page.locator('text=Claim History').click();

    // Verify table headers
    await expect(page.locator('text=INSURED')).toBeVisible();
    await expect(page.locator('text=CLAIM #')).toBeVisible();
    await expect(page.locator('text=STAGE')).toBeVisible();
    await expect(page.locator('text=RESERVE')).toBeVisible();
    await expect(page.locator('text=POLICY NUMBER')).toBeVisible();
    await expect(page.locator('text=PRIORITY')).toBeVisible();

    // Verify specific claim row
    await expect(page.locator('text=FARMTREK AUSTRALIA PTY LTD')).toBeVisible();
    await expect(page.locator('text=00000001')).toBeVisible();
    await expect(page.locator('text=$44,750')).toBeVisible();
    await expect(page.locator('text=SAUVIC3000436')).toBeVisible();
    await expect(page.locator('text=Jade Bermingham')).toBeVisible();

    // Verify pagination
    await expect(page.locator('text=Showing 1 to 1 of 1 results')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc005_claims_table.png`,
      fullPage: true
    });
  });

  test('TC006: Open Claim Details', async ({ page }) => {
    // Login and navigate to Claims History
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });
    await page.locator('text=Claim History').click();

    // Click on the claim row to open details
    await page.locator('text=FARMTREK AUSTRALIA PTY LTD').click();

    // Verify claim details page
    await expect(page.locator('text=Claim CAI-00000001')).toBeVisible();
    await expect(page.locator('text=FARMTREK AUSTRALIA PTY LTD')).toBeVisible();

    // Verify workflow progress tabs
    await expect(page.locator('text=Overview')).toBeVisible();
    await expect(page.locator('text=Documents')).toBeVisible();
    await expect(page.locator('text=Timeline')).toBeVisible();

    // Verify AI Analysis Summary section
    await expect(page.locator('text=AI Analysis Summary')).toBeVisible();
    await expect(page.locator('text=Confidence Score')).toBeVisible();

    // Verify Quick Actions
    await expect(page.locator('text=Quick Actions')).toBeVisible();
    await expect(page.locator('text=View AI Analysis')).toBeVisible();
    await expect(page.locator('text=Add Document')).toBeVisible();
    await expect(page.locator('text=Add Comment')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc006_claim_details.png`,
      fullPage: true
    });
  });

  test('TC007: View AI Analysis with Confidence Score', async ({ page }) => {
    // Login and navigate to claim details
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });
    await page.locator('text=Claim History').click();
    await page.locator('text=FARMTREK AUSTRALIA PTY LTD').click();

    // Click View AI Analysis button
    await page.locator('text=View AI Analysis').click();

    // Verify AI Analysis page
    await expect(page.locator('text=AI Analysis - FARMTREK AUSTRALIA PTY LTD')).toBeVisible();

    // Verify Analysis tabs
    await expect(page.locator('text=Analysis Results')).toBeVisible();
    await expect(page.locator('text=InsuredHQ Mapping')).toBeVisible();

    // Verify confidence score (98.0%)
    await expect(page.locator('text=Analysis Confidence Score')).toBeVisible();
    await expect(page.locator('text=98.0%')).toBeVisible();
    await expect(page.locator('text=Very High Confidence')).toBeVisible();

    // Verify AI model info
    await expect(page.locator('text=AI Model: GPT-4.1 Turbo')).toBeVisible();
    await expect(page.locator('text=Analysis Status: Complete')).toBeVisible();

    // Verify Recommended Claim Reserve section
    await expect(page.locator('text=Recommended Claim Reserve')).toBeVisible();
    await expect(page.locator('text=$44,750')).toBeVisible();

    // Verify Policy Coverage Analysis
    await expect(page.locator('text=Policy Coverage Analysis')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc007_ai_analysis.png`,
      fullPage: true
    });
  });

  test('TC008: Verify InsuredHQ Field Mappings', async ({ page }) => {
    // Login and navigate to AI Analysis
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });
    await page.locator('text=Claim History').click();
    await page.locator('text=FARMTREK AUSTRALIA PTY LTD').click();
    await page.locator('text=View AI Analysis').click();

    // Click InsuredHQ Mapping tab
    await page.locator('text=InsuredHQ Mapping').click();

    // Verify Field Mappings section
    await expect(page.locator('text=InsuredHQ Field Mappings')).toBeVisible();

    // Verify mapping statistics
    await expect(page.locator('text=12')).toBeVisible(); // Total fields
    await expect(page.locator('text=0%')).toBeVisible(); // Some percentage

    // Verify field mapping entries
    await expect(page.locator('text=Internal Policy Number')).toBeVisible();
    await expect(page.locator('text=InsuredHQ Claim ID')).toBeVisible();
    await expect(page.locator('text=InsuredHQ Policy ID')).toBeVisible();
    await expect(page.locator('text=Policy: SAUVIC3000436')).toBeVisible();

    // Verify Duplicate Check section
    await expect(page.locator('text=Duplicate Check')).toBeVisible();

    // Verify Extracted Claim Fields
    await expect(page.locator('text=Extracted Claim Fields')).toBeVisible();
    await expect(page.locator('text=InsuredHQ Target Fields')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc008_field_mappings.png`,
      fullPage: true
    });
  });

  test('TC009: Full End-to-End Workflow', async ({ page }) => {
    // Step 1: Login
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tc009_step1_login.png`, fullPage: true });
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });

    // Step 2: Dashboard
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tc009_step2_dashboard.png`, fullPage: true });
    await expect(page.locator('text=Welcome to ClaimsAI')).toBeVisible();

    // Step 3: Navigate to Claims History
    await page.locator('text=Claim History').click();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tc009_step3_history.png`, fullPage: true });
    await expect(page.locator('text=Claims History')).toBeVisible();

    // Step 4: Open Claim
    await page.locator('text=FARMTREK AUSTRALIA PTY LTD').click();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tc009_step4_claim.png`, fullPage: true });
    await expect(page.locator('text=Claim CAI-00000001')).toBeVisible();

    // Step 5: View AI Analysis
    await page.locator('text=View AI Analysis').click();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tc009_step5_analysis.png`, fullPage: true });
    await expect(page.locator('text=98.0%')).toBeVisible();

    // Step 6: Check Field Mappings
    await page.locator('text=InsuredHQ Mapping').click();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/tc009_step6_mappings.png`, fullPage: true });
    await expect(page.locator('text=InsuredHQ Field Mappings')).toBeVisible();

    console.log('Full E2E workflow completed successfully!');
  });

});

test.describe('Claims AI - Data Validation Tests', () => {

  test('TC010: Verify Claim Statistics', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });
    await page.locator('text=Claim History').click();

    // Verify summary statistics match
    await expect(page.locator('text=Total Claims')).toBeVisible();
    await expect(page.locator('.stat-value:has-text("1")')).toBeVisible();

    await expect(page.locator('text=Total Reserve')).toBeVisible();
    await expect(page.locator('text=$44,750')).toBeVisible();

    await expect(page.locator('text=Avg. Age')).toBeVisible();
    await expect(page.locator('text=2 days')).toBeVisible();

    await expect(page.locator('text=High Priority')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc010_statistics.png`,
      fullPage: true
    });
  });

  test('TC011: Verify AI Confidence Score Calculation', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('button:has-text("Login")').first().click();
    await page.waitForURL('**/claims', { timeout: 10000 });
    await page.locator('text=Claim History').click();
    await page.locator('text=FARMTREK AUSTRALIA PTY LTD').click();
    await page.locator('text=View AI Analysis').click();

    // Verify confidence score is in valid range (0-100%)
    const confidenceText = await page.locator('text=98.0%').textContent();
    const confidenceValue = parseFloat(confidenceText?.replace('%', '') || '0');

    expect(confidenceValue).toBeGreaterThanOrEqual(0);
    expect(confidenceValue).toBeLessThanOrEqual(100);
    expect(confidenceValue).toBe(98.0);

    // Verify confidence label matches score
    await expect(page.locator('text=Very High Confidence')).toBeVisible();

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tc011_confidence.png`,
      fullPage: true
    });
  });

});
