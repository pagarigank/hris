-- Migration 015: Add DeviceToken column to DeviceRegistry
-- Spec §8.8: "Push notification hooks via FCM/APNs token registered per device in DeviceRegistry"

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DeviceRegistry') AND name = 'DeviceToken')
BEGIN
    ALTER TABLE dbo.DeviceRegistry
    ADD DeviceToken NVARCHAR(500) NULL;

    CREATE INDEX idx_deviceregistry_token ON dbo.DeviceRegistry(DeviceToken) WHERE DeviceToken IS NOT NULL;
END
GO
