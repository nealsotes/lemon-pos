---
name: testing
description: Use when writing or reviewing tests for either stack. The canonical source for test strategy across the repo — unit vs integration, test naming, mocking, edge cases, regression tests, acceptance criteria, and coverage targets. Backend is xUnit + Moq; frontend is Jasmine + Karma. `aspnet-api` and `angular` link here.
---

# Testing — xUnit/Moq (backend) + Jasmine/Karma (frontend)

TRIGGER when: adding/updating tests, deciding what to test, or reviewing test quality/coverage on either stack.

DO NOT TRIGGER when: the question is production code structure (use the relevant stack skill).

This is the single home for test strategy. Stack skills point here rather than restating it.

## What to test at each layer (backend)

| Layer | Test type | Mock | Real |
|-------|-----------|------|------|
| Service | Unit | repositories (`Mock<IXRepository>`) | the service |
| Repository / DbContext | Integration | — | EF Core `InMemoryDatabase` |
| Controller | Unit | the service (`Mock<IXService>`) | the controller |

## Naming (both stacks by intent)

`MethodName_Scenario_ExpectedBehavior`:

```
GetProductByIdAsync_WithInvalidId_ThrowsArgumentException
CreateProduct_WhenNameMissing_ReturnsBadRequest
```

## Backend — xUnit + Moq

- Arrange-Act-Assert with section comments.
- Mock dependencies via their interfaces; assert both the return **and** the interaction (`mock.Verify(...)`).

```csharp
[Fact]
public async Task GetProductByIdAsync_WithInvalidId_ThrowsArgumentException()
{
    // Arrange
    var repo = new Mock<IProductRepository>();
    repo.Setup(r => r.GetByIdAsync("bad")).ReturnsAsync((Product?)null);
    var sut = new ProductService(repo.Object);

    // Act + Assert
    await Assert.ThrowsAsync<ArgumentException>(() => sut.GetProductByIdAsync("bad"));
}
```

- Run from `backend/PosSystem/`: `dotnet test`. Single class/method: `dotnet test --filter "FullyQualifiedName~ProductServiceTests"`.

## Frontend — Jasmine + Karma

- `describe` per component/service; `beforeEach` with `TestBed.configureTestingModule`.
- Mock collaborators with `jasmine.createSpyObj` + `{ provide: X, useValue: mockX }`.
- Headless (CI): `npx ng test --browsers=ChromeHeadless --watch=false`. Coverage: `npm test -- --code-coverage`.

## Edge cases — always include

- Null/empty/missing inputs; not-found ids; boundary values (0, negative, max — e.g. the 5 MB image cap).
- Role/authorization branches (Owner vs Employee vs Admin).
- Money/precision (`decimal(18,2)`) and the VAT rule — **prices already include 12% VAT; assert reports/checkout do not add it**.
- Offline/error paths on the frontend (localStorage fallback, error snackbar).

## Regression tests

- Every bug fix ships with a test that fails before the fix and passes after. Name it for the scenario (e.g. a `discount double-count` fix gets a test asserting the total is counted once).

## Acceptance criteria → tests

- Translate each acceptance-criterion checkbox into at least one test. A feature isn't done until its criteria are expressed as passing tests.

## Coverage targets

| Area | Target |
|------|--------|
| Backend overall | 70% |
| Auth & transactions | 90%+ |
| Frontend | 60% |

Coverage is a floor, not the goal — a covered line with no assertion proves nothing.

## Related skills

- `aspnet-api`, `entity-framework` — backend units under test
- `angular`, `state-management` — frontend units under test
- `git-workflow` — tests must be green before merge

## Behavior

- When you change behavior, update or add tests in the same change; never leave a failing test "for later".
- If a strict mock/spy is missing a setup after a signature change, add the setup — don't loosen the mock.
- Prefer a few meaningful assertions over many trivial ones.
