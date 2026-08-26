-- License tokens: a 16-character mixed alphanumeric token generated at
-- company registration. The rule is one token, up to two companies —
-- meant for genuinely related businesses (a parent company and a
-- subsidiary, two related SME entities under one license) rather than
-- one company per token. Enforced at the application layer (count of
-- companies already using a given token, checked before allowing a
-- third), since a straightforward CHECK constraint can't count sibling
-- rows across a table the way this rule needs.
CREATE TABLE license_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token       VARCHAR(16) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Nullable and with no backfill for existing companies — this table
-- didn't exist when they registered, the same convention already
-- followed for nature_of_business (added mandatory-for-new-registrations
-- later, existing companies simply left without one rather than having
-- a value invented for them).
ALTER TABLE companies ADD COLUMN license_token_id UUID REFERENCES license_tokens(id) ON DELETE SET NULL;
CREATE INDEX idx_companies_license_token ON companies(license_token_id);
