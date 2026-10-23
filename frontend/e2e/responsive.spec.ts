import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Responsive Design', () => {
  test.describe('Mobile Layout', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('mobile layout shows bottom nav', async ({ page }) => {
      await login(page);
      
      const bottomNav = page.locator('nav.md\\:hidden.fixed.bottom-0');
      await expect(bottomNav).toBeVisible();
    });

    test('sidebar hidden on mobile', async ({ page }) => {
      await login(page);
      
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeHidden();
    });

    test('login page responsive on mobile', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('h1')).toContainText('HRIS Philippines');
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  });

  test.describe('Desktop Layout', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('desktop layout shows sidebar', async ({ page }) => {
      await login(page);
      
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();
    });

    test('bottom nav hidden on desktop', async ({ page }) => {
      await login(page);
      
      const bottomNav = page.locator('nav.md\\:hidden.fixed.bottom-0');
      await expect(bottomNav).toBeHidden();
    });

    test('user name visible on desktop', async ({ page }) => {
      await login(page);
      
      const userName = page.locator('nav span.text-sm.hidden.sm\\:block');
      await expect(userName).toBeVisible();
    });
  });

  test.describe('Tablet Layout', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('tablet shows sidebar', async ({ page }) => {
      await login(page);
      
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();
    });

    test('dashboard grid adapts to tablet', async ({ page }) => {
      await login(page);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Total Employees')).toBeVisible();
    });
  });
});
