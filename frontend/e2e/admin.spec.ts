import { test, expect } from '@playwright/test';
import { login, URLS } from './helpers/auth';

test.describe('Admin Module', () => {
  test.describe('Admin Navigation', () => {
    test('admin section appears in sidebar for Super Admin', async ({ page }) => {
      await login(page);
      await page.goto(URLS.dashboard);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('text=Admin')).toBeVisible();
    });

    test('admin sub-navigation expands', async ({ page }) => {
      await login(page);
      await page.goto(URLS.dashboard);
      await page.waitForLoadState('networkidle');

      // Click on Admin in sidebar
      const adminBtn = page.locator('button:has-text("Admin")');
      if (await adminBtn.isVisible()) {
        await adminBtn.click();
        await expect(page.locator('a:has-text("Tenants")')).toBeVisible();
        await expect(page.locator('a:has-text("Users")')).toBeVisible();
        await expect(page.locator('a:has-text("Roles")')).toBeVisible();
      }
    });
  });

  test.describe('Tenants', () => {
    test('tenants page loads', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminTenants);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Tenants');
      await expect(page.locator('text=Manage companies and organizations')).toBeVisible();
    });

    test('tenants table displays columns', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminTenants);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('th:has-text("Company")')).toBeVisible();
      await expect(page.locator('th:has-text("Code")')).toBeVisible();
      await expect(page.locator('th:has-text("Plan")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    });

    test('new tenant button links correctly', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminTenants);
      await page.waitForLoadState('networkidle');

      const newTenantBtn = page.locator('a:has-text("New Tenant")');
      await expect(newTenantBtn).toBeVisible();
      await expect(newTenantBtn).toHaveAttribute('href', '/admin/tenants/new');
    });

    test('SYSTEM tenant appears in list', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminTenants);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('td:has-text("SYSTEM")')).toBeVisible();
    });
  });

  test.describe('New Tenant Form', () => {
    test('new tenant form renders', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.adminTenants}/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('New Tenant');
      await expect(page.locator('label:has-text("Company Name")')).toBeVisible();
      await expect(page.locator('label:has-text("Company Code")')).toBeVisible();
      await expect(page.locator('label:has-text("Admin Email")')).toBeVisible();
      await expect(page.locator('label:has-text("Admin Password")')).toBeVisible();
    });

    test('subscription plan dropdown has options', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.adminTenants}/new`);
      await page.waitForLoadState('networkidle');

      const select = page.locator('select');
      await expect(select.locator('option:has-text("Basic")')).toBeAttached();
      await expect(select.locator('option:has-text("Professional")')).toBeAttached();
      await expect(select.locator('option:has-text("Enterprise")')).toBeAttached();
    });

    test('government ID fields are present', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.adminTenants}/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('label:has-text("TIN")')).toBeVisible();
      await expect(page.locator('label:has-text("SSS Employer No")')).toBeVisible();
      await expect(page.locator('label:has-text("PhilHealth Employer No")')).toBeVisible();
      await expect(page.locator('label:has-text("Pag-IBIG Employer No")')).toBeVisible();
    });
  });

  test.describe('Users', () => {
    test('users page loads', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminUsers);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Users');
      await expect(page.locator('text=Manage user accounts')).toBeVisible();
    });

    test('users table displays columns', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminUsers);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('th:has-text("Email")')).toBeVisible();
      await expect(page.locator('th:has-text("Company")')).toBeVisible();
      await expect(page.locator('th:has-text("Roles")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    });

    test('new user button links correctly', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminUsers);
      await page.waitForLoadState('networkidle');

      const newUserBtn = page.locator('a:has-text("New User")');
      await expect(newUserBtn).toBeVisible();
      await expect(newUserBtn).toHaveAttribute('href', '/admin/users/new');
    });

    test('admin user appears in list', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminUsers);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('td:has-text("admin@system.com")')).toBeVisible();
    });
  });

  test.describe('New User Form', () => {
    test('new user form renders', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.adminUsers}/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('New User');
      await expect(page.locator('label:has-text("Tenant")')).toBeVisible();
      await expect(page.locator('label:has-text("Email")')).toBeVisible();
      await expect(page.locator('label:has-text("Password")')).toBeVisible();
    });

    test('tenant dropdown populates', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.adminUsers}/new`);
      await page.waitForLoadState('networkidle');

      const select = page.locator('select');
      await expect(select.locator('option:has-text("SYSTEM")')).toBeAttached();
    });
  });

  test.describe('Roles', () => {
    test('roles page loads', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminRoles);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('Roles');
      await expect(page.locator('text=Manage roles and permissions')).toBeVisible();
    });

    test('roles table displays columns', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminRoles);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('th:has-text("Role")')).toBeVisible();
      await expect(page.locator('th:has-text("Tenant")')).toBeVisible();
      await expect(page.locator('th:has-text("Permissions")')).toBeVisible();
      await expect(page.locator('th:has-text("Users")')).toBeVisible();
      await expect(page.locator('th:has-text("Type")')).toBeVisible();
    });

    test('system roles appear with System badge', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminRoles);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('td:has-text("Super Admin")')).toBeVisible();
      await expect(page.locator('span:has-text("System")').first()).toBeVisible();
    });

    test('new role button links correctly', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminRoles);
      await page.waitForLoadState('networkidle');

      const newRoleBtn = page.locator('a:has-text("New Role")');
      await expect(newRoleBtn).toBeVisible();
      await expect(newRoleBtn).toHaveAttribute('href', '/admin/roles/new');
    });
  });

  test.describe('New Role Form', () => {
    test('new role form renders', async ({ page }) => {
      await login(page);
      await page.goto(`${URLS.adminRoles}/new`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toContainText('New Role');
      await expect(page.locator('label:has-text("Tenant")')).toBeVisible();
      await expect(page.locator('label:has-text("Role Name")')).toBeVisible();
    });
  });

  test.describe('Tenant Detail', () => {
    test('tenant detail page loads for SYSTEM', async ({ page }) => {
      await login(page);
      await page.goto(URLS.adminTenants);
      await page.waitForLoadState('networkidle');

      // Click View on SYSTEM tenant
      const viewLink = page.locator('a:has-text("View")').first();
      if (await viewLink.isVisible()) {
        await viewLink.click();
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1')).toContainText('SYSTEM');
        await expect(page.locator('text=Plan')).toBeVisible();
        await expect(page.locator('text=Users')).toBeVisible();
        await expect(page.locator('text=TIN')).toBeVisible();
      }
    });
  });

  test.describe('Login Page', () => {
    test('login page has tenant code input', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('label:has-text("Company Code")')).toBeVisible();
      await expect(page.locator('input[placeholder="SYSTEM"]')).toBeVisible();
    });

    test('tenant code defaults to SYSTEM', async ({ page }) => {
      await page.goto(URLS.login);
      await page.waitForLoadState('networkidle');

      const tenantInput = page.locator('input[placeholder="SYSTEM"]');
      await expect(tenantInput).toHaveValue('SYSTEM');
    });
  });
});
