using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosSystem.Migrations
{
    /// <inheritdoc />
    /// <remarks>
    /// LB-005 (pre-existing drift DR-003): Transactions.SyncedAt entered the model in
    /// commit 6195f4f together with IdempotencyKey, but unlike IdempotencyKey it shipped
    /// no migration and no Program.cs self-heal ALTER, while
    /// TransactionRepository.AddAsync sets and inserts SyncedAt on every sale - so a
    /// database built solely from the migration chain fails every sale INSERT with
    /// "Unknown column 'SyncedAt' in 'field list'". The D1 pass already recorded the
    /// column in PosSystemDbContextModelSnapshot, which makes the gap permanently
    /// invisible to 'dotnet ef migrations add'; this migration is therefore hand-built.
    /// It mirrors the proven AddTransactionIdempotencyKey migration minus the index:
    /// SyncedAt is a receipt-time stamp, not a queried dedupe key, so it needs no index.
    /// No database default either - the column stays NULL until
    /// TransactionRepository stamps it with DateTime.UtcNow.
    /// </remarks>
    public partial class AddTransactionSyncedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "SyncedAt",
                table: "Transactions",
                type: "datetime(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SyncedAt",
                table: "Transactions");
        }
    }
}
