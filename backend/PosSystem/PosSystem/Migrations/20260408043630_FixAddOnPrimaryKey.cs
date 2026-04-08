using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosSystem.Migrations
{
    /// <inheritdoc />
    public partial class FixAddOnPrimaryKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fix pre-existing issue: AddOn table was missing PRIMARY KEY and AUTO_INCREMENT on Id.
            // MySQL requires AUTO_INCREMENT column to be first in the primary key.
            // Use IF NOT EXISTS pattern: only add PK if it doesn't already exist.
            migrationBuilder.Sql(@"
                SET @pk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AddOn' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
                SET @sql = IF(@pk_exists = 0,
                    'ALTER TABLE `AddOn` MODIFY `Id` int NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`Id`, `TransactionItemTransactionId`, `TransactionItemId`)',
                    'SELECT 1');
                PREPARE stmt FROM @sql;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
