-- =============================================================================
-- BIZNES-OS SYSTEMS: MASTER DATABASE INITIALIZATION
-- =============================================================================

-- Enable UUID extension for cryptographic primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PUBLIC SCHEMA: TENANT MASTER DIRECTORY
-- Tracks all subscribed companies in the SaaS platform
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    tenant_slug VARCHAR(63) UNIQUE NOT NULL, -- e.g., 'acme_corp' -> schema name: 'tenant_acme_corp'
    schema_name VARCHAR(63) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROVISIONING', -- PROVISIONING, ACTIVE, SUSPENDED, DELETED
    primary_currency VARCHAR(3) DEFAULT 'GHS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for instant schema routing on API requests
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(tenant_slug);

-- 2. PUBLIC SCHEMA: GLOBAL USER ROUTING DIRECTORY
-- Maps user email addresses to their assigned tenant schema(s)
CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    is_super_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_user UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_email ON public.tenant_users(email);

-- 3. PUBLIC SCHEMA: SYSTEM-WIDE AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- e.g., 'TENANT_PROVISIONED', 'MIGRATION_EXECUTE'
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- AUTOMATED TENANT PROVISIONING ENGINE
-- Dynamically creates isolated schema & core tables for new client sign-ups
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_provision_tenant_schema(
    p_company_name TEXT,
    p_tenant_slug TEXT,
    p_admin_email TEXT
)
RETURNS UUID AS $$
DECLARE
    v_tenant_id UUID;
    v_schema_name TEXT;
BEGIN
    v_schema_name := 'tenant_' || lower(regexp_replace(p_tenant_slug, '[^a-zA-Z0-9_]', '', 'g'));

    -- Step 1: Record in global tenants master directory
    INSERT INTO public.tenants (company_name, tenant_slug, schema_name, status)
    VALUES (p_company_name, p_tenant_slug, v_schema_name, 'PROVISIONING')
    RETURNING id INTO v_tenant_id;

    -- Step 2: Register Admin User mapping in public directory
    INSERT INTO public.tenant_users (tenant_id, email, is_super_admin)
    VALUES (v_tenant_id, p_admin_email, TRUE);

    -- Step 3: DDL Execution for isolated tenant schema
    EXECUTE 'CREATE SCHEMA ' || quote_ident(v_schema_name);

    -- 3a. Employees Master Table
    EXECUTE 'CREATE TABLE ' || quote_ident(v_schema_name) || '.employees (' ||
            'id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ' ||
            'employee_code VARCHAR(50) UNIQUE NOT NULL, ' ||
            'full_name VARCHAR(255) NOT NULL, ' ||
            'email VARCHAR(255) UNIQUE NOT NULL, ' ||
            'tin_number VARCHAR(50), ' ||
            'ssnit_number VARCHAR(50), ' ||
            'status VARCHAR(20) DEFAULT ''ACTIVE'', ' ||
            'created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' ||
            ');';

    -- 3b. Effective-Dated Salary History
    EXECUTE 'CREATE TABLE ' || quote_ident(v_schema_name) || '.employee_compensation (' ||
            'id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ' ||
            'employee_id UUID NOT NULL REFERENCES ' || quote_ident(v_schema_name) || '.employees(id) ON DELETE CASCADE, ' ||
            'base_salary NUMERIC(15, 2) NOT NULL, ' ||
            'effective_from DATE NOT NULL, ' ||
            'effective_to DATE, ' ||
            'change_reason VARCHAR(100), ' ||
            'created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' ||
            ');';

    -- 3c. Chart of Accounts (COA)
    EXECUTE 'CREATE TABLE ' || quote_ident(v_schema_name) || '.chart_of_accounts (' ||
            'id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ' ||
            'account_code VARCHAR(20) UNIQUE NOT NULL, ' ||
            'account_name VARCHAR(255) NOT NULL, ' ||
            'account_type VARCHAR(50) NOT NULL, ' || -- Asset, Liability, Equity, Revenue, Expense
            'is_active BOOLEAN DEFAULT TRUE' ||
            ');';

    -- 3d. Journal Entries Header
    EXECUTE 'CREATE TABLE ' || quote_ident(v_schema_name) || '.journal_entries (' ||
            'id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ' ||
            'entry_date DATE NOT NULL, ' ||
            'reference_type VARCHAR(50), ' || -- PAYROLL, INVOICE, MANUAL
            'reference_id UUID, ' ||
            'is_reversed BOOLEAN DEFAULT FALSE, ' ||
            'created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' ||
            ');';

    -- 3e. Journal Entry Lines (Double-Entry Ledger with FCY support)
    EXECUTE 'CREATE TABLE ' || quote_ident(v_schema_name) || '.journal_entry_lines (' ||
            'id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ' ||
            'journal_entry_id UUID NOT NULL REFERENCES ' || quote_ident(v_schema_name) || '.journal_entries(id) ON DELETE CASCADE, ' ||
            'account_id UUID NOT NULL REFERENCES ' || quote_ident(v_schema_name) || '.chart_of_accounts(id), ' ||
            'debit_base NUMERIC(15, 2) DEFAULT 0.00, ' ||
            'credit_base NUMERIC(15, 2) DEFAULT 0.00, ' ||
            'fcy_currency VARCHAR(3), ' ||
            'fcy_amount NUMERIC(15, 2), ' ||
            'exchange_rate NUMERIC(10, 6)' ||
            ');';

    -- Step 4: Seed Default Chart of Accounts into Tenant Schema
    EXECUTE 'INSERT INTO ' || quote_ident(v_schema_name) || '.chart_of_accounts (account_code, account_name, account_type) VALUES ' ||
            '(''1000'', ''Cash & Bank Balances'', ''Asset''), ' ||
            '(''2000'', ''Accounts Payable'', ''Liability''), ' ||
            '(''2100'', ''GRA PAYE Tax Payable'', ''Liability''), ' ||
            '(''2110'', ''SSNIT Pension Payable'', ''Liability''), ' ||
            '(''6000'', ''Salaries & Wages Expense'', ''Expense''), ' ||
            '(''6010'', ''SSNIT Employer Contribution Expense'', ''Expense''), ' ||
            '(''6100'', ''Realized FX Loss'', ''Expense''), ' ||
            '(''7100'', ''Realized FX Gain'', ''Revenue'');';

    -- Step 5: Mark Tenant as Active
    UPDATE public.tenants SET status = 'ACTIVE' WHERE id = v_tenant_id;

    -- Audit Log entry
    INSERT INTO public.system_audit_logs(tenant_id, event_type, description)
    VALUES (v_tenant_id, 'TENANT_PROVISIONED', 'Schema ' || v_schema_name || ' successfully created and seeded.');

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PROVISION DEMO TENANT
-- Un-comment the line below to test provisioning your first company schema
-- =============================================================================
-- SELECT public.fn_provision_tenant_schema('Acme Logistics Ltd', 'acme_corp', 'admin@acmelogistics.com.gh');