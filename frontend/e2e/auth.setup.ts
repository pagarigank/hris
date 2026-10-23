import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  // Wait for the React app to hydrate and the login form to stabilize
  // The AuthContext makes an /auth/me call on mount, causing re-renders
  // Wait for the submit button to be stable (form is fully rendered)
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.waitFor({ state: 'visible', timeout: 15000 });

  // Additional wait: ensure the form is not in a loading/re-rendering state
  // by checking the email input is stable
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });

  // Small delay to let React finish any pending state updates
  await page.waitForTimeout(1000);

  // Fill the form
  await emailInput.fill('admin@system.com');
  await page.fill('input[type="password"]', 'Admin123!');

  // Tenant code should already be "SYSTEM" by default
  const tenantInput = page.locator('input[placeholder="SYSTEM"]');
  if (await tenantInput.isVisible()) {
    const val = await tenantInput.inputValue();
    if (val !== 'SYSTEM') {
      await tenantInput.clear();
      await tenantInput.fill('SYSTEM');
    }
  }

  // Click submit
  await submitBtn.click();

  // Wait for redirect to dashboard
  await page.waitForURL('/', { timeout: 15000 });
  await expect(page).toHaveURL('/');

  // Save auth state
  await page.context().storageState({ path: authFile });
});
