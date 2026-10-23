import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { setTenantContext } from '../../middleware/tenantContext';
import { requirePermission } from '../../middleware/permissions';
import sql from 'mssql';

const router = Router();

router.use(authMiddleware);
router.use(setTenantContext);

// ============================================================
// ONBOARDING TEMPLATES
// ============================================================

// GET /api/v1/onboarding/templates - List onboarding templates
router.get('/templates', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT t.*, 
          (SELECT COUNT(*) FROM dbo.OnboardingTemplateItems ti WHERE ti.TemplateId = t.Id AND ti.IsDeleted = 0) AS ItemCount
        FROM dbo.OnboardingTemplates t
        WHERE t.TenantId = @TenantId AND t.IsDeleted = 0
        ORDER BY t.Name
      `);

    res.json({ success: true, data: { templates: result.recordset } });
  } catch (error) {
    console.error('Error listing onboarding templates:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve templates' } });
  }
});

// GET /api/v1/onboarding/templates/:id - Get template with items
router.get('/templates/:id', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const templateResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.id)
      .query('SELECT * FROM dbo.OnboardingTemplates WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0');

    if (templateResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } });
      return;
    }

    const itemsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('TemplateId', sql.UniqueIdentifier, req.params.id)
      .query(`
        SELECT * FROM dbo.OnboardingTemplateItems 
        WHERE TemplateId = @TemplateId AND TenantId = @TenantId AND IsDeleted = 0
        ORDER BY SortOrder, ItemName
      `);

    res.json({
      success: true,
      data: {
        template: templateResult.recordset[0],
        items: itemsResult.recordset
      }
    });
  } catch (error) {
    console.error('Error getting onboarding template:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve template' } });
  }
});

// POST /api/v1/onboarding/templates - Create onboarding template
router.post('/templates', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { name, description, items } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } });
      return;
    }

    const templateResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('Description', sql.NVarChar, description || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.OnboardingTemplates (TenantId, Name, Description, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Name, @Description, @CreatedBy)
      `);

    const templateId = templateResult.recordset[0].Id;

    if (items && Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('TemplateId', sql.UniqueIdentifier, templateId)
          .input('ItemName', sql.NVarChar, item.itemName)
          .input('Description', sql.NVarChar, item.description || null)
          .input('Category', sql.NVarChar, item.category || 'General')
          .input('SortOrder', sql.Int, item.sortOrder ?? i)
          .input('IsRequired', sql.Bit, item.isRequired ?? true)
          .input('CreatedBy', sql.UniqueIdentifier, userId)
          .query(`
            INSERT INTO dbo.OnboardingTemplateItems (TenantId, TemplateId, ItemName, Description, Category, SortOrder, IsRequired, CreatedBy)
            VALUES (@TenantId, @TemplateId, @ItemName, @Description, @Category, @SortOrder, @IsRequired, @CreatedBy)
          `);
      }
    }

    res.status(201).json({ success: true, data: { id: templateId, message: 'Template created successfully' } });
  } catch (error) {
    console.error('Error creating onboarding template:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create template' } });
  }
});

// PUT /api/v1/onboarding/templates/:id - Update onboarding template
router.put('/templates/:id', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { name, description, isActive } = req.body;

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.id)
      .input('Name', sql.NVarChar, name || null)
      .input('Description', sql.NVarChar, description || null)
      .input('IsActive', sql.Bit, isActive ?? true)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.OnboardingTemplates
        SET Name = COALESCE(@Name, Name), Description = COALESCE(@Description, Description), 
            IsActive = @IsActive, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    res.json({ success: true, data: { message: 'Template updated successfully' } });
  } catch (error) {
    console.error('Error updating onboarding template:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update template' } });
  }
});

// DELETE /api/v1/onboarding/templates/:id - Soft delete onboarding template
router.delete('/templates/:id', requirePermission('employee:delete'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.id)
      .input('UpdatedBy', sql.UniqueIdentifier, userId)
      .query(`
        UPDATE dbo.OnboardingTemplates SET IsDeleted = 1, UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
        WHERE Id = @Id AND TenantId = @TenantId
      `);

    res.json({ success: true, data: { message: 'Template deleted successfully' } });
  } catch (error) {
    console.error('Error deleting onboarding template:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to delete template' } });
  }
});

