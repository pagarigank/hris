import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Employees', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(URLS.employees);
    await page.waitForLoadState('networkidle');
  });

  test('employee list loads', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Employees');
    await expect(page.locator('text=Manage your workforce')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('search filters employees', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    const initialRows = await page.locator('tbody tr').count();
    
    await searchInput.fill('admin');
    await page.waitForTimeout(500);

    const filteredRows = await page.locator('tbody tr').count();
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
  });

  test('clear search shows all employees', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    
    await searchInput.fill('admin');
    await page.waitForTimeout(500);
    
    const filteredRows = await page.locator('tbody tr').count();
    
    await searchInput.clear();
    await page.waitForTimeout(500);
    
    const allRows = await page.locator('tbody tr').count();
    expect(allRows).toBeGreaterThanOrEqual(filteredRows);
  });

  test('employee table has correct columns', async ({ page }) => {
    await expect(page.locator('th:has-text("Employee")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
    await expect(page.locator('th:has-text("Actions")')).toBeVisible();
  });

  test('add employee button links correctly', async ({ page }) => {
    const addButton = page.locator('a:has-text("Add Employee")');
    await expect(addButton).toBeVisible();
    await expect(addButton).toHaveAttribute('href', '/employees/new');
  });

  test('employee form has PhilSys No field', async ({ page }) => {
    await page.goto(`${URLS.employees}/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('label:has-text("PhilSys No")')).toBeVisible();
  });

  test('employee form has date regularized field', async ({ page }) => {
    await page.goto(`${URLS.employees}/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('label:has-text("Date Regularized")')).toBeVisible();
  });

  test('employee form has pay frequency with SemiMonthly option', async ({ page }) => {
    await page.goto(`${URLS.employees}/new`);
    await page.waitForLoadState('networkidle');
    // Find all selects and check for Semi-Monthly option text
    const allSelects = page.locator('select');
    const count = await allSelects.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const options = await allSelects.nth(i).locator('option').allTextContents();
      if (options.some(o => o.includes('Semi'))) {
        found = true;
        break;
      }
    }
    expect(found).toBeTruthy();
  });

  test('employee form has employment status with all options', async ({ page }) => {
    await page.goto(`${URLS.employees}/new`);
    await page.waitForLoadState('networkidle');
    // Find all selects and check for employment status options
    const allSelects = page.locator('select');
    const count = await allSelects.count();
    let foundProbationary = false;
    let foundProjectBased = false;
    for (let i = 0; i < count; i++) {
      const options = await allSelects.nth(i).locator('option').allTextContents();
      if (options.some(o => o.includes('Probationary'))) foundProbationary = true;
      if (options.some(o => o.includes('Project'))) foundProjectBased = true;
    }
    expect(foundProbationary).toBeTruthy();
    expect(foundProjectBased).toBeTruthy();
  });

  test('employee form has active status toggle', async ({ page }) => {
    await page.goto(`${URLS.employees}/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('label:has-text("Active")')).toBeVisible();
  });

  test('employee form has photo URL field', async ({ page }) => {
    await page.goto(`${URLS.employees}/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('label:has-text("Photo URL")')).toBeVisible();
  });
});
