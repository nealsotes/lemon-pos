# TEAM_LEAD_AGENT.md - QuickServe Team Lead Specialist

## Role & Responsibilities

The Team Lead Agent specializes in project management, team coordination, and technical leadership for QuickServe, focusing on:
- Project architecture and technical decisions
- Code review and quality standards
- Team coordination and task assignment
- Sprint planning and iteration management
- Onboarding new team members
- Technical debt management
- Risk assessment and mitigation
- Communication and documentation standards

## Project Overview

QuickServe is a Point of Sale (POS) system designed for restaurant/retail operations with:

### Core Features
- **Point of Sale**: Product selection, cart management, checkout
- **Inventory Management**: Stock tracking, movement history
- **Product Management**: CRUD operations for products and categories
- **Transaction Processing**: Sales recording, payment handling, receipts
- **Reporting**: Sales reports and analytics
- **User Management**: Role-based access (Owner, Employee)
- **PWA Support**: Offline capabilities, installable app
- **Thermal Printing**: Receipt printing support

### Technology Stack Summary
- **Backend**: .NET 8 Web API, Entity Framework Core, MySQL (Pomelo)
- **Frontend**: Angular 20, Angular Material, RxJS, PWA
- **Deployment**: Docker, Railway
- **Authentication**: JWT Bearer tokens
- **Database**: MySQL 8.0

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────┐
│           Angular 20 Frontend (PWA)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  POS UI  │  │ Inventory│  │ Reports │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│         │              │              │         │
│         └──────────────┼──────────────┘         │
│                       │                         │
│              HTTP/REST API                       │
└───────────────────────┼─────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────┐
│           .NET 8 Web API                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │Controllers│  │ Services  │  │Repositories│     │
│  └──────────┘  └──────────┘  └──────────┘      │
│         │              │              │         │
│         └──────────────┼──────────────┘         │
│                       │                         │
│            Entity Framework Core                 │
└───────────────────────┼─────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────┐
│              MySQL Database                      │
│  Products │ Transactions │ Users │ Inventory    │
└─────────────────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Layered Architecture**
   - API Layer (Controllers)
   - Service Layer (Business Logic)
   - Repository Layer (Data Access)
   - Data Layer (Entity Framework)

2. **Repository Pattern**
   - Abstraction of data access
   - Testability
   - Flexibility to change data sources

3. **Dependency Injection**
   - Loose coupling
   - Testability
   - Service lifetime management

4. **Reactive State Management** (Frontend)
   - BehaviorSubject/Observable pattern
   - Centralized state in services
   - Component-level state when appropriate

## Team Structure & Roles

### Recommended Team Composition

- **Backend Developer(s)**: .NET 8, Entity Framework, API development
- **Frontend Developer(s)**: Angular 20, TypeScript, RxJS
- **Full-Stack Developer(s)**: Both backend and frontend
- **DevOps Engineer**: Docker, Railway, CI/CD
- **QA Engineer**: Testing, quality assurance
- **Team Lead**: Technical leadership, coordination

### Role Responsibilities Matrix

| Task | Backend | Frontend | Full-Stack | DevOps | QA | Team Lead |
|------|---------|----------|------------|--------|----|-----------| 
| API Endpoints | ✅ | | ✅ | | | ✅ Review |
| Angular Components | | ✅ | ✅ | | | ✅ Review |
| Database Migrations | ✅ | | ✅ | | | ✅ Review |
| Docker Configuration | | | | ✅ | | ✅ Review |
| Unit Tests | ✅ | ✅ | ✅ | | ✅ | ✅ Review |
| Deployment | | | | ✅ | | ✅ Approve |
| Architecture Decisions | | | | | | ✅ Lead |

## Code Review Guidelines

### Review Checklist

#### Backend Code Review

- [ ] **Architecture**: Follows Repository/Service/Controller pattern
- [ ] **Naming**: PascalCase for classes, methods, properties
- [ ] **Async/Await**: All I/O operations are async
- [ ] **Error Handling**: Proper exception handling and logging
- [ ] **Authorization**: Appropriate `[Authorize]` attributes
- [ ] **Validation**: Input validation at service layer
- [ ] **Logging**: Structured logging with `ILogger<T>`
- [ ] **Dependencies**: Proper dependency injection
- [ ] **Tests**: Unit tests for new functionality
- [ ] **Documentation**: XML comments for public APIs

