import { test, expect } from '@playwright/test';
import { login, logout, TEST_CREDENTIALS, URLS } from './helpers/auth';

test.describe('Authentication', () => {
  test.describe('Login', () => {
    test('login page renders correctly', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('HRIS Philippines');
      await expect(page.locator('text=Sign in to your account')).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('successful login redirects to dashboard', async ({ page }) => {
      await login(page);
      await expect(page).toHaveURL(URLS.dashboard);
      await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    });

    test('invalid credentials shows error', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');

      await page.fill('input[type="email"]', 'wrong@email.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');

      await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 10000 });
    });

    test('empty form submission shows validation', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');

      await expect(emailInput).toHaveAttribute('required', '');
      await expect(passwordInput).toHaveAttribute('required', '');
    });

    test('login button shows loading state', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');

      await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
      await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
      await page.click('button[type="submit"]');

      await expect(page.locator('button[type="submit"]')).toBeDisabled();
    });
  });

  test.describe('Logout', () => {
    test('logout clears session and redirects to login', async ({ page }) => {
      await login(page);
      await expect(page).toHaveURL(URLS.dashboard);

      await logout(page);
      await expect(page).toHaveURL(URLS.login);
    });
  });

  test.describe('Protected Routes', () => {
    test('unauthenticated access redirects to login', async ({ page }) => {
      // Clear auth state to simulate unauthenticated user
      await page.goto(URLS.dashboard);
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });
      await page.goto(URLS.dashboard);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(URLS.login);
    });

    test('refresh token maintains session', async ({ page }) => {
      await login(page);
      await expect(page).toHaveURL(URLS.dashboard);

      await page.reload();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(URLS.dashboard);
    });
  });
});
