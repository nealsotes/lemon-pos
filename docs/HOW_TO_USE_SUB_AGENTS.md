# How to Use Sub-Agents - QuickServe POS System

This guide explains how to effectively use the specialized sub-agent documentation files in your development workflow.

## Quick Start

### For AI Assistants (Cursor, GitHub Copilot, etc.)

When working with an AI assistant, you can reference specific sub-agents in your prompts:

**Example Prompts:**

```
"Based on docs/BACKEND_AGENT.md, create a new ProductsController with CRUD operations"
```

```
"Following docs/FRONTEND_AGENT.md patterns, add a new cart component with RxJS state management"
```

```
"Using docs/DATABASE_AGENT.md guidelines, create a migration to add a new column to the Products table"
```

```
"According to docs/DEVOPS_AGENT.md, help me troubleshoot my Railway deployment issue"
```

```
"Following docs/TESTING_AGENT.md, write unit tests for the ProductService class"
```

### For Developers

1. **Identify your task domain** (backend, frontend, database, deployment, testing)
2. **Open the relevant sub-agent file** (`docs/BACKEND_AGENT.md`, `docs/FRONTEND_AGENT.md`, etc.)
3. **Find the relevant section** (patterns, examples, best practices)
4. **Copy and adapt the code examples** to your needs

## Usage Scenarios

### Scenario 1: Adding a New Backend API Endpoint

**Step 1**: Open `docs/BACKEND_AGENT.md`

**Step 2**: Follow the Controller Pattern section:
```csharp
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Employee")]
public class MyNewController : ControllerBase
{
    // Use the pattern from docs/BACKEND_AGENT.md
}
```

**Step 3**: Create the service following the Service Pattern section

**Step 4**: Create the repository following the Repository Pattern section

**Step 5**: Register services in `Program.cs` as shown in the examples

### Scenario 2: Creating a New Angular Component

**Step 1**: Open `docs/FRONTEND_AGENT.md`

**Step 2**: Use the Standalone Component Pattern:
```typescript
@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [CommonModule, FormsModule],
  // ... following the pattern
})
```

**Step 3**: Create a service using the Service Pattern with BehaviorSubject

**Step 4**: Add route guard if needed (see Route Guard Pattern)

### Scenario 3: Database Schema Change

**Step 1**: Open `docs/DATABASE_AGENT.md`

**Step 2**: Update your model in `Core/Models/`

**Step 3**: Update `PosSystemDbContext` following the DbContext Configuration pattern

**Step 4**: Create migration:
```bash
dotnet ef migrations add MyMigrationName --context PosSystemDbContext
```

**Step 5**: Review migration file and apply:
```bash
dotnet ef database update --context PosSystemDbContext
```

### Scenario 4: Deployment to Railway

**Step 1**: Open `docs/DEVOPS_AGENT.md`

**Step 2**: Check Deployment Checklist section

**Step 3**: Verify environment variables are set in Railway

**Step 4**: Follow the Railway Deployment workflow

**Step 5**: Use Troubleshooting section if issues arise

### Scenario 5: Writing Tests

**Step 1**: Open `docs/TESTING_AGENT.md`

**Step 2**: Choose appropriate test type (Unit, Integration)

**Step 3**: Use the test patterns provided:
- Service tests → Service Unit Tests section
- Controller tests → Controller Unit Tests section
- Component tests → Component Tests section

**Step 4**: Run tests using commands from Running Tests section

## Practical Examples

### Example 1: "I need to add a new endpoint for inventory management"

**What to do:**
1. Read `docs/BACKEND_AGENT.md` → Controller Pattern section
2. Create `InventoryController` following the pattern
3. Create `IInventoryService` and `InventoryService` following Service Pattern
4. Create `IInventoryRepository` and `InventoryRepository` following Repository Pattern
5. Register in `Program.cs` as shown in Dependency Injection section
6. Write tests using `docs/TESTING_AGENT.md` → Service Unit Tests section

### Example 2: "I need to add a shopping cart feature to the frontend"

**What to do:**
1. Read `docs/FRONTEND_AGENT.md` → State Management section (Cart Service Example)
2. Create `CartService` using BehaviorSubject pattern
3. Create `CartComponent` using Standalone Component Pattern
4. Add route guard if authentication needed (Route Guard Pattern)
5. Write tests using `docs/TESTING_AGENT.md` → Component Tests section

### Example 3: "I need to add a new table for customer loyalty points"

**What to do:**
1. Read `docs/DATABASE_AGENT.md` → Entity Framework Patterns section
2. Create `LoyaltyPoint` model in `Core/Models/`
3. Add DbSet to `PosSystemDbContext`
4. Configure entity in `OnModelCreating` method
5. Create migration: `dotnet ef migrations add AddLoyaltyPoints`
6. Apply migration: `dotnet ef database update`
7. Add seed data if needed (Seed Data section)

### Example 4: "My Railway deployment is failing"

**What to do:**
1. Open `docs/DEVOPS_AGENT.md` → Troubleshooting section
2. Check Build Failures subsection
3. Check Runtime Issues subsection
4. Verify Database Connection subsection
5. Review Deployment Checklist
6. Check Railway logs: `railway logs`

### Example 5: "I need to write tests for my new service"

**What to do:**
1. Open `docs/TESTING_AGENT.md` → Service Unit Tests section
2. Copy the test project setup if needed
3. Use the ProductServiceTests example as a template
4. Adapt for your service
5. Run tests: `dotnet test`

