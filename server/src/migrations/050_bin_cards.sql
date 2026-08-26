-- ============================================================
-- Bizness-OS: Bin Cards (Inventory & Warehouse)
--
-- A traditional warehouse bin card is a running per-item, per-location
-- record of every receipt and issue with a balance carried forward. This
-- app already has that ledger in `stock_movements` (product_id +
-- warehouse_id + running quantity); `bins` adds the physical "this item
-- lives here" record on top of it, auto-provisioned the first time a
-- product is received into a warehouse rather than requiring someone to
-- set one up manually before stock can arrive.
-- ============================================================

CREATE TABLE bins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  bin_code      VARCHAR(50) NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(warehouse_id, product_id)
);

CREATE INDEX idx_bins_company ON bins(company_id);
CREATE INDEX idx_bins_product ON bins(product_id);
CREATE INDEX idx_bins_warehouse ON bins(warehouse_id);

-- Backfill: give every product+warehouse pair that already has stock
-- history a bin, so the Bin Card report isn't empty for existing data —
-- new pairs going forward are created automatically by stockService.receiveStock.
INSERT INTO bins (company_id, warehouse_id, product_id, bin_code)
SELECT DISTINCT sm.company_id, sm.warehouse_id, sm.product_id,
  LEFT('BIN-' || COALESCE(NULLIF(REGEXP_REPLACE(UPPER(w.code), '[^A-Z0-9]', '', 'g'), ''), 'WH') || '-' ||
       COALESCE(NULLIF(REGEXP_REPLACE(UPPER(p.sku), '[^A-Z0-9]', '', 'g'), ''), 'ITEM'), 50)
FROM stock_movements sm
JOIN warehouses w ON w.id = sm.warehouse_id
JOIN products p ON p.id = sm.product_id
ON CONFLICT (warehouse_id, product_id) DO NOTHING;
