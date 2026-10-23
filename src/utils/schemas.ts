import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(1, 'Password is required').max(128),
  tenantCode: z.string().min(1, 'Tenant code is required').max(50)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export const createUserSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  phoneNumber: z.string().max(20).optional()
});

export const createTenantSchema = z.object({
  companyName: z.string().min(1).max(200),
  companyCode: z.string().min(1).max(50),
  tin: z.string().max(20).optional(),
  sssEmployerNo: z.string().max(50).optional(),
  philHealthEmployerNo: z.string().max(50).optional(),
  pagIbigEmployerNo: z.string().max(50).optional(),
  gsisEmployerNo: z.string().max(50).optional(),
  isGovernment: z.boolean().optional(),
  address: z.string().max(500).optional(),
  subscriptionPlan: z.enum(['Basic', 'Standard', 'Premium']).optional(),
  adminEmail: z.string().email('Invalid admin email').max(255),
  adminPassword: z.string().min(8).max(128)
});

export const createRoleSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  name: z.string().min(1).max(100)
});

export const assignRoleSchema = z.object({
  roleId: z.string().uuid('Invalid role ID')
});

export const assignPermissionSchema = z.object({
  permissionId: z.string().uuid('Invalid permission ID')
});

export const createContributionTableSchema = z.object({
  effectiveYear: z.number().int().min(2020).max(2030),
  tableType: z.enum(['SSS', 'PhilHealth', 'PagIbig', 'GSIS', 'GSIS_EC']),
  bracketMin: z.number().min(0).optional(),
  bracketMax: z.number().min(0).optional(),
  employeeShare: z.number().min(0).optional(),
  employerShare: z.number().min(0).optional(),
  fixedAmount: z.number().min(0).optional(),
  ratePercent: z.number().min(0).max(100).optional(),
  description: z.string().max(500).optional()
});

export const copyYearSchema = z.object({
  sourceYear: z.number().int().min(2020).max(2030),
  targetYear: z.number().int().min(2020).max(2030)
});
