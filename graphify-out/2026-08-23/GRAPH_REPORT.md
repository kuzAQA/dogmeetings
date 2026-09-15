# Graph Report - pet  (2026-08-20)

## Corpus Check
- 97 files · ~113,607 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 554 nodes · 969 edges · 50 communities (41 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Location Request Admin API
- Frontend Tooling Dependencies
- Home Page Application
- Push Subscription API
- Walk Planning Actions
- Admin Dashboard
- TypeScript Configuration
- Runtime Dependencies
- Session Location API
- Production Infrastructure
- Photo and Walk UI
- Expired Walk Cleanup
- Shared Pet Acceptance
- Dog Walk Hero Art
- Android Browser Guide
- Android Handoff Guide
- iOS Browser Guide
- iOS Safari Handoff
- Messenger Browser Guide
- Cloudflare Worker Runtime
- Android External Browser Flow
- Cross Platform Browser Guide
- Dock Navigation Actions
- Location Selection Flow
- Dog Walking Iconography
- Residential Park Art
- Corgi Menu Art
- Social Sharing Artwork
- App Metadata Layout
- Trusted Native Builds
- Luna Dog Portrait
- Scheduling Iconography
- Project Language Tooling
- Admin Layout Metadata
- Bonya Dog Portrait
- Placeholder Dog Art
- Richie Dog Portrait
- Paw Trail Iconography
- Location Pin Iconography
- Database Migration Script
- Time Dropdown
- Next Configuration
- Next Type Declarations
- User Profile Iconography
- Database Backup Script
- Pet Paw Icon

## God Nodes (most connected - your core abstractions)
1. `Home()` - 54 edges
2. `withDb()` - 54 edges
3. `privateJson()` - 43 edges
4. `isSameOriginRequest()` - 28 edges
5. `getClientSession()` - 27 edges
6. `AdminPage()` - 17 edges
7. `compilerOptions` - 15 edges
8. `hasValidAdminSession()` - 14 edges
9. `POST()` - 12 edges
10. `PATCH()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Daily Expired Walk Cleanup` --semantically_similar_to--> `Expired Walk Scheduler Service`  [INFERRED] [semantically similar]
  README.md → compose.production.yml
- `Database Schema and Migrations` --conceptually_related_to--> `Database Migration Service`  [INFERRED]
  README.md → compose.production.yml
- `GET()` --calls--> `privateJson()`  [EXTRACTED]
  app/api/dogsfather/challenge/route.ts → lib/session.ts
- `authorize()` --calls--> `hasValidAdminSession()`  [EXTRACTED]
  app/api/dogsfather/location-requests/route.ts → lib/admin-auth.ts
- `authorize()` --calls--> `hasValidAdminSession()`  [EXTRACTED]
  app/api/dogsfather/pets/route.ts → lib/admin-auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Production Service Startup Chain** — compose_production_db_service, compose_production_migrate_service, compose_production_app_service, compose_production_caddy_service [EXTRACTED 1.00]
- **Production Database Consumers** — compose_production_db_service, compose_production_app_service, compose_production_scheduler_service [INFERRED 0.95]
- **Allowed Native Dependency Builds** — pnpm_workspace_esbuild, pnpm_workspace_sharp, pnpm_workspace_workerd [EXTRACTED 1.00]
- **Dog Walking Scene** — public_dog_walking_icon_person, public_dog_walking_icon_leash, public_dog_walking_icon_dog [EXTRACTED 1.00]
- **Integrated Residential Landscape** — public_location_park_residential_towers, public_location_park_landscaped_green_space, public_location_park_reflecting_pond, public_location_park_pedestrian_paths [EXTRACTED 1.00]
- **Friendly Pet Menu Composition** — public_menu_corgi_happy_corgi, public_menu_corgi_pink_heart, public_menu_corgi_green_foliage, public_menu_corgi_open_copy_space [INFERRED 0.85]
- **Local dog-walking promotion** — public_og_gulyat_vmeste, public_og_local_dog_walking_companionship, public_og_woman_walking_dog, public_og_neighborhood_park [INFERRED 0.95]
- **Dog Walking Scene** — public_walk_hero_woman_walking_dog, public_walk_hero_golden_retriever, public_walk_hero_leash, public_walk_hero_urban_park [EXTRACTED 1.00]
- **External Browser Access Flow** — screenshots_browser_guide_android_updated_overflow_menu, screenshots_browser_guide_android_updated_open_in_browser_action, screenshots_browser_guide_android_updated_continue_button [EXTRACTED 1.00]
- **Android External Browser Handoff Flow** — screenshots_browser_guide_android_vertical_fixed_in_app_browser, screenshots_browser_guide_android_vertical_fixed_overflow_menu, screenshots_browser_guide_android_vertical_fixed_open_in_browser_action, screenshots_browser_guide_android_vertical_fixed_continue_button [INFERRED 0.85]
- **Open Site in Browser Flow** — screenshots_browser_guide_android_in_app_browser, screenshots_browser_guide_android_three_dot_menu, screenshots_browser_guide_android_open_in_browser_action, screenshots_browser_guide_android_regular_browser, screenshots_browser_guide_android_continue_action [EXTRACTED 1.00]
- **iPhone External Browser Flow** — screenshots_browser_guide_ios_arrow_fixed_iphone_mode, screenshots_browser_guide_ios_arrow_fixed_safari_compass_action, screenshots_browser_guide_ios_arrow_fixed_continue_action [EXTRACTED 1.00]
- **iOS Browser Handoff Flow** — screenshots_browser_guide_ios_updated_embedded_messenger_browser, screenshots_browser_guide_ios_updated_iphone, screenshots_browser_guide_ios_updated_open_in_safari_instruction, screenshots_browser_guide_ios_updated_safari, screenshots_browser_guide_ios_updated_compass_icon, screenshots_browser_guide_ios_updated_continue_button [EXTRACTED 1.00]
- **Browser Handoff Flow** — screenshots_browser_guide_ios_messenger_in_app_browser, screenshots_browser_guide_ios_compass_icon, screenshots_browser_guide_ios_continue_action [EXTRACTED 1.00]

## Communities (50 total, 9 thin omitted)

### Community 0 - "Location Request Admin API"
Cohesion: 0.07
Nodes (80): authorize(), DELETE(), GET(), PATCH(), requestId(), adminError(), allowedPhotoTypes, authorize() (+72 more)

### Community 1 - "Frontend Tooling Dependencies"
Cohesion: 0.04
Nodes (45): @cloudflare/vite-plugin, drizzle-kit, eslint, @eslint/js, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, globals (+37 more)

### Community 2 - "Home Page Application"
Cohesion: 0.06
Nodes (34): allowedPhotoTypes, ApiWalk, AppNavigationState, AvailableLocation, bootstrapSession(), BrowserGuidePlatform, defaultLocation, DockPanelSection (+26 more)

### Community 3 - "Push Subscription API"
Cohesion: 0.14
Nodes (32): GET(), ALLOWED_PUSH_HOSTS, authorize(), DELETE(), endpointHash(), GET(), POST(), SubscriptionPayload (+24 more)

### Community 4 - "Walk Planning Actions"
Cohesion: 0.07
Nodes (12): clearLegacySessionData(), formatResidentialComplex(), Home(), addPet(), continueToRequiredPet(), editPet(), editWalk(), openFormScreen() (+4 more)

### Community 5 - "Admin Dashboard"
Cohesion: 0.09
Nodes (23): AdminPage(), adminHeaderActions(), closePetEditor(), disableNotifications(), saveAdminPet(), sectionHeading(), signIn(), signOut() (+15 more)

### Community 6 - "TypeScript Configuration"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+19 more)

### Community 7 - "Runtime Dependencies"
Cohesion: 0.07
Nodes (26): drizzle-orm, lucide-react, dependencies, drizzle-orm, lucide-react, pg, react, react-dom (+18 more)

### Community 8 - "Session Location API"
Cohesion: 0.21
Nodes (21): databaseError(), GET(), knownLocation(), normalizeLocation(), PATCH(), POST(), ClientSession, createClientSession() (+13 more)

### Community 9 - "Production Infrastructure"
Cohesion: 0.18
Nodes (18): Dogmeet Application Service, Caddy Reverse Proxy Service, Persistent Caddy State, PostgreSQL Database Service, Dogmeet Production Stack, Database Migration Service, Persistent PostgreSQL Data, Expired Walk Scheduler Service (+10 more)

### Community 10 - "Photo and Walk UI"
Cohesion: 0.24
Nodes (10): apiWalkToCard(), canvasToBlob(), compressPetPhoto(), beginFormClose(), closeDockWalkAnnouncement(), leavePetScreen(), leaveWalkScreen(), savePet() (+2 more)

### Community 11 - "Expired Walk Cleanup"
Cohesion: 0.33
Nodes (7): cleanupExpiredData(), connectionString(), formatMoscowDateTime(), nextRunAt(), runAndSchedule(), runOnce, scheduleNextRun()

### Community 12 - "Shared Pet Acceptance"
Cohesion: 0.32
Nodes (7): ensureClientSession(), GuidePlatform, SharedPet, SharedPetPage(), acceptPet(), continueFromBrowserGuide(), ShareStage

### Community 13 - "Dog Walk Hero Art"
Cohesion: 0.36
Nodes (8): Golden Retriever, Leash, Park Bench, Park Fountain, Residential Buildings, Urban Park, Walk Hero Illustration, Woman Walking Dog

### Community 14 - "Android Browser Guide"
Cohesion: 0.25
Nodes (8): Android, Android Browser Opening Guide, Continue Action, In-app Browser, Open in Browser Action, Regular Browser, Telegram, Three-dot Menu

### Community 15 - "Android Handoff Guide"
Cohesion: 0.32
Nodes (8): Android Tab, Open Site in Browser Guide, Continue Button, External Browser Handoff, Open in Browser Action, Three-Dot Overflow Menu, Regular Browser, Telegram In-App Browser

### Community 16 - "iOS Browser Guide"
Cohesion: 0.29
Nodes (8): Chrome Browser, Compass Icon, Continue Action, External Browser Handoff, iOS Browser Guide Screen, iPhone Tab, Messenger In-App Browser, Safari Browser

### Community 17 - "iOS Safari Handoff"
Cohesion: 0.36
Nodes (8): Android, Compass Icon, Continue Button, Embedded Messenger Browser, iPhone, Open in Safari Instruction, Open Site in Browser Guide, Safari

### Community 18 - "Messenger Browser Guide"
Cohesion: 0.33
Nodes (7): Android Tab, Browser Menu, Continue Button, External Browser, Messenger In-App Browser, Open in Browser Action, Open Site in Browser Screen

### Community 19 - "Cloudflare Worker Runtime"
Cohesion: 0.29
Nodes (3): Env, ExecutionContext, worker

### Community 20 - "Android External Browser Flow"
Cohesion: 0.40
Nodes (6): Android Instructions, Continue Button, In-App Browser, Open in Browser Action, Open Site in Browser Guide Screen, Three-Dot Overflow Menu

### Community 21 - "Cross Platform Browser Guide"
Cohesion: 0.33
Nodes (6): Android Mode, Open Site in Browser Guide, Continue Action, External Browser Requirement, iPhone Mode, Open in Safari via Compass Icon

### Community 22 - "Dock Navigation Actions"
Cohesion: 0.60
Nodes (5): beginDockSlide(), handleDockWalkAction(), openMenu(), selectDockSection(), startDockWalkAnnouncement()

### Community 23 - "Location Selection Flow"
Cohesion: 0.40
Nodes (5): chooseLocationCity(), chooseLocationDistrict(), sendLocationRequest(), normalizeLocationSelection(), uniqueLocationValues()

### Community 24 - "Dog Walking Iconography"
Cohesion: 0.60
Nodes (5): Dog, Dog Walking, Dog Walking Icon, Leash, Person

### Community 25 - "Residential Park Art"
Cohesion: 0.60
Nodes (5): Landscaped Green Space, Pedestrian Paths, Reflecting Pond, Residential Park Illustration, Residential Towers

### Community 26 - "Corgi Menu Art"
Cohesion: 0.50
Nodes (5): Green Foliage, Happy Corgi, Open Copy Space, Pink Heart, Watercolor Corgi Illustration

### Community 27 - "Social Sharing Artwork"
Cohesion: 0.70
Nodes (5): Гулять вместе, Local dog-walking companionship, Neighborhood park setting, Гулять вместе promotional image, Woman walking a dog

### Community 29 - "Trusted Native Builds"
Cohesion: 0.50
Nodes (4): esbuild, sharp, Trusted Dependency Builds, workerd

### Community 30 - "Luna Dog Portrait"
Cohesion: 0.50
Nodes (4): Black and White Dog, Border Collie, Luna Dog Portrait, Park Setting

### Community 31 - "Scheduling Iconography"
Cohesion: 0.83
Nodes (4): Calendar, Calendar with Clock Icon, Clock, Scheduling

### Community 32 - "Project Language Tooling"
Cohesion: 0.67
Nodes (3): LSP Workspace Indexing, Pet Project, TypeScript Language Server

### Community 34 - "Bonya Dog Portrait"
Cohesion: 1.00
Nodes (3): Small Curly-Coated Dog, Portrait of Bonya the Dog, Sunlit Park Setting

### Community 35 - "Placeholder Dog Art"
Cohesion: 1.00
Nodes (3): Decorative Botanical Background, Dog Portrait Illustration, Smiling Brown and White Dog

### Community 36 - "Richie Dog Portrait"
Cohesion: 1.00
Nodes (3): Golden Retriever, Outdoor Pet Portrait, Richie Dog Portrait

### Community 37 - "Paw Trail Iconography"
Cohesion: 1.00
Nodes (3): Diagonal Paw Trail, Dog Paw Prints, Two Dog Paws Icon

### Community 38 - "Location Pin Iconography"
Cohesion: 0.67
Nodes (3): Geographic Location, Location Pin Icon, Marked Point

## Ambiguous Edges - Review These
- `Black and White Dog` → `Border Collie`  [AMBIGUOUS]
  public/dog-luna.webp · relation: conceptually_related_to

## Knowledge Gaps
- **163 isolated node(s):** `allowedPhotoTypes`, `PetSummary`, `ALLOWED_PUSH_HOSTS`, `SubscriptionPayload`, `RouteContext` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Black and White Dog` and `Border Collie`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `withDb()` connect `Location Request Admin API` to `Session Location API`, `Push Subscription API`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `Home()` connect `Walk Planning Actions` to `Home Page Application`, `Photo and Walk UI`, `Dock Navigation Actions`, `Location Selection Flow`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Frontend Tooling Dependencies` to `Runtime Dependencies`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `allowedPhotoTypes`, `PetSummary`, `ALLOWED_PUSH_HOSTS` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Location Request Admin API` be split into smaller, more focused modules?**
  _Cohesion score 0.06749027682452528 - nodes in this community are weakly interconnected._
- **Should `Frontend Tooling Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._