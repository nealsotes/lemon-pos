# How to Access and Modify Railway MySQL Database

## Method 1: Railway Dashboard (Easiest)

1. Go to [Railway Dashboard](https://railway.app)
2. Select your project
3. Click on your MySQL service
4. Go to the **"Data"** or **"Connect"** tab
5. Click **"Query"** or **"Open MySQL Console"** to access the MySQL command line

## Method 2: Railway CLI

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```

4. Connect to MySQL:
   ```bash
   railway connect mysql
   ```

## Method 3: Direct MySQL Connection

1. Get connection details from Railway Dashboard:
   - Go to your MySQL service
   - Click on **"Variables"** tab to see connection details
   - Or check the **"Connect"** tab for connection string

2. Use MySQL client:
   ```bash
   mysql -h <HOST> -P <PORT> -u <USER> -p <DATABASE>
   ```

3. Or use a MySQL GUI tool (MySQL Workbench, DBeaver, etc.) with the connection details

## Common SQL Commands

### View all tables:
```sql
SHOW TABLES;
```

### View table structure:
```sql
DESCRIBE `AddOn`;
-- or
SHOW CREATE TABLE `AddOn`;
```

### Delete a table (CAREFUL!):
```sql
DROP TABLE `AddOn`;
```

### Delete all data from a table:
```sql
TRUNCATE TABLE `AddOn`;
```

### Update table structure:
```sql
-- See fix-addon-table.sql for the complete script
```

### Run SQL from a file:
If you have the SQL file, you can copy and paste it into the MySQL console, or:
```bash
mysql -h <HOST> -P <PORT> -u <USER> -p <DATABASE> < fix-addon-table.sql
```

## Important Notes

⚠️ **Always backup your data before making structural changes!**

- Railway MySQL uses the connection details from environment variables
- The database name, user, and password are in your Railway project variables
- Changes are permanent - be careful with DROP and DELETE commands
