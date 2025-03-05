# File: scripts/run-migration.sh
#!/bin/bash

# Load environment variables from .env.local
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '#' | awk '/=/ {print}' | xargs)
fi

echo "Connecting to database and creating/updating schema..."

# Create a temporary SQL file with schema creation
cat << EOF > scripts/temp-schema.sql
-- Create schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS edpm;

-- Set search path
SET search_path TO edpm;

-- Include the main migration file
\i scripts/db-migration.sql
EOF

# Run the SQL commands
PGPASSWORD=$DB_PASSWORD psql \
    -h "$DB_HOST" \
    -U "$DB_USER" \
    -d "postgres" \
    -p "$DB_PORT" \
    -f scripts/temp-schema.sql

# Clean up
rm scripts/temp-schema.sql

# Reset password environment variable
unset PGPASSWORD

echo "Migration completed!"