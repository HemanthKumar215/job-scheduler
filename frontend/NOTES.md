# Frontend Component Notes (Phase 5)

This component contains the Vite/React dashboard frontend for the Distributed Job Scheduler Platform.

## Key Logic & Design Decisions

### 1. State Hydration & Authentication
- **Session Persistence**: Authentication details (JWT, User name, Orgs list) are stored inside `localStorage` on login/signup.
- **Hydration**: The `App.tsx` state machine loads these details on mount, rendering the dashboard layout or redirecting to the `AuthPage` if missing/expired.
- **Workspace Binding**: The active workspace (organization project) is bound using a dropdown menu in the sidebar, which updates all query paths dynamically.

### 2. Live WebSocket Synchronizations
We integrate Socket.IO directly with server-side events:
- **Updates**: When workers change job states (e.g. `CLAIMED`, `RUNNING`, `COMPLETED`), they call the database and publish a message to Redis Pub/Sub. The API catches this message and emits a `job-updates` websocket message.
- **Dynamic Charting**: The frontend catches `job-updates` and automatically triggers a fresh reload of the metrics KPIs, charts, and job lists, removing the need for manual polling.
- **Worker Load Indicators**: A `worker-updates` socket event pushes CPU/Memory loads from running worker heartbeats directly to the worker monitor cards.

### 3. Loading, Empty, and Error States
Every view includes explicit handlers:
- **Loading**: Rendered using animated circular spinners while async operations are in progress.
- **Empty States**: Friendly dashboard alerts with visual SVG icons and quick action buttons when lists/searches yield 0 results.
- **Error States**: Colored alert panels with diagnostic messages and retry triggers if an API request fails.
