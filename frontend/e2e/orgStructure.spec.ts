import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Org Structure', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('Departments', () => {
    test('departments page loads', async ({ page }) => {
      await page.goto(URLS.orgDepartments);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1')).toContainText('Departments');
      await expect(page.locator('text=Manage organizational departments')).toBeVisible();
    });

    test('departments table has correct columns', async ({ page }) => {
      await page.goto(URLS.orgDepartments);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('th:has-text("Name")')).toBeVisible();
      await expect(page.locator('th:has-text("Code")')).toBeVisible();
      await expect(page.locator('th:has-text("Actions")')).toBeVisible();
    });

    test('add department button opens form', async ({ page }) => {
      await page.goto(URLS.orgDepartments);
      await page.waitForLoadState('networkidle');
      const addBtn = page.locator('button:has-text("Add Department")');
      await expect(addBtn).toBeVisible();
      await addBtn.click();
      await expect(page.locator('h2:has-text("New Department")')).toBeVisible();
      await expect(page.locator('input').first()).toBeVisible();
    });

    test('department form has name, code, and parent fields', async ({ page }) => {
      await page.goto(URLS.orgDepartments);
      await page.waitForLoadState('networkidle');
      await page.click('button:has-text("Add Department")');
      await expect(page.locator('label:has-text("Name")')).toBeVisible();
      await expect(page.locator('label:has-text("Code")')).toBeVisible();
      await expect(page.locator('label:has-text("Parent Department")')).toBeVisible();
    });

    test('department form cancel closes form', async ({ page }) => {
      await page.goto(URLS.orgDepartments);
      await page.waitForLoadState('networkidle');
      await page.click('button:has-text("Add Department")');
      await page.click('button:has-text("Cancel")');
      await expect(page.locator('h2:has-text("New Department")')).not.toBeVisible();
    });
  });

  test.describe('Positions', () => {
    test('positions page loads', async ({ page }) => {
      await page.goto(URLS.orgPositions);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1')).toContainText('Positions');
      await expect(page.locator('text=Manage job positions')).toBeVisible();
    });

    test('positions table has correct columns', async ({ page }) => {
      await page.goto(URLS.orgPositions);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('th:has-text("Title")')).toBeVisible();
      await expect(page.locator('th:has-text("Actions")')).toBeVisible();
    });

    test('add position button opens form', async ({ page }) => {
      await page.goto(URLS.orgPositions);
      await page.waitForLoadState('networkidle');
      const addBtn = page.locator('button:has-text("Add Position")');
      await expect(addBtn).toBeVisible();
      await addBtn.click();
      await expect(page.locator('h2:has-text("New Position")')).toBeVisible();
    });

    test('position form has all fields', async ({ page }) => {
      await page.goto(URLS.orgPositions);
      await page.waitForLoadState('networkidle');
      await page.click('button:has-text("Add Position")');
      await expect(page.locator('label:has-text("Title")')).toBeVisible();
      await expect(page.locator('label:has-text("Department")')).toBeVisible();
      await expect(page.locator('label:has-text("Job Grade")')).toBeVisible();
      await expect(page.locator('label:has-text("Min Salary")')).toBeVisible();
      await expect(page.locator('label:has-text("Max Salary")')).toBeVisible();
    });
  });
});
