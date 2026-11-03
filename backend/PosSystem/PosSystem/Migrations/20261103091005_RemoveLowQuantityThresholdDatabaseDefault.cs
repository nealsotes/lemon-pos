using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosSystem.Migrations
{
    /// <inheritdoc />
    /// <remarks>
    /// D1: the previous database default (10) on Products.LowQuantityThreshold made EF
    /// omit the column from INSERTs whose CLR value is the sentinel 0, so a
    /// deliberately imported/created threshold of 0 stored as 10. The snapshot also
    /// previously missed Transaction.SyncedAt (model-carried but migration-missing —
    /// pre-existing drift, DR-003); this migration's Up() is deliberately scoped to
    /// the default drop only, and the app's startup self-healing (Program.cs) plus
    /// EnsureCreatedAsync cover existing/fresh databases respectively.
    /// </remarks>
    public partial class RemoveLowQuantityThresholdDatabaseDefault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "LowQuantityThreshold",
                table: "Products",
                type: "int",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int",
                oldDefaultValue: 10);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "LowQuantityThreshold",
                table: "Products",
                type: "int",
                nullable: false,
                defaultValue: 10,
                oldClrType: typeof(int),
                oldType: "int");
        }
    }
}