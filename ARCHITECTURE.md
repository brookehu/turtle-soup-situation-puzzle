# Architecture

## Public Boundary

Only `public/` is served by Express:

- `public/index.html`
- `public/script.js`
- `public/styles.css`
- `public/assets/**`

The project root is not a static directory. `server/`, `data/`, `.env`, logs, README files and Docker metadata are not exposed over HTTP.

## Server

`server/index.js` owns:

- HTTP API
- Socket.IO events
- SQLite migrations
- LiveKit token creation
- password verification and rate limiting
- room archival timers

`server/schema.sql` defines fresh-database schema. Runtime migrations in `server/index.js` keep older local databases compatible.

## Data Model

Important tables:

- `users`: account/session identity, including `is_admin`.
- `rooms`: active and archived rooms. `original_code` preserves the original room code; `deleted_at` marks archived rooms.
- `room_players`: membership, role in room, online state, voice state.
- `questions` and `question_results`: question history and host judgements.
- `chat_messages`: complete chat history.
- `progress_nodes`: host-managed story checkpoints.
- `voice_logs`: voice state audit trail.

Room archival is soft-delete only. History remains queryable by admins and in database backups.

## Access Control

Passwords are checked only by `POST /api/fleet/verify`.

Roles:

- `player`: normal player.
- `host`: room host.
- `admin`: represented internally as a host user with `is_admin = 1`; admins can inspect every room and have host-level powers after entering.

Host-level operations call `canManage(user)`.

Admins have a stronger moderation path than hosts:

- host can manage players.
- admin can manage players and hosts.
- admin cannot manage another admin.

## Rate Limiting

`POST /api/fleet/verify` tracks failed password attempts by IP in memory:

- default window: `FLEET_RATE_WINDOW_MS=60000`
- default failures: `FLEET_RATE_MAX_FAILURES=5`

Successful verification clears the failure counter.

## Room Lifecycle

When a room has no online host/admin:

1. `scheduleRoomArchive(roomId)` starts a timer.
2. If a host/admin returns before `EMPTY_ROOM_TTL_MS`, the timer is cleared.
3. If the timer expires, `archiveRoom(roomId)` sets `deleted_at`, preserves `original_code`, changes `code` to an internal archived code, and disconnects active sockets.

`TEST_ROOM_CODES` skips archival for demo rooms such as `TS2048`.

Admins can also archive a room manually through `POST /api/admin/rooms/:roomId/archive`.

## Chat Commands

`chat_message` treats messages beginning with `@主持 ` or `@主持人 ` as questions, unless the sender is an admin. The server creates a `questions` row, emits `question_submit`, and stores a `chat_messages` row with `kind = 'question'`.

`chat_pat` stores a `chat_messages` row with `kind = 'pat'`.

## Avatars

Avatar lookup order:

1. exact player-name file in `public/assets/avatars`
2. numeric default avatar files sorted by number
3. `default.svg`

The numeric default selection is deterministic by player name, so the same name gets the same fallback avatar.

## Docker

The Docker image copies only:

- `server/`
- `public/`
- `package*.json`

The SQLite database lives in `/app/data`, mounted by the `turtle-data` volume in `docker-compose.yml`.
