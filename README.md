# Roster HQ

Roster HQ now has:

- a shared weekly raid state backed by a Cloudflare Worker + D1
- per-roster life energy tracking with full-time calculation
- Discord slash commands for each tracked raid
- weekly and life energy reminder delivery through the same Discord bot identity

## Architecture

- `src/shared/rosterhq-core.js`
  Shared business rules for raid definitions, weekly reset timing, roster metadata, and life energy math.
- `src/services/roster-state.service.ts`
  Website client for the shared worker API.
- `src/app/roster/*`
  Weekly raid tracker UI plus per-roster life energy panel.
- `scripts/rosterhq-state-worker.js`
  Cloudflare Worker API, Discord interaction handler, and scheduled reminder runner.
- `migrations/0001_rosterhq_state.sql`
  D1 schema for roster owners, characters, raid definitions, weekly completions, life energy, and reminder dispatches.
- `scripts/register-discord-commands.mjs`
  Registers the slash commands for all configured raid families.
- `scripts/generate-roster-data.mjs`
  Refreshes the public roster snapshot from lostark.bible.
- `scripts/push-rosters-to-worker.mjs`
  Pushes the refreshed roster snapshot into the shared worker database so Discord autocomplete and eligibility stay in sync with the website.

## Shared Data Model

- `roster_owners`
  Canonical tracked rosters, visuals, and optional Discord user mapping.
- `characters`
  Synced roster snapshot used by the website and bot for eligibility and autocomplete.
- `raid_definitions`
  Canonical raid tiers and gold/chest values.
- `weekly_raid_completions`
  One row per `week_id + character_id + family_key`, with difficulty, bought-in state, completion source, and metadata.
- `life_energy_status`
  `current_life_energy`, `life_energy_last_updated_at`, `calculated_full_at`, and `reminder_sent_at`.
- `reminder_dispatches`
  Dedupes weekly checklist reminders and life energy full reminders across restarts.

## Weekly Reset Logic

Weekly reset is defined once in `src/shared/rosterhq-core.js`:

- timezone: `Asia/Jerusalem`
- reset time: `13:00`
- weekly reset day: Wednesday

The website header, worker API, Discord reminder scheduler, and weekly completion `week_id` all use that same reset context.

The weekly checklist reminder is calculated as:

- `weeklyReminderAt = nextWeeklyResetAt - 24 hours`

It is sent once per reset cycle and deduped in `reminder_dispatches`.

## Website Behavior

Each roster panel now contains:

- weekly raid tracker cards
- bought-in toggle per completed raid
- a life energy panel with:
  - current value input
  - max value
  - missing value
  - human-readable time until full
  - exact local full timestamp

Life energy input rules:

- below `0` clamps to `0`
- above `11500` clamps to `11500`
- restore rate is `33` per `10` minutes
- full reminders reset only when a new future `calculated_full_at` is created

## Discord Bot

The Discord bot is implemented as a Discord interactions endpoint on the Cloudflare Worker.

Slash commands are created for every tracked raid family:

- `/act-4`
- `/final-day`
- `/serca`

Each command supports:

- `difficulty`
- one character option per roster: `shekel`, `dj`, `hollow`, `basri`
- `NONE` through autocomplete
- one bought-in boolean per roster

Command behavior:

- validates roster and character ownership
- validates item-level eligibility for the selected difficulty
- upserts weekly completion rows for the current reset window
- ignores bought-in for `NONE`
- returns an exact confirmation summary

## Required Environment

### Worker / reminders

Set these in Cloudflare Worker secrets or local `.dev.vars`:

- `DISCORD_PUBLIC_KEY`
- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_REMINDER_CHANNEL_ID`
- `DISCORD_REMINDER_ROLE_ID`
- `DISCORD_ROSTER_USER_MAP_JSON`
  Example: `{"shekel":"123","dj":"456","hollow":"789","basri":"012"}`
- `ROSTER_SYNC_TOKEN`
- `ALLOWED_ORIGINS`
  Comma-separated extra CORS origins if needed.
- `ROSTERHQ_WRITE_TOKEN`
  Optional extra protection for website write routes if you want to require a write token.

### GitHub Actions

Add these repository secrets if you want roster snapshot sync into the worker:

- `ROSTER_SYNC_API_URL`
- `ROSTER_SYNC_TOKEN`

### Discord command registration

Set these in the shell before registering commands:

- `DISCORD_APPLICATION_ID` or `DISCORD_CLIENT_ID`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Apply the D1 migration:

```bash
npx wrangler d1 migrations apply rosterhq-state
```

3. Create `.dev.vars` from `.dev.vars.example` and fill the Discord values.

4. Start the worker locally:

```bash
npm run worker:dev
```

5. Refresh and push roster snapshot:

```bash
npm run sync:rosters
$env:ROSTER_SYNC_API_URL='http://127.0.0.1:8787'
$env:ROSTER_SYNC_TOKEN='your-sync-token'
npm run sync:state
```

6. Register slash commands:

```bash
$env:DISCORD_APPLICATION_ID='...'
$env:DISCORD_BOT_TOKEN='...'
$env:DISCORD_GUILD_ID='...'
npm run discord:register
```

7. Run the Angular app:

```bash
npm start
```

## Verification

Verified locally:

- `npm run build`
- `npm test -- --watch=false --browsers=ChromeHeadless`
- `npx wrangler deploy --dry-run`
- `node --check scripts/register-discord-commands.mjs`
- `node --check scripts/push-rosters-to-worker.mjs`
- `node --check scripts/generate-roster-data.mjs`

## Deployment Notes

- Update `wrangler.toml` with the real D1 database IDs before deploying.
- Deploy the worker with `npm run worker:deploy`.
- Configure the Discord application interactions URL to point to:
  `https://<your-worker-domain>/api/discord/interactions`
- Re-run `npm run discord:register` whenever raid command definitions change.
