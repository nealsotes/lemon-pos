using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PosSystem.Migrations
{
    /// <inheritdoc />
    public partial class AddProductHotColdAndAddOnsToggles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AddOnsJson",
                table: "Products",
                type: "longtext",
                nullable: false,
                defaultValue: "[]")
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<bool>(
                name: "HasAddOns",
                table: "Products",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HasHotCold",
                table: "Products",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            // Backward compatibility: set HasHotCold for existing products with hot/cold prices
            migrationBuilder.Sql("UPDATE Products SET HasHotCold = 1 WHERE HotPrice IS NOT NULL OR ColdPrice IS NOT NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AddOnsJson",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "HasAddOns",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "HasHotCold",
                table: "Products");
        }
    }
}
