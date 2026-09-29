-- Adds a company-level toggle (default: locked/off) letting SKU become
-- editable on existing products. Off by default since SKU is the natural
-- key tying together stock_levels, stock_batches, order line items, and
-- printed labels — changing it is opt-in, not the default behaviour.
ALTER TABLE inventory_settings ADD COLUMN sku_editing_enabled BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO permissions (module, action, code, description) VALUES
  ('inventory', 'manage_settings', 'inventory.settings.manage', 'View and update Inventory & Warehouse settings, including whether product SKUs can be edited')
ON CONFLICT DO NOTHING;
