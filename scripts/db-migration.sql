-- File: scripts/db-migration.sql

-- Create claims file registry table
CREATE TABLE IF NOT EXISTS claims_file_registry (
    file_id uuid NOT NULL,
    opportunity_id varchar NOT NULL,
    product_id varchar NOT NULL,
    original_filename varchar NOT NULL,
    upload_date timestamptz DEFAULT now() NULL,
    s3_location varchar NOT NULL,
    status varchar NOT NULL,
    file_size int8 NOT NULL,
    original_headers jsonb NOT NULL,
    row_count int4 NOT NULL,
    processing_stage varchar NOT NULL,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar NULL,
    updated_at timestamptz NULL,
    CONSTRAINT claims_file_registry_pkey PRIMARY KEY (file_id)
);

-- Create standard claim fields table
CREATE TABLE IF NOT EXISTS standard_claim_fields (
    id uuid NOT NULL,
    product_id varchar NOT NULL,
    field_name varchar NOT NULL,
    display_name varchar NOT NULL,
    description varchar NULL,
    data_type varchar NOT NULL,
    requirement_level varchar NOT NULL,
    validation_rules jsonb NULL,
    is_active bool DEFAULT true NULL,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar NULL,
    updated_at timestamptz NULL,
    CONSTRAINT standard_claim_fields_pkey PRIMARY KEY (id)
);

-- Create claim field variations table
CREATE TABLE IF NOT EXISTS claim_field_variations (
    id uuid NOT NULL,
    standard_field_id uuid NULL,
    variation_name varchar NOT NULL,
    is_active bool DEFAULT true NULL,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar(30) NULL,
    updated_at timestamptz NULL,
    CONSTRAINT claim_field_variations_pkey PRIMARY KEY (id)
);

-- Create template mappings table
CREATE TABLE IF NOT EXISTS template_mappings (
    id uuid NOT NULL,
    template_name varchar NOT NULL,
    file_id uuid NULL,
    opportunity_id varchar NOT NULL,
    product_id varchar NOT NULL,
    is_active bool DEFAULT true NULL,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar NULL,
    updated_at timestamptz NULL,
    CONSTRAINT template_mappings_pkey PRIMARY KEY (id)
);

-- Create mapping templates table
CREATE TABLE IF NOT EXISTS mapping_templates (
    id uuid NOT NULL,
    template_id uuid NULL,
    source_column varchar NOT NULL,
    standard_field_id uuid NULL,
    transformation_rule jsonb NULL,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar NULL,
    updated_at timestamptz NULL,
    CONSTRAINT mapping_templates_pkey PRIMARY KEY (id)
);

-- Create claim records table
CREATE TABLE IF NOT EXISTS claim_records (
    record_id uuid NOT NULL,
    file_id uuid NULL,
    row_number int4 NOT NULL,
    mapped_fields jsonb NOT NULL,
    unmapped_fields jsonb,
    dynamic_fields jsonb,
    calculated_fields jsonb,
    lookup_fields jsonb,
    validation_status varchar,
    processing_status varchar,
    savings_assigned bool,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar NULL,
    updated_at timestamptz NULL,
    CONSTRAINT claim_records_pkey PRIMARY KEY (record_id)
);

-- Create opportunity table
CREATE TABLE IF NOT EXISTS opportunity (
    id uuid NOT NULL,
    opportunity_id varchar NOT NULL,
    product_id varchar NOT NULL,
    employer varchar NOT NULL,
    opportunity_owner varchar,
    financial_analyst varchar,
    strategic_pharmacy_analyst varchar,
    stage_name varchar,
    opportunity_metadata jsonb NOT NULL,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_by varchar NULL,
    updated_at timestamptz NULL,
    CONSTRAINT opportunity_pkey PRIMARY KEY (id)
);

-- Add foreign key constraints
ALTER TABLE claim_field_variations 
ADD CONSTRAINT claim_field_variations_standard_field_id_fkey 
FOREIGN KEY (standard_field_id) REFERENCES standard_claim_fields(id);

ALTER TABLE template_mappings 
ADD CONSTRAINT template_mappings_file_id_fkey 
FOREIGN KEY (file_id) REFERENCES claims_file_registry(file_id);

ALTER TABLE mapping_templates 
ADD CONSTRAINT mapping_templates_standard_field_id_fkey 
FOREIGN KEY (standard_field_id) REFERENCES standard_claim_fields(id);

ALTER TABLE mapping_templates 
ADD CONSTRAINT mapping_templates_template_id_fkey 
FOREIGN KEY (template_id) REFERENCES template_mappings(id);

ALTER TABLE claim_records 
ADD CONSTRAINT claim_records_file_id_fkey 
FOREIGN KEY (file_id) REFERENCES claims_file_registry(file_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_claims_file_registry_opportunity_id 
ON claims_file_registry(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opportunity_opportunity_id 
ON opportunity(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_standard_claim_fields_product_id 
ON standard_claim_fields(product_id);

CREATE INDEX IF NOT EXISTS idx_template_mappings_opportunity_id 
ON template_mappings(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_claim_records_file_id 
ON claim_records(file_id);

-- Add drop statements for cleanup if needed (commented out by default)
/*
DROP TABLE IF EXISTS claim_records;
DROP TABLE IF EXISTS mapping_templates;
DROP TABLE IF EXISTS template_mappings;
DROP TABLE IF EXISTS claim_field_variations;
DROP TABLE IF EXISTS standard_claim_fields;
DROP TABLE IF EXISTS claims_file_registry;
DROP TABLE IF EXISTS opportunity;
*/


-- Create claims processing history table to track file processing status
CREATE TABLE IF NOT EXISTS claim_processing_history (
    processing_id uuid PRIMARY KEY,
    file_id uuid NOT NULL REFERENCES claims_file_registry(file_id),
    start_time timestamptz NOT NULL DEFAULT now(),
    end_time timestamptz,
    status varchar NOT NULL,
    total_rows integer NOT NULL,
    processed_rows integer DEFAULT 0,
    error_details jsonb,
    created_by varchar NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_by varchar,
    updated_at timestamptz,
    CONSTRAINT valid_row_counts CHECK (processed_rows <= total_rows)
);

-- Create index for better query performance
CREATE INDEX idx_claim_processing_history_file_id ON claim_processing_history(file_id);
CREATE INDEX idx_claim_processing_history_status ON claim_processing_history(status);

-- Add trigger to update timestamp columns
CREATE OR REPLACE FUNCTION update_processing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_claim_processing_history_timestamp
    BEFORE UPDATE ON claim_processing_history
    FOR EACH ROW
    EXECUTE PROCEDURE update_processing_timestamp();

-- Add comment for documentation
COMMENT ON TABLE claim_processing_history IS 'Tracks the processing history and status of claims files';