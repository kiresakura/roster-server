# Roster

A **Telegram-driven team task, reminder, and leave-management service**.

Roster keeps a small team accountable without anyone living in a dashboard:
tasks and reminders are pushed to each member over Telegram, completion is a
single inline-button tap, and the system understands recurring schedules,
multi-assignee completion rules, and approved leave.

```
Supervisor ──creates──▶  Task (recurring, multi-assignee, importance)
                              │
                   scheduler scans every minute
                              │  enqueues per-user reminder jobs (lead-time aware,
                              ▼  suppressed while the assignee is on approved leave)
   Member's Telegram  ◀──────┘   "❗ Stand-up at 09:30  [✅ Mark complete]"
        │ taps button
        ▼
   Assignment COMPLETED ──▶ ANY mode: task done, peers told to stand down
                            ALL mode: task done once everyone has reported
```

---

## Features

- **Tasks & reminders** with an `importance` flag.
- **Recurrence**: weekly (by weekdays), monthly-by-date, monthly-by-nth-weekday
  (incl. *last* weekday). Occurrences preserve the base clock time.
- **Multi-assignee completion semantics** — `ANY` (first finisher closes it and
  peers are told to stand down) or `ALL` (everyone must report).
- **Leave management** — request → supervisor approve/reject; assignments during
  approved leave are auto-skipped and reminders suppressed.
- **Telegram bot** — account binding via one-shot deep-link token, reminder push,
  inline "Mark complete" buttons, and a daily roll-up review.
- **Scheduling** — per-minute reminder scan + 5-minute overdue scan + a
  timezone-aware daily-review cron, with the heavy per-user work fanned out over
  a BullMQ queue (deterministic job ids prevent double-sends).
- **GraphQL API** for everything a frontend needs.

## Architecture

A clean, layered NestJS application:

| Layer | Path | Responsibility |
|---|---|---|
| **Domain** (pure, framework-free) | `src/domain/` | Recurrence expansion, completion rules, leave overlap, validation, daily-review composition. No NestJS, no Prisma — **unit-tested in isolation**. |
| **Data** | `src/roster/*.repository.ts` | Prisma repositories over a transaction-aware client (`@Transactional()` via `nestjs-cls`). |
| **Services** | `src/roster/*.service.ts` | Orchestration: tasks, leave, Telegram, reminder scan, daily review. |
| **Edge** | `roster.resolver.ts`, `telegram-webhook.controller.ts` | GraphQL API + the Telegram webhook (constant-time secret check, fail-closed in production). |
| **Infra** | `src/{config,prisma,auth,queue}/` | Zod-validated config, Prisma, minimal JWT auth, BullMQ queue + scheduler. |

The pure domain layer is the heart of the system and carries the test suite —
everything else is wiring around it.

## Quickstart

```bash
# 1. Dependencies (Postgres + Redis)
docker compose up -d

# 2. Configure
cp .env.example .env            # the defaults match docker-compose

# 3. Install, migrate, seed
npm install
npm run prisma:migrate          # creates the schema
npm run db:seed                 # demo users (password: password123)

# 4. Run
npm run start:dev               # http://localhost:3010/graphql
```

Log in to get a token:

```bash
curl -s localhost:3010/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"supervisor@roster.local","password":"password123"}'
# → { "accessToken": "ey…", "user": { … } }
```

Then call GraphQL with `Authorization: Bearer <accessToken>`:

```graphql
query { health { ok enabled } }

mutation {
  createTask(input: {
    title: "Morning stand-up"
    type: TASK
    completionMode: ANY
    importance: true
    startAt: "2026-07-01T09:30:00Z"
    recurrence: { kind: WEEKLY, byWeekday: [1,2,3,4,5] }
    assigneeIds: ["<member-id>"]
  }) { id status }
}
```

## Telegram (optional)

Roster runs fine without Telegram (you just won't get push notifications). To
enable it, create a bot via [@BotFather](https://t.me/BotFather), set in `.env`:

```ini
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=123456:AA...
TELEGRAM_BOT_USERNAME=your_bot
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24)   # required in production
```

Point Telegram at your public URL and register the webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<your-host>/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Users bind their account from `startTelegramBind` (returns a `t.me` deep link),
then receive reminders and tap **Mark complete**.

## Testing

The pure domain logic is fully unit-tested (recurrence math, completion rules,
validation) — no database required:

```bash
npm test
```

## Tech stack

NestJS · GraphQL (Apollo, code-first) · Prisma + PostgreSQL · BullMQ + Redis ·
`@nestjs/schedule` · `nestjs-cls` transactions · Zod · Vitest · TypeScript.

## Origins

Roster began as a module I built on top of [AFFiNE](https://github.com/toeverything/AFFiNE)
for a self-hosted deployment. This repository is a **standalone reimplementation**
of that module — it contains none of AFFiNE's source; the domain logic, data
model, API, Telegram integration, and scheduling were re-homed into the clean,
dependency-light service you see here. See [`NOTICE.md`](./NOTICE.md).

## License

[MIT](./LICENSE).
