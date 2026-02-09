-- Drop and recreate AddOn table with correct structure
-- MySQL requires AUTO_INCREMENT columns to be the first column in a composite primary key

-- Drop and recreate AddOn table with correct structure
-- MySQL requires AUTO_INCREMENT columns to be the first column in a composite primary key
-- Note: TransactionItem has PRIMARY KEY (Id, TransactionId), so foreign key must match that order

-- Step 1: Drop the existing AddOn table (this will also drop all constraints)
DROP TABLE IF EXISTS `AddOn`;

-- Step 2: Create the table with correct structure
-- Note: Id must be first in the primary key for AUTO_INCREMENT to work
-- Foreign key order matches TransactionItem's PRIMARY KEY (Id, TransactionId)
CREATE TABLE `AddOn` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `TransactionItemTransactionId` INT NOT NULL,
    `TransactionItemId` INT NOT NULL,
    `Name` VARCHAR(100) NOT NULL,
    `Price` DECIMAL(18,2) NOT NULL,
    `Quantity` INT NOT NULL DEFAULT 1,
    PRIMARY KEY (`Id`, `TransactionItemTransactionId`, `TransactionItemId`),
    CONSTRAINT `FK_AddOn_TransactionItem` 
        FOREIGN KEY (`TransactionItemId`, `TransactionItemTransactionId`) 
        REFERENCES `TransactionItem` (`Id`, `TransactionId`) 
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify the structure
DESCRIBE `AddOn`;

-- Show the final structure
SHOW CREATE TABLE `AddOn`;
