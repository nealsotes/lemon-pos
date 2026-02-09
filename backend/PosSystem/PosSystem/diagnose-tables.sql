-- Run this in Railway MySQL console to check what tables exist
SHOW TABLES;

-- Check structure of transaction-related tables
SHOW CREATE TABLE Transactions;

-- Check if TransactionItems exists (plural)
SHOW CREATE TABLE TransactionItems;

-- Check if TransactionItem exists (singular)  
SHOW CREATE TABLE TransactionItem;

-- Check if AddOn exists
SHOW CREATE TABLE AddOn;

-- Check if TransactionItems_AddOns exists
SHOW CREATE TABLE TransactionItems_AddOns;

-- List all tables with 'Transaction' in the name
SHOW TABLES LIKE '%Transaction%';

-- List all tables with 'AddOn' in the name
SHOW TABLES LIKE '%AddOn%';