// ============================================================
// OFFBOARDING (BEFORE /:id to avoid route conflict)
// ============================================================

// GET /api/v1/onboarding/offboarding/templates - List offboarding templates
router.get('/offboarding/templates', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const result = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .query(`
        SELECT t.*, 
          (SELECT COUNT(*) FROM dbo.OffboardingTemplateItems ti WHERE ti.TemplateId = t.Id AND ti.IsDeleted = 0) AS ItemCount
        FROM dbo.OffboardingTemplates t
        WHERE t.TenantId = @TenantId AND t.IsDeleted = 0
        ORDER BY t.Name
      `);

    res.json({ success: true, data: { templates: result.recordset } });
  } catch (error) {
    console.error('Error listing offboarding templates:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve templates' } });
  }
});

// POST /api/v1/onboarding/offboarding/templates - Create offboarding template
router.post('/offboarding/templates', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { name, description, items } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name is required' } });
      return;
    }

    const templateResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Name', sql.NVarChar, name)
      .input('Description', sql.NVarChar, description || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.OffboardingTemplates (TenantId, Name, Description, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @Name, @Description, @CreatedBy)
      `);

    const templateId = templateResult.recordset[0].Id;

    if (items && Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await pool.request()
          .input('TenantId', sql.UniqueIdentifier, tenantId)
          .input('TemplateId', sql.UniqueIdentifier, templateId)
          .input('ItemName', sql.NVarChar, item.itemName)
          .input('Description', sql.NVarChar, item.description || null)
          .input('Category', sql.NVarChar, item.category || 'General')
          .input('SortOrder', sql.Int, item.sortOrder ?? i)
          .input('IsRequired', sql.Bit, item.isRequired ?? true)
          .input('CreatedBy', sql.UniqueIdentifier, userId)
          .query(`
            INSERT INTO dbo.OffboardingTemplateItems (TenantId, TemplateId, ItemName, Description, Category, SortOrder, IsRequired, CreatedBy)
            VALUES (@TenantId, @TemplateId, @ItemName, @Description, @Category, @SortOrder, @IsRequired, @CreatedBy)
          `);
      }
    }

    res.status(201).json({ success: true, data: { id: templateId, message: 'Template created successfully' } });
  } catch (error) {
    console.error('Error creating offboarding template:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to create template' } });
  }
});

// GET /api/v1/onboarding/offboarding - List offboardings
router.get('/offboarding', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { status } = req.query;

    let whereClause = 'WHERE eo.TenantId = @TenantId AND eo.IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (status) {
      whereClause += ' AND eo.Status = @Status';
      request.input('Status', sql.NVarChar, status as string);
    }

    const result = await request.query(`
      SELECT 
        eo.*,
        e.EmployeeNo, e.FirstName, e.LastName, e.Email,
        d.Name AS DepartmentName,
        t.Name AS TemplateName,
        (SELECT COUNT(*) FROM dbo.EmployeeOffboardingItems eoi 
         WHERE eoi.OffboardingId = eo.Id AND eoi.IsDeleted = 0) AS TotalItems,
        (SELECT COUNT(*) FROM dbo.EmployeeOffboardingItems eoi 
         WHERE eoi.OffboardingId = eo.Id AND eoi.IsDeleted = 0 AND eoi.IsCompleted = 1) AS CompletedItems
      FROM dbo.EmployeeOffboarding eo
      INNER JOIN dbo.Employees e ON eo.EmployeeId = e.Id
      INNER JOIN dbo.OffboardingTemplates t ON eo.TemplateId = t.Id
      LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
      ${whereClause}
      ORDER BY eo.CreatedAtUtc DESC
    `);

    res.json({ success: true, data: { offboardings: result.recordset } });
  } catch (error) {
    console.error('Error listing offboardings:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve offboardings' } });
  }
});

// POST /api/v1/onboarding/offboarding - Start offboarding
router.post('/offboarding', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, templateId, separationType, lastDayOfWork, reason, notes } = req.body;

    if (!employeeId || !templateId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'EmployeeId and TemplateId are required' } });
      return;
    }

    const offboardingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('TemplateId', sql.UniqueIdentifier, templateId)
      .input('SeparationType', sql.NVarChar, separationType || null)
      .input('LastDayOfWork', sql.Date, lastDayOfWork ? new Date(lastDayOfWork) : null)
      .input('Reason', sql.NVarChar, reason || null)
      .input('Notes', sql.NVarChar, notes || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeOffboarding (TenantId, EmployeeId, TemplateId, Status, SeparationType, LastDayOfWork, Reason, StartedAtUtc, Notes, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @TemplateId, 'InProgress', @SeparationType, @LastDayOfWork, @Reason, GETUTCDATE(), @Notes, @CreatedBy)
      `);

    const offboardingId = offboardingResult.recordset[0].Id;

    // Create checklist items from template
    const templateItems = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('TemplateId', sql.UniqueIdentifier, templateId)
      .query('SELECT Id FROM dbo.OffboardingTemplateItems WHERE TemplateId = @TemplateId AND TenantId = @TenantId AND IsDeleted = 0');

    for (const item of templateItems.recordset) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('OffboardingId', sql.UniqueIdentifier, offboardingId)
        .input('TemplateItemId', sql.UniqueIdentifier, item.Id)
        .query(`
          INSERT INTO dbo.EmployeeOffboardingItems (TenantId, OffboardingId, TemplateItemId)
          VALUES (@TenantId, @OffboardingId, @TemplateItemId)
        `);
    }

    res.status(201).json({ success: true, data: { id: offboardingId, message: 'Offboarding started successfully' } });
  } catch (error) {
    console.error('Error creating offboarding:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to start offboarding' } });
  }
});