#### Frontend Code Review

- [ ] **Architecture**: Standalone components, proper service usage
- [ ] **Naming**: kebab-case files, PascalCase classes
- [ ] **RxJS**: Proper subscription management (takeUntil pattern)
- [ ] **Change Detection**: OnPush strategy where appropriate
- [ ] **Type Safety**: Strict TypeScript, proper interfaces
- [ ] **Error Handling**: User-friendly error messages
- [ ] **Offline Support**: localStorage fallback where needed
- [ ] **Accessibility**: ARIA labels, keyboard navigation
- [ ] **Tests**: Component and service tests
- [ ] **Performance**: No memory leaks, efficient rendering

#### Database Review

- [ ] **Migrations**: Proper migration files, reversible
- [ ] **Indexes**: Appropriate indexes on foreign keys and search fields
- [ ] **Relationships**: Correct OnDelete behaviors
- [ ] **Constraints**: Proper string lengths, nullable fields
- [ ] **Seed Data**: Seed data for new entities
- [ ] **Performance**: No N+1 queries, efficient queries

### Review Process

1. **Pull Request Creation**
   - Clear title and description
   - Reference related issues/tasks
   - Link to relevant sub-agent documentation
   - Add screenshots for UI changes

2. **Review Assignment**
   - Assign at least one reviewer from relevant domain
   - Team Lead reviews all PRs
   - Cross-domain PRs need multiple reviewers

3. **Review Feedback**
   - Be constructive and specific
   - Reference code style guidelines
   - Suggest improvements, not just point out issues
   - Approve when standards are met

4. **Merge Criteria**
   - At least one approval
   - All CI checks passing
   - No merge conflicts
   - Tests passing

## Sprint Planning & Task Management

### Sprint Structure

**Recommended Sprint Duration**: 2 weeks

**Sprint Activities**:
- **Day 1**: Sprint planning, task breakdown
- **Days 2-9**: Development work
- **Day 10**: Code freeze, testing
- **Day 11**: Bug fixes, final reviews
- **Day 12**: Deployment, retrospective

### Task Breakdown Guidelines

#### User Story Format

```
As a [user type]
I want to [action]
So that [benefit]

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
```

#### Task Estimation

Use **Story Points** (Fibonacci: 1, 2, 3, 5, 8, 13):

- **1 Point**: Trivial (30 min - 2 hours)
  - Simple bug fix
  - Minor UI tweak
  - Documentation update

- **2 Points**: Small (2-4 hours)
  - Small feature addition
  - Simple API endpoint
  - Component with basic functionality

- **3 Points**: Medium (4-8 hours)
  - Feature with multiple components
  - API with business logic
  - Database migration with seed data

- **5 Points**: Large (1-2 days)
  - Complex feature
  - Multiple API endpoints
  - Full-stack feature implementation

- **8 Points**: Very Large (2-3 days)
  - Major feature
  - Architecture changes
  - Complex integrations

- **13 Points**: Epic (3+ days)
  - Break down into smaller tasks
  - Multiple sprints
  - Requires design/architecture work

### Task Assignment Strategy

1. **Skill-Based Assignment**
   - Match tasks to developer expertise
   - Backend tasks → Backend developers
   - Frontend tasks → Frontend developers
   - Full-stack tasks → Full-stack developers

2. **Learning Opportunities**
   - Pair junior with senior developers
   - Rotate tasks to build skills
   - Cross-training opportunities

3. **Load Balancing**
   - Distribute high and low complexity tasks
   - Consider developer capacity
   - Account for meetings and overhead

## Quality Standards

### Code Quality Metrics

- **Test Coverage**: Minimum 70% for backend, 60% for frontend
- **Code Review**: 100% of code reviewed before merge
- **Build Status**: All builds must pass
- **Linting**: No linting errors
- **Type Safety**: Strict TypeScript, no `any` types

### Performance Standards

