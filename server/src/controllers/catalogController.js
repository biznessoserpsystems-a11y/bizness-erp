const db = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { recordAudit } = require('../middleware/auditLog');

// ---------- Units of Measure ----------

const listUom = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM units_of_measure WHERE company_id = $1 ORDER BY name',
    [req.user.companyId]
  );
  res.json(rows);
});

const createUom = asyncHandler(async (req, res) => {
  const { name, symbol } = req.body;
  if (!name || !symbol) throw new ApiError(400, 'name and symbol are required');
  const { rows } = await db.query(
    'INSERT INTO units_of_measure (company_id, name, symbol) VALUES ($1, $2, $3) RETURNING *',
    [req.user.companyId, name, symbol]
  );
  res.status(201).json(rows[0]);
});

const updateUom = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, symbol, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE units_of_measure SET name = COALESCE($1, name), symbol = COALESCE($2, symbol), is_active = COALESCE($3, is_active)
     WHERE id = $4 AND company_id = $5 RETURNING *`,
    [name, symbol, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Unit of measure not found');
  res.json(rows[0]);
});

// ---------- Brands ----------

const listBrands = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM brands WHERE company_id = $1 ORDER BY name', [req.user.companyId]);
  res.json(rows);
});

const createBrand = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query(
    'INSERT INTO brands (company_id, name, description) VALUES ($1, $2, $3) RETURNING *',
    [req.user.companyId, name, description || null]
  );
  res.status(201).json(rows[0]);
});

const updateBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE brands SET name = COALESCE($1, name), description = COALESCE($2, description), is_active = COALESCE($3, is_active)
     WHERE id = $4 AND company_id = $5 RETURNING *`,
    [name, description, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Brand not found');
  res.json(rows[0]);
});

// ---------- Product Categories ----------

const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM product_categories WHERE company_id = $1 ORDER BY name',
    [req.user.companyId]
  );
  res.json(rows);
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, description, parentId } = req.body;
  if (!name) throw new ApiError(400, 'name is required');
  const { rows } = await db.query(
    'INSERT INTO product_categories (company_id, name, description, parent_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.companyId, name, description || null, parentId || null]
  );
  res.status(201).json(rows[0]);
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, parentId, isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE product_categories SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       parent_id = COALESCE($3, parent_id), is_active = COALESCE($4, is_active)
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [name, description, parentId, isActive, id, req.user.companyId]
  );
  if (!rows.length) throw new ApiError(404, 'Category not found');
  res.json(rows[0]);
});

module.exports = {
  listUom, createUom, updateUom,
  listBrands, createBrand, updateBrand,
  listCategories, createCategory, updateCategory,
};
