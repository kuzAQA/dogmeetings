# Graph Report - pet  (2026-08-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 447 nodes · 882 edges · 32 communities (23 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d2f0604`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- withDb
- Home
- devDependencies
- privateJson
- AdminPage
- package.json
- compilerOptions
- admin-auth.ts
- app/page.tsx
- session.ts
- walks/route.ts
- cleanup-expired-walks.mjs
- [token]/page.tsx
- TimeDropdown.tsx
- walks.ts
- worker/index.ts
- site.spec.ts
- DropdownSelect.tsx
- app/layout.tsx
- bootstrapSession
- WalkPlace.tsx
- WalkSetupStepper.tsx
- dogsfather/layout.tsx
- migrate.sh
- next.config.ts
- next-env.d.ts
- backup.sh

## God Nodes (most connected - your core abstractions)
1. `Home()` - 55 edges
2. `withDb()` - 54 edges
3. `privateJson()` - 43 edges
4. `getClientSession()` - 27 edges
5. `isSameOriginRequest()` - 24 edges
6. `AdminPage()` - 17 edges
7. `authorizeAdminRequest()` - 15 edges
8. `compilerOptions` - 15 edges
9. `databaseErrorMessage()` - 13 edges
10. `PATCH()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `withDb()`  [EXTRACTED]
  app/api/health/route.ts → db/index.ts
- `POST()` --calls--> `privateJson()`  [EXTRACTED]
  app/api/location-requests/route.ts → lib/session.ts
- `GET()` --calls--> `withDb()`  [EXTRACTED]
  app/api/pet-photo/route.ts → db/index.ts
- `PATCH()` --calls--> `privateJson()`  [EXTRACTED]
  app/api/pet-shares/route.ts → lib/session.ts
- `POST()` --calls--> `privateJson()`  [EXTRACTED]
  app/api/pet-shares/route.ts → lib/session.ts

## Import Cycles
- None detected.

## Communities (32 total, 9 thin omitted)

### Community 0 - "withDb"
Cohesion: 0.10
Nodes (46): GET(), databaseError(), normalizeText(), POST(), GET(), GET(), createShareToken(), ownedPet() (+38 more)

### Community 1 - "Home"
Cohesion: 0.06
Nodes (31): Home(), addPet(), beginDockSlide(), beginFormClose(), chooseLocationCity(), chooseLocationDistrict(), closeDockWalkAnnouncement(), continueToRequiredPet() (+23 more)

### Community 2 - "devDependencies"
Cohesion: 0.04
Nodes (47): @cloudflare/vite-plugin, drizzle-kit, eslint, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, globals (+39 more)

### Community 3 - "privateJson"
Cohesion: 0.15
Nodes (27): DELETE(), GET(), PATCH(), requestId(), adminError(), allowedPhotoTypes, DELETE(), GET() (+19 more)

### Community 4 - "AdminPage"
Cohesion: 0.09
Nodes (23): AdminPage(), adminHeaderActions(), closePetEditor(), disableNotifications(), saveAdminPet(), sectionHeading(), signIn(), signOut() (+15 more)

### Community 5 - "package.json"
Cohesion: 0.07
Nodes (29): drizzle-orm, lucide-react, @ncdai/react-wheel-picker, dependencies, drizzle-orm, lucide-react, @ncdai/react-wheel-picker, pg (+21 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+19 more)

### Community 7 - "admin-auth.ts"
Cohesion: 0.22
Nodes (23): GET(), DELETE(), GET(), POST(), adminRateLimitKey(), challengeCookieName(), clearAdminLoginChallengeCookie(), clearAdminSessionCookie() (+15 more)

### Community 8 - "app/page.tsx"
Cohesion: 0.08
Nodes (24): allowedPhotoTypes, AppNavigationState, AvailableLocation, BrowserGuidePlatform, clearLegacySessionData(), defaultLocation, DockMotion, DockPanelSection (+16 more)

### Community 9 - "session.ts"
Cohesion: 0.20
Nodes (22): databaseError(), GET(), knownLocation(), normalizeLocation(), PATCH(), POST(), bytesToHex(), ClientSession (+14 more)

### Community 10 - "walks/route.ts"
Cohesion: 0.38
Nodes (13): capitalizePlaceName(), cleanComment(), cleanPlaceName(), databaseError(), DELETE(), GET(), moscowDate(), normalizePlaceName() (+5 more)

### Community 11 - "cleanup-expired-walks.mjs"
Cohesion: 0.33
Nodes (7): cleanupExpiredData(), connectionString(), formatMoscowDateTime(), nextRunAt(), runAndSchedule(), runOnce, scheduleNextRun()

### Community 12 - "[token]/page.tsx"
Cohesion: 0.28
Nodes (7): ensureClientSession(), GuidePlatform, SharedPet, SharedPetPage(), acceptPet(), continueFromBrowserGuide(), ShareStage

### Community 13 - "TimeDropdown.tsx"
Cohesion: 0.38
Nodes (6): hourOptions, minuteOptions, nextMinuteOption(), TimeDropdown(), openTimeMenu(), TimeDropdownProps

### Community 14 - "walks.ts"
Cohesion: 0.29
Nodes (6): ApiWalk, formatResidentialComplex(), formatWalkDate(), Period, ScheduleType, Walk

### Community 15 - "worker/index.ts"
Cohesion: 0.29
Nodes (3): Env, ExecutionContext, worker

### Community 17 - "DropdownSelect.tsx"
Cohesion: 0.50
Nodes (3): DropdownOption, DropdownSelect(), DropdownSelectProps

### Community 19 - "bootstrapSession"
Cohesion: 0.50
Nodes (4): bootstrapSession(), getSessionBootstrap(), postSessionBootstrap(), readLegacySessionData()

## Knowledge Gaps
- **130 isolated node(s):** `RouteContext`, `PetSummary`, `Database`, `WalkRow`, `GuidePlatform` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Home()` connect `Home` to `app/page.tsx`, `bootstrapSession`, `walks.ts`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `withDb()` connect `withDb` to `session.ts`, `walks/route.ts`, `privateJson`, `admin-auth.ts`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `RouteContext`, `PetSummary`, `Database` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `withDb` be split into smaller, more focused modules?**
  _Cohesion score 0.09962406015037593 - nodes in this community are weakly interconnected._
- **Should `Home` be split into smaller, more focused modules?**
  _Cohesion score 0.06431372549019608 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._