- **API Response Time**: < 200ms for simple queries, < 500ms for complex
- **Frontend Load Time**: < 3 seconds initial load
- **Database Queries**: No N+1 queries, proper indexing
- **Bundle Size**: Monitor Angular bundle size, keep under 2MB

### Security Standards

- **Authentication**: All protected endpoints require JWT
- **Authorization**: Role-based access control enforced
- **Input Validation**: All user input validated
- **SQL Injection**: Use parameterized queries (EF Core handles this)
- **XSS Protection**: Angular sanitization, no innerHTML with user data
- **Secrets**: No secrets in code, use environment variables

## Onboarding New Team Members

### Week 1: Setup & Orientation

**Day 1-2: Environment Setup**
- [ ] Clone repository
- [ ] Set up development environment
- [ ] Install required tools (.NET 8 SDK, Node.js 20, MySQL)
- [ ] Run application locally
- [ ] Review `docs/AGENTS.md` and sub-agents

**Day 3-4: Codebase Exploration**
- [ ] Review project structure
- [ ] Understand architecture patterns
- [ ] Review key components (login, POS, checkout)
- [ ] Set up database locally
- [ ] Run tests

**Day 5: First Contribution**
- [ ] Fix a small bug or add minor feature
- [ ] Create pull request
- [ ] Go through code review process

### Week 2: Deep Dive

- [ ] Review domain-specific sub-agents
- [ ] Pair programming session
- [ ] Work on a small feature
- [ ] Attend code review sessions
- [ ] Understand deployment process

### Onboarding Resources

1. **Documentation**
   - `docs/AGENTS.md` - Main project documentation
   - `docs/BACKEND_AGENT.md` - Backend patterns
   - `docs/FRONTEND_AGENT.md` - Frontend patterns
   - `docs/HOW_TO_USE_SUB_AGENTS.md` - How to use documentation

2. **Code Examples**
   - Existing controllers, services, components
   - Test files as examples

3. **Tools & Setup**
   - VS Code / Visual Studio setup
   - Git workflow
   - Railway account setup

## Technical Debt Management

### Debt Categories

1. **Code Quality**
   - Refactoring opportunities
   - Code duplication
   - Complex methods that need simplification

2. **Testing**
   - Missing test coverage
   - Flaky tests
   - Outdated test patterns

3. **Documentation**
   - Missing documentation
   - Outdated documentation
   - Incomplete API documentation

4. **Dependencies**
   - Outdated packages
   - Security vulnerabilities
   - Unused dependencies

5. **Performance**
   - Slow queries
   - Large bundle sizes
   - Memory leaks

### Debt Management Process

1. **Identification**
   - Code review findings
   - Retrospective discussions
   - Performance monitoring
   - Security scans

2. **Prioritization**
   - **High**: Security issues, critical bugs
   - **Medium**: Performance issues, code quality
   - **Low**: Documentation, minor refactoring

3. **Tracking**
   - Create issues/tasks for debt items
   - Tag with "technical-debt"
   - Estimate effort

4. **Resolution**
   - Allocate 20% of sprint capacity to debt
   - Address high-priority items first
   - Regular debt reduction sprints

## Risk Management

### Common Risks & Mitigation

#### 1. Database Migration Failures
**Risk**: Production data loss, downtime
**Mitigation**:
- Test migrations on staging
- Backup database before migration
- Use reversible migrations
- Have rollback plan

#### 2. Deployment Failures
**Risk**: Application downtime, broken features
**Mitigation**:
- Test Docker builds locally
- Verify environment variables
- Monitor Railway logs
- Have rollback procedure

#### 3. Security Vulnerabilities
**Risk**: Data breach, unauthorized access
**Mitigation**:
- Regular dependency updates
- Security scanning tools
- Code review for security
- Penetration testing

#### 4. Performance Degradation
**Risk**: Slow application, poor user experience
**Mitigation**:
- Performance monitoring
- Load testing
- Query optimization
- Bundle size monitoring

#### 5. Team Knowledge Gaps
**Risk**: Single point of failure, slow development
**Mitigation**:
- Documentation
- Code reviews
- Pair programming
- Knowledge sharing sessions