## Integration with AI Assistants

### Method 1: Direct Reference in Prompts

```
"Using the patterns from docs/BACKEND_AGENT.md, help me create a new 
OrdersController with the following endpoints: GET /api/orders, 
POST /api/orders, GET /api/orders/{id}"
```

### Method 2: Context Loading

Some AI assistants can load context files. You can say:
```
"Load docs/BACKEND_AGENT.md and help me create a new service following 
the Service Pattern section"
```

### Method 3: Cross-Reference

When working on a feature that spans multiple domains:
```
"Following docs/BACKEND_AGENT.md for the API endpoint and docs/FRONTEND_AGENT.md 
for the component, help me create a complete feature for managing 
product categories"
```

## Workflow Integration

### Daily Development Workflow

1. **Start of task**: Identify which sub-agent(s) you need
2. **During development**: Keep relevant sub-agent open for reference
3. **Code review**: Verify code follows sub-agent patterns
4. **Testing**: Use `docs/TESTING_AGENT.md` patterns
5. **Deployment**: Follow `docs/DEVOPS_AGENT.md` checklist

### Code Review Checklist

- [ ] Does backend code follow `docs/BACKEND_AGENT.md` patterns?
- [ ] Does frontend code follow `docs/FRONTEND_AGENT.md` patterns?
- [ ] Are database changes documented in `docs/DATABASE_AGENT.md` style?
- [ ] Are tests written following `docs/TESTING_AGENT.md` patterns?
- [ ] Is deployment configuration correct per `docs/DEVOPS_AGENT.md`?
- [ ] Does code meet quality standards from `docs/TEAM_LEAD_AGENT.md`?

## Tips for Effective Use

### 1. Bookmark Key Sections
- Bookmark the "Code Patterns" section in each sub-agent
- Bookmark the "Common Tasks" section for quick reference

### 2. Copy Code Templates
- Keep a folder of code templates based on sub-agent patterns
- Adapt templates for new features

### 3. Cross-Reference
- When working on a full-stack feature, use multiple sub-agents
- Example: Backend API (BACKEND_AGENT) + Frontend Component (FRONTEND_AGENT) + Tests (TESTING_AGENT)

### 4. Update as You Learn
- If you discover better patterns, update the relevant sub-agent
- Keep sub-agents synchronized with actual codebase

### 5. Share with Team
- Ensure all team members know about sub-agents
- Use in code review discussions
- Reference in pull request descriptions

## Common Patterns Reference

### Quick Lookup Table

| I want to... | Use this sub-agent | Go to section |
|--------------|-------------------|----------------|
| Create API endpoint | docs/BACKEND_AGENT | Controller Pattern |
| Create Angular component | docs/FRONTEND_AGENT | Standalone Component Pattern |
| Add database table | docs/DATABASE_AGENT | Entity Framework Patterns |
| Deploy to Railway | docs/DEVOPS_AGENT | Railway Deployment |
| Write unit tests | docs/TESTING_AGENT | Service Unit Tests / Component Tests |
| Set up authentication | docs/BACKEND_AGENT | Authentication & Authorization |
| Add PWA features | docs/FRONTEND_AGENT | PWA Features |
| Create migration | docs/DATABASE_AGENT | Migration Management |
| Fix build issues | docs/DEVOPS_AGENT | Troubleshooting |
| Mock dependencies | docs/TESTING_AGENT | Best Practices |
| Plan sprint | docs/TEAM_LEAD_AGENT | Sprint Planning & Task Management |
| Review code | docs/TEAM_LEAD_AGENT | Code Review Guidelines |
| Onboard new member | docs/TEAM_LEAD_AGENT | Onboarding New Team Members |
| Manage technical debt | docs/TEAM_LEAD_AGENT | Technical Debt Management |
| Make architecture decision | docs/TEAM_LEAD_AGENT | Decision Making Framework |

## Advanced Usage

### Combining Multiple Sub-Agents

**Example: Full Feature Development**

Creating a "Reports" feature:

1. **Backend** (`docs/BACKEND_AGENT.md`):
   - Create `ReportsController`
   - Create `IReportsService` and `ReportsService`
   - Add repository if needed

2. **Database** (`docs/DATABASE_AGENT.md`):
   - Add any necessary database views or stored procedures
   - Optimize queries for report generation

3. **Frontend** (`docs/FRONTEND_AGENT.md`):
   - Create `ReportsComponent`
   - Add routing
   - Use Angular Material for tables/charts

4. **Testing** (`docs/TESTING_AGENT.md`):
   - Write unit tests for service
   - Write component tests
   - Write integration tests for API

5. **Deployment** (`docs/DEVOPS_AGENT.md`):
   - Verify build succeeds
   - Deploy to Railway
   - Monitor logs

## Getting Help

If a sub-agent doesn't cover your specific case:

1. Check the main `docs/AGENTS.md` for general patterns
2. Look at existing code in the project for similar patterns
3. Update the relevant sub-agent with the new pattern for future reference
4. Ask the team or AI assistant with context from the sub-agent

## Maintenance

- **Keep sub-agents updated** as the codebase evolves
- **Add new patterns** you discover that work well
- **Remove outdated patterns** that are no longer used
- **Cross-reference** between sub-agents when patterns overlap

---

**Remember**: Sub-agents are living documents. Update them as you learn better patterns and practices!