// GET /api/v1/onboarding/offboarding/:id - Get offboarding with items
router.get('/offboarding/:id', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const offboardingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.id)
      .query(`
        SELECT 
          eo.*,
          e.EmployeeNo, e.FirstName, e.LastName, e.Email,
          d.Name AS DepartmentName,
          t.Name AS TemplateName
        FROM dbo.EmployeeOffboarding eo
        INNER JOIN dbo.Employees e ON eo.EmployeeId = e.Id
        INNER JOIN dbo.OffboardingTemplates t ON eo.TemplateId = t.Id
        LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
        WHERE eo.Id = @Id AND eo.TenantId = @TenantId AND eo.IsDeleted = 0
      `);

    if (offboardingResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Offboarding not found' } });
      return;
    }

    const itemsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('OffboardingId', sql.UniqueIdentifier, req.params.id)
      .query(`
        SELECT 
          eoi.*,
          ti.ItemName, ti.Description, ti.Category, ti.SortOrder, ti.IsRequired
        FROM dbo.EmployeeOffboardingItems eoi
        INNER JOIN dbo.OffboardingTemplateItems ti ON eoi.TemplateItemId = ti.Id
        WHERE eoi.OffboardingId = @OffboardingId AND eoi.TenantId = @TenantId AND eoi.IsDeleted = 0
        ORDER BY ti.SortOrder, ti.ItemName
      `);

    res.json({
      success: true,
      data: {
        offboarding: offboardingResult.recordset[0],
        items: itemsResult.recordset
      }
    });
  } catch (error) {
    console.error('Error getting offboarding:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve offboarding' } });
  }
});

