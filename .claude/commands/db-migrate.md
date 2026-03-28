# Database Migration Helper

Guide through creating and applying an EF Core migration.

1. **Review pending changes:**
   - Check for modified model files in `backend/PosSystem/PosSystem/Core/Models/`
   - Check for DbContext configuration changes in `backend/PosSystem/PosSystem/Infrastructure/Data/`
   - Summarize what schema changes are pending

2. **Suggest migration name:**
   - Based on the model changes, suggest a descriptive PascalCase migration name
   - Examples: `AddLoyaltyPoints`, `UpdateProductPricing`, `AddIngredientCategories`

3. **Create migration** (after user confirms the name):
   ```bash
   cd backend/PosSystem/PosSystem && dotnet ef migrations add <Name> --context PosSystemDbContext
   ```

4. **Review the generated migration:**
   - Read the new migration file in `Migrations/`
   - Verify the Up() and Down() methods look correct
   - Flag any potential data loss operations (column drops, type changes)

5. **Apply migration** (only after user approves):
   ```bash
   cd backend/PosSystem/PosSystem && dotnet ef database update --context PosSystemDbContext
   ```

6. Confirm the migration was applied successfully.
