# Sub-Agents Overview - QuickServe POS System

This document provides an overview of the specialized sub-agents created for the QuickServe POS system. Each sub-agent focuses on a specific domain and provides detailed guidelines, patterns, and best practices.

## Available Sub-Agents

### 1. BACKEND_AGENT.md
**Focus**: .NET 8 Web API Backend Development

**Responsibilities**:
- RESTful API design and implementation
- Entity Framework Core with MySQL
- Repository and Service layer patterns
- JWT authentication and authorization
- Middleware development
- Error handling

**Key Topics**:
- Controller, Service, and Repository patterns
- Database operations and migrations
- Authentication/authorization setup
- Exception handling middleware
- Environment configuration

**When to Use**: When working on backend API endpoints, services, repositories, or database-related backend code.

---

### 2. FRONTEND_AGENT.md
**Focus**: Angular 20 Frontend Development

**Responsibilities**:
- Standalone component architecture
- Reactive programming with RxJS
- Angular Material UI components
- PWA (Progressive Web App) features
- State management
- HTTP interceptors and guards

**Key Topics**:
- Standalone component patterns
- Service patterns with BehaviorSubject
- Route guards and HTTP interceptors
- PWA configuration and service workers
- Angular Material integration
- Offline support strategies

**When to Use**: When working on Angular components, services, routing, UI components, or PWA features.

---

### 3. DATABASE_AGENT.md
**Focus**: MySQL Database Operations

**Responsibilities**:
- Entity Framework Core migrations
- Database schema design and optimization
- MySQL-specific features
- Seed data management
- Connection configuration
- Query optimization

**Key Topics**:
- Migration creation and management
- DbContext configuration
- Entity relationships and constraints
- Seed data patterns
- Connection string configuration
- Performance optimization

**When to Use**: When working on database schema changes, migrations, seed data, or database configuration.

---

### 4. DEVOPS_AGENT.md
**Focus**: Deployment and Infrastructure

**Responsibilities**:
- Docker containerization
- Railway platform deployment
- Environment variable management
- Build optimization
- CI/CD pipelines
- Production deployment

**Key Topics**:
- Multi-stage Docker builds
- Railway configuration
- Build caching strategies
- Deployment workflows
- Troubleshooting deployment issues
- Monitoring and logging

**When to Use**: When working on deployment, Docker configuration, Railway setup, or build optimization.

---

### 5. TESTING_AGENT.md
**Focus**: Testing Strategies

**Responsibilities**:
- Unit testing (backend and frontend)
- Integration testing
- End-to-end testing
- Test coverage metrics
- Mocking and test data
- CI/CD testing

**Key Topics**:
- xUnit testing for .NET
- Jasmine/Karma testing for Angular
- Mocking patterns (Moq, Jasmine spies)
- Integration test setup
- Test coverage goals
- Continuous integration

**When to Use**: When writing tests, setting up test infrastructure, or improving test coverage.

---

### 6. TEAM_LEAD_AGENT.md
**Focus**: Project Management & Team Leadership

**Responsibilities**:
- Project architecture and technical decisions
- Code review and quality standards
- Team coordination and task assignment
- Sprint planning and iteration management
- Onboarding new team members
- Technical debt management
- Risk assessment and mitigation
- Communication and documentation standards

**Key Topics**:
- Architecture overview and patterns
- Code review guidelines and checklists
- Sprint planning and task estimation
- Quality standards and metrics
- Onboarding processes
- Technical debt management
- Risk management strategies
- Communication frameworks

**When to Use**: When managing the team, planning sprints, conducting code reviews, making architectural decisions, or onboarding new members.

---

## How to Use Sub-Agents

### For AI Agents
When working on a specific domain, reference the appropriate sub-agent documentation:
- **Backend work** → `BACKEND_AGENT.md`
- **Frontend work** → `FRONTEND_AGENT.md`
- **Database changes** → `DATABASE_AGENT.md`
- **Deployment issues** → `DEVOPS_AGENT.md`
- **Writing tests** → `TESTING_AGENT.md`

### For Developers
Each sub-agent provides:
1. **Code Patterns**: Copy-paste ready examples
2. **Best Practices**: Domain-specific guidelines
3. **Common Tasks**: Step-by-step workflows
4. **Troubleshooting**: Solutions to common issues

### Cross-Reference
All sub-agents reference the main `docs/AGENTS.md` for:
- Overall project structure
- General code style guidelines
- Project-wide conventions
- Build commands

## Quick Reference Matrix

| Task | Primary Agent | Secondary Agent |
|------|--------------|-----------------|
| Create new API endpoint | BACKEND_AGENT | - |
| Add new Angular component | FRONTEND_AGENT | - |
| Database migration | DATABASE_AGENT | BACKEND_AGENT |
| Deploy to Railway | DEVOPS_AGENT | - |
| Write unit tests | TESTING_AGENT | BACKEND_AGENT or FRONTEND_AGENT |
| Configure authentication | BACKEND_AGENT | - |
| Set up PWA features | FRONTEND_AGENT | - |
| Optimize database queries | DATABASE_AGENT | BACKEND_AGENT |
| Fix build issues | DEVOPS_AGENT | BACKEND_AGENT or FRONTEND_AGENT |
| Add service worker | FRONTEND_AGENT | - |
| Configure CORS | BACKEND_AGENT | DEVOPS_AGENT |

## Integration with Main AGENTS.md

The main `docs/AGENTS.md` file provides:
- **High-level overview** of the entire project
- **General patterns** that apply across all domains
- **Directory structure** for the whole project
- **Build commands** for both frontend and backend

Sub-agents provide:
- **Deep dives** into specific domains
- **Detailed examples** for common tasks
- **Domain-specific best practices**
- **Troubleshooting guides** for that domain

## Maintenance

When updating the project:
1. Update the relevant sub-agent if patterns change
2. Update `docs/AGENTS.md` if project structure changes
3. Keep sub-agents synchronized with actual codebase
4. Add new sub-agents if new domains emerge

## Contributing

When adding new features or patterns:
1. Check if a sub-agent already covers it
2. Add to the appropriate sub-agent if it exists
3. Create a new sub-agent if it's a new domain
4. Update this README to include the new sub-agent

---

**Last Updated**: 2025-01-26
**Project**: QuickServe POS System
**Main Documentation**: `docs/AGENTS.md`