## Communication Standards

### Daily Standups

**Format**: 15 minutes, same time daily
**Questions**:
1. What did I complete yesterday?
2. What will I work on today?
3. Are there any blockers?

**Best Practices**:
- Keep it brief
- Focus on blockers
- Update task status
- Share relevant information

### Sprint Planning

**Agenda**:
1. Review previous sprint
2. Review backlog
3. Estimate new tasks
4. Assign tasks
5. Set sprint goals

**Duration**: 2-3 hours for 2-week sprint

### Retrospectives

**Format**: End of each sprint
**Structure**:
1. What went well?
2. What could be improved?
3. Action items for next sprint

**Outcomes**:
- Identify improvements
- Create action items
- Update processes
- Celebrate successes

### Documentation Updates

**When to Update**:
- New features added
- Architecture changes
- Process changes
- Pattern changes

**What to Update**:
- Relevant sub-agent documentation in `docs/` folder
- `docs/AGENTS.md` if structure changes
- README files
- API documentation

## Decision Making Framework

### Decision Types

1. **Technical Decisions**
   - Architecture choices
   - Technology selection
   - Pattern adoption
   - **Process**: Team discussion, Team Lead approval

2. **Process Decisions**
   - Workflow changes
   - Tool selection
   - **Process**: Team consensus, document decision

3. **Feature Decisions**
   - Feature scope
   - Priority
   - **Process**: Product Owner input, team estimation

### Decision Documentation

For significant decisions, document:
- **Problem**: What problem are we solving?
- **Options**: What options were considered?
- **Decision**: What was decided?
- **Rationale**: Why was this chosen?
- **Impact**: What's the impact?
- **Date**: When was this decided?

## Metrics & Monitoring

### Key Metrics to Track

1. **Velocity**
   - Story points completed per sprint
   - Track trends over time

2. **Code Quality**
   - Test coverage percentage
   - Code review turnaround time
   - Bug rate (bugs per feature)

3. **Performance**
   - API response times
   - Frontend load times
   - Database query performance

4. **Deployment**
   - Deployment frequency
   - Deployment success rate
   - Rollback frequency

5. **Team Health**
   - Sprint goal completion rate
   - Team satisfaction
   - Knowledge sharing frequency

### Monitoring Tools

- **Railway**: Application logs, deployment status
- **GitHub/GitLab**: Code metrics, PR reviews
- **Testing Tools**: Coverage reports
- **Performance Tools**: Application performance monitoring

## Best Practices Summary

### For Team Leads

1. **Lead by Example**
   - Write clean, well-tested code
   - Follow all guidelines
   - Participate in code reviews

2. **Foster Learning**
   - Encourage questions
   - Share knowledge
   - Provide feedback

3. **Maintain Balance**
   - Technical work vs. management
   - Individual vs. team needs
   - Short-term vs. long-term

4. **Communicate Clearly**
   - Clear expectations
   - Regular updates
   - Transparent decisions

5. **Remove Blockers**
   - Identify blockers early
   - Help resolve issues
   - Escalate when needed

### For the Team

1. **Follow Standards**
   - Code style guidelines
   - Review processes
   - Documentation standards

2. **Communicate Proactively**
   - Share blockers early
   - Ask questions
   - Provide updates

3. **Continuous Improvement**
   - Suggest improvements
   - Learn from mistakes
   - Share knowledge

4. **Quality First**
   - Write tests
   - Review thoroughly
   - Test before submitting

## References

- **Main Documentation**: `docs/AGENTS.md` (if exists)
- **Backend Guidelines**: `docs/BACKEND_AGENT.md`
- **Frontend Guidelines**: `docs/FRONTEND_AGENT.md`
- **Database Guidelines**: `docs/DATABASE_AGENT.md`
- **DevOps Guidelines**: `docs/DEVOPS_AGENT.md`
- **Testing Guidelines**: `docs/TESTING_AGENT.md`
- **Usage Guide**: `docs/HOW_TO_USE_SUB_AGENTS.md`

---

**Last Updated**: 2025-01-26
**Maintained By**: Team Lead
**Review Frequency**: Quarterly or when major changes occur
