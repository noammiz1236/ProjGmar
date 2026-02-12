# Database Export Instructions

Your database needs to be running to export data. Here are multiple options:

## Option 1: Start Database & Run Export Script (Recommended)

**1. Start your PostgreSQL database**
- If using Docker: `docker start your-postgres-container`
- If using Windows PostgreSQL: Start "PostgreSQL" service from Services
- If using pgAdmin: Start the server from pgAdmin

**2. Run the export script**
```bash
cd server/db
node export-database.js
```

This will create `smartcart_full_export.sql` in the project root.

---

## Option 2: Using pgAdmin (GUI Method)

1. Open pgAdmin
2. Connect to `israel_shopping_db`
3. Right-click the database → "Backup..."
4. Choose:
   - Filename: `smartcart_backup.sql`
   - Format: Plain
   - Encoding: UTF8
   - ✅ Data: Yes
   - ✅ Schema: Yes
5. Click "Backup"

---

## Option 3: Using Docker (if using Docker)

```bash
# If your database is in Docker
docker exec -t your-postgres-container pg_dump -U postgres israel_shopping_db > smartcart_backup.sql
```

---

## Option 4: Using Command Line (Windows)

Find your PostgreSQL installation (usually `C:\Program Files\PostgreSQL\15\bin\`):

```cmd
"C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" -h localhost -p 5434 -U postgres -d israel_shopping_db -f smartcart_backup.sql
```

Enter password when prompted: `1234` (from your .env file)

---

## Option 5: Manual Export via SQL Client

If you have DBeaver, DataGrip, or any SQL client:

1. Connect to the database
2. Run this query to generate data export:

```sql
COPY (SELECT * FROM app.chains) TO 'C:/temp/chains.csv' WITH CSV HEADER;
COPY (SELECT * FROM app.items) TO 'C:/temp/items.csv' WITH CSV HEADER;
COPY (SELECT * FROM app.prices) TO 'C:/temp/prices.csv' WITH CSV HEADER;
-- etc for all tables
```

Or use the built-in export features in your SQL client.

---

## What to Send Your Coworker

After exporting, send them:
1. The backup SQL file (`smartcart_backup.sql` or `smartcart_full_export.sql`)
2. The `deploy.sql` file (for fresh installs)
3. The `.env.example` file
4. The `DEPLOYMENT.md` guide

---

## How They Import It

Your coworker can restore the database with:

```bash
# Create database first
createdb smartcart_db

# Import the backup
psql -U username -d smartcart_db -f smartcart_backup.sql
```

Or using Docker:
```bash
docker exec -i postgres-container psql -U postgres -d smartcart_db < smartcart_backup.sql
```

---

## Troubleshooting

**"Connection refused" error:**
- Make sure PostgreSQL is running
- Check the port in .env matches your PostgreSQL port
- Verify password is correct

**"pg_dump not found":**
- Add PostgreSQL bin folder to Windows PATH
- Or use full path to pg_dump.exe

**Large file size:**
- The export includes all product data from parser
- File might be 50-500MB depending on data
- Consider compressing: `zip smartcart_backup.zip smartcart_backup.sql`
