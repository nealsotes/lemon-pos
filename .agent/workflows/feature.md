---
description: Orchestrates a full feature implementation across backend, frontend, and database.
---

1. Analyze the feature request to identify required changes across all layers.
2. Read `docs/TEAM_LEAD_AGENT.md` to ensure architectural alignment.
3. Define the "API Contract" (Request/Response DTOs and Endpoints).
4. Generate a multi-step checklist:
   - **Database**: Schema changes and migrations (`docs/DATABASE_AGENT.md`).
   - **Backend**: Repository, Service, and Controller implementation (`docs/BACKEND_AGENT.md`).
   - **Frontend**: Service, Component, and UI implementation (`docs/FRONTEND_AGENT.md`).
   - **Testing**: Unit and integration test plan (`docs/TESTING_AGENT.md`).
5. Ask the user which step to start with or if they want to proceed in parallel.
