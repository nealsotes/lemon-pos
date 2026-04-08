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
            // Fix pre-existing issue: AddOn table missing PRIMARY KEY or having Id not first in PK.
            // MySQL requires AUTO_INCREMENT column to be first in the primary key.
            migrationBuilder.Sql(@"
DROP PROCEDURE IF EXISTS FixAddOnPK;
", suppressTransaction: true);

            migrationBuilder.Sql(@"
CREATE PROCEDURE FixAddOnPK()
BEGIN
    DECLARE pk_count INT;
    SELECT COUNT(*) INTO pk_count FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AddOn' AND CONSTRAINT_TYPE = 'PRIMARY KEY';
    IF pk_count > 0 THEN
        ALTER TABLE `AddOn` DROP PRIMARY KEY;
    END IF;
    ALTER TABLE `AddOn` MODIFY `Id` int NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (`Id`, `TransactionItemTransactionId`, `TransactionItemId`);
END;
", suppressTransaction: true);

            migrationBuilder.Sql("CALL FixAddOnPK();", suppressTransaction: true);
            migrationBuilder.Sql("DROP PROCEDURE IF EXISTS FixAddOnPK;", suppressTransaction: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
