---
name: "supabase-db"
description: "Connects to Supabase cloud database to query schema and data. Invoke when user asks to check cloud database structure, compare local and cloud schemas, or query Supabase tables."
---

# Supabase Database Connector

This skill connects to the Supabase cloud database to query database structure and data.

## Connection Info
- URL: https://nplnlefdwfgtyimfkyih.supabase.co
- Can use PostgREST API to query database schema

## Available Operations

### Query Database Schema
Use SQL queries via PostgREST to get table information:

```sql
-- Get all tables in public schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

-- Get columns for a specific table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'table_name';

-- Get all indexes
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public';

-- Get all triggers
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- Get all constraints
SELECT constraint_name, table_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public';
```

### Compare Schemas
When comparing local SQL file with cloud database:
1. Query cloud database schema using above queries
2. Parse local SQL file structure
3. Compare and identify differences

## Usage Examples

1. Check cloud database tables:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

2. Get table structure:
```sql
SELECT * FROM information_schema.columns WHERE table_name = 'activities';
```

3. Get indexes:
```sql
SELECT * FROM pg_indexes WHERE tablename = 'activities';
```