// PUT /api/v1/onboarding/offboarding/:id/items/:itemId - Complete offboarding item
router.put('/offboarding/:id/items/:itemId', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { isCompleted, notes } = req.body;

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.itemId)
      .input('IsCompleted', sql.Bit, isCompleted)
      .input('Notes', sql.NVarChar, notes || null)
      .input('CompletedBy', sql.UniqueIdentifier, isCompleted ? userId : null)
      .query(`
        UPDATE dbo.EmployeeOffboardingItems
        SET IsCompleted = @IsCompleted, 
            CompletedAtUtc = CASE WHEN @IsCompleted = 1 THEN GETUTCDATE() ELSE NULL END,
            CompletedBy = @CompletedBy,
            Notes = @Notes,
            UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    res.json({ success: true, data: { message: 'Item updated successfully' } });
  } catch (error) {
    console.error('Error updating offboarding item:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update item' } });
  }
});

// ============================================================
// EMPLOYEE ONBOARDING
// ============================================================

// GET /api/v1/onboarding - List employee onboardings
router.get('/', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const { status, departmentId } = req.query;

    let whereClause = 'WHERE eo.TenantId = @TenantId AND eo.IsDeleted = 0';
    const request = pool.request().input('TenantId', sql.UniqueIdentifier, tenantId);

    if (status) {
      whereClause += ' AND eo.Status = @Status';
      request.input('Status', sql.NVarChar, status as string);
    }
    if (departmentId) {
      whereClause += ' AND e.DepartmentId = @DepartmentId';
      request.input('DepartmentId', sql.UniqueIdentifier, departmentId as string);
    }

    const result = await request.query(`
      SELECT 
        eo.*,
        e.EmployeeNo, e.FirstName, e.LastName, e.Email,
        d.Name AS DepartmentName,
        t.Name AS TemplateName,
        (SELECT COUNT(*) FROM dbo.EmployeeOnboardingItems eoi 
         WHERE eoi.OnboardingId = eo.Id AND eoi.IsDeleted = 0) AS TotalItems,
        (SELECT COUNT(*) FROM dbo.EmployeeOnboardingItems eoi 
         WHERE eoi.OnboardingId = eo.Id AND eoi.IsDeleted = 0 AND eoi.IsCompleted = 1) AS CompletedItems
      FROM dbo.EmployeeOnboarding eo
      INNER JOIN dbo.Employees e ON eo.EmployeeId = e.Id
      INNER JOIN dbo.OnboardingTemplates t ON eo.TemplateId = t.Id
      LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
      ${whereClause}
      ORDER BY eo.CreatedAtUtc DESC
    `);

    res.json({ success: true, data: { onboardings: result.recordset } });
  } catch (error) {
    console.error('Error listing onboardings:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve onboardings' } });
  }
});

// GET /api/v1/onboarding/:id - Get onboarding with items (AFTER /offboarding routes)
router.get('/:id', requirePermission('employee:read'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;

    const onboardingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.id)
      .query(`
        SELECT 
          eo.*,
          e.EmployeeNo, e.FirstName, e.LastName, e.Email, e.DateHired,
          d.Name AS DepartmentName,
          t.Name AS TemplateName
        FROM dbo.EmployeeOnboarding eo
        INNER JOIN dbo.Employees e ON eo.EmployeeId = e.Id
        INNER JOIN dbo.OnboardingTemplates t ON eo.TemplateId = t.Id
        LEFT JOIN dbo.Departments d ON e.DepartmentId = d.Id
        WHERE eo.Id = @Id AND eo.TenantId = @TenantId AND eo.IsDeleted = 0
      `);

    if (onboardingResult.recordset.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Onboarding not found' } });
      return;
    }

    const itemsResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('OnboardingId', sql.UniqueIdentifier, req.params.id)
      .query(`
        SELECT 
          eoi.*,
          ti.ItemName, ti.Description, ti.Category, ti.SortOrder, ti.IsRequired
        FROM dbo.EmployeeOnboardingItems eoi
        INNER JOIN dbo.OnboardingTemplateItems ti ON eoi.TemplateItemId = ti.Id
        WHERE eoi.OnboardingId = @OnboardingId AND eoi.TenantId = @TenantId AND eoi.IsDeleted = 0
        ORDER BY ti.SortOrder, ti.ItemName
      `);

    res.json({
      success: true,
      data: {
        onboarding: onboardingResult.recordset[0],
        items: itemsResult.recordset
      }
    });
  } catch (error) {
    console.error('Error getting onboarding:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve onboarding' } });
  }
});

// POST /api/v1/onboarding - Start onboarding for an employee
router.post('/', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { employeeId, templateId, notes } = req.body;

    if (!employeeId || !templateId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'EmployeeId and TemplateId are required' } });
      return;
    }

    // Check if employee already has an active onboarding
    const existingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT Id FROM dbo.EmployeeOnboarding 
        WHERE EmployeeId = @EmployeeId AND TenantId = @TenantId AND Status = 'InProgress' AND IsDeleted = 0
      `);

    if (existingResult.recordset.length > 0) {
      res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Employee already has an active onboarding' } });
      return;
    }

    // Create onboarding record
    const onboardingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('TemplateId', sql.UniqueIdentifier, templateId)
      .input('Notes', sql.NVarChar, notes || null)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeOnboarding (TenantId, EmployeeId, TemplateId, Status, StartedAtUtc, Notes, CreatedBy)
        OUTPUT INSERTED.Id
        VALUES (@TenantId, @EmployeeId, @TemplateId, 'InProgress', GETUTCDATE(), @Notes, @CreatedBy)
      `);

    const onboardingId = onboardingResult.recordset[0].Id;

    // Get template items and create checklist items
    const templateItems = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('TemplateId', sql.UniqueIdentifier, templateId)
      .query('SELECT Id FROM dbo.OnboardingTemplateItems WHERE TemplateId = @TemplateId AND TenantId = @TenantId AND IsDeleted = 0');

    for (const item of templateItems.recordset) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('OnboardingId', sql.UniqueIdentifier, onboardingId)
        .input('TemplateItemId', sql.UniqueIdentifier, item.Id)
        .query(`
          INSERT INTO dbo.EmployeeOnboardingItems (TenantId, OnboardingId, TemplateItemId)
          VALUES (@TenantId, @OnboardingId, @TemplateItemId)
        `);
    }

    // Update employee employment history
    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('EmployeeId', sql.UniqueIdentifier, employeeId)
      .input('CreatedBy', sql.UniqueIdentifier, userId)
      .query(`
        INSERT INTO dbo.EmployeeEmploymentHistory (TenantId, EmployeeId, EffectiveDate, ChangeType, NewValueJson, CreatedBy)
        VALUES (@TenantId, @EmployeeId, GETUTCDATE(), 'Hire', '{"OnboardingStarted": true}', @CreatedBy)
      `);

    res.status(201).json({ success: true, data: { id: onboardingId, message: 'Onboarding started successfully' } });
  } catch (error) {
    console.error('Error creating onboarding:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to start onboarding' } });
  }
});

// PUT /api/v1/onboarding/:id/items/:itemId - Complete/uncomplete a checklist item
router.put('/:id/items/:itemId', requirePermission('employee:write'), async (req: AuthRequest, res) => {
  try {
    const pool = (req as any).pool;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { isCompleted, notes } = req.body;

    await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('Id', sql.UniqueIdentifier, req.params.itemId)
      .input('IsCompleted', sql.Bit, isCompleted)
      .input('Notes', sql.NVarChar, notes || null)
      .input('CompletedBy', sql.UniqueIdentifier, isCompleted ? userId : null)
      .query(`
        UPDATE dbo.EmployeeOnboardingItems
        SET IsCompleted = @IsCompleted, 
            CompletedAtUtc = CASE WHEN @IsCompleted = 1 THEN GETUTCDATE() ELSE NULL END,
            CompletedBy = @CompletedBy,
            Notes = @Notes,
            UpdatedAtUtc = GETUTCDATE()
        WHERE Id = @Id AND TenantId = @TenantId AND IsDeleted = 0
      `);

    // Check if all required items are completed
    const pendingResult = await pool.request()
      .input('TenantId', sql.UniqueIdentifier, tenantId)
      .input('OnboardingId', sql.UniqueIdentifier, req.params.id)
      .query(`
        SELECT COUNT(*) AS PendingCount
        FROM dbo.EmployeeOnboardingItems eoi
        INNER JOIN dbo.OnboardingTemplateItems ti ON eoi.TemplateItemId = ti.Id
        WHERE eoi.OnboardingId = @OnboardingId AND eoi.TenantId = @TenantId 
          AND eoi.IsDeleted = 0 AND ti.IsRequired = 1 AND eoi.IsCompleted = 0
      `);

    // Auto-complete onboarding if all required items are done
    if (pendingResult.recordset[0].PendingCount === 0) {
      await pool.request()
        .input('TenantId', sql.UniqueIdentifier, tenantId)
        .input('OnboardingId', sql.UniqueIdentifier, req.params.id)
        .input('UpdatedBy', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE dbo.EmployeeOnboarding
          SET Status = 'Completed', CompletedAtUtc = GETUTCDATE(), UpdatedAtUtc = GETUTCDATE(), UpdatedBy = @UpdatedBy
          WHERE Id = @OnboardingId AND TenantId = @TenantId AND Status = 'InProgress'
        `);
    }

    res.json({ success: true, data: { message: 'Item updated successfully' } });
  } catch (error) {
    console.error('Error updating onboarding item:', error);
    res.status(500).json({ success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to update item' } });
  }
});

export default router;
