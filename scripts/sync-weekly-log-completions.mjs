import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  getWeeklyResetContext,
  resolveRaidTierFromLog
} from '../src/shared/rosterhq-core.js';

const workerUrl = process.env.ROSTER_SYNC_API_URL;
const syncToken = process.env.ROSTER_SYNC_TOKEN;

if (!workerUrl || !syncToken) {
  console.error('ROSTER_SYNC_API_URL and ROSTER_SYNC_TOKEN are required.');
  process.exit(1);
}

const snapshotPath = path.join(process.cwd(), 'public', 'data', 'rosters.json');
const rosters = JSON.parse(await readFile(snapshotPath, 'utf8'));
const reset = getWeeklyResetContext();
const weekStartMs = new Date(reset.currentWeeklyStartAt).getTime();
const weekEndMs = new Date(reset.nextWeeklyResetAt).getTime();
const completions = [];

for (const roster of rosters) {
  const visibleCharacters = Array.isArray(roster.characters) ? roster.characters : [];

  for (const character of visibleCharacters) {
    const logs = await fetchCharacterLogs(character.name);
    const latestByFamily = new Map();

    for (const log of logs) {
      const timestampMs = Number(log.timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs < weekStartMs || timestampMs >= weekEndMs) {
        continue;
      }

      const tier = resolveRaidTierFromLog(
        {
          itemLevel: Number(character.itemLevel ?? 0),
          name: character.name
        },
        log.boss,
        log.difficulty
      );

      if (!tier) {
        continue;
      }

      const existing = latestByFamily.get(tier.familyKey);
      if (existing && existing.timestampMs >= timestampMs) {
        continue;
      }

      latestByFamily.set(tier.familyKey, {
        rosterKey: roster.key,
        characterId: character.id,
        raidKey: tier.key,
        completedAt: new Date(timestampMs).toISOString(),
        logBoss: log.boss,
        logDifficulty: log.difficulty,
        timestampMs
      });
    }

    completions.push(
      ...Array.from(latestByFamily.values()).map(({ timestampMs: _timestampMs, ...completion }) => completion)
    );
    await wait(350);
  }
}

const response = await fetch(`${workerUrl.replace(/\/$/, '')}/api/admin/logs/sync`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${syncToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ completions })
});

if (!response.ok) {
  if (response.status === 404 || response.status === 405) {
    console.warn('Worker log sync endpoint is not deployed yet. Skipping weekly log sync for this run.');
    process.exit(0);
  }

  console.error(await response.text());
  process.exit(1);
}

const result = await response.json();
console.log(
  `Weekly log completions synced for ${result.weekId}. Synced: ${result.syncedCount}, skipped: ${result.skippedCount}, removed: ${result.removedCount}.`
);

async function fetchCharacterLogs(characterName) {
  const url = `https://lostark.bible/character/CE/${encodeURIComponent(characterName)}/logs`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'rosterhq-log-sync'
      }
    });

    if (response.ok) {
      const html = await response.text();
      return extractLogsFromHtml(html);
    }

    if (response.status === 429 && attempt < 4) {
      await wait(1500 * attempt);
      continue;
    }

    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return [];
}

function extractLogsFromHtml(html) {
  const marker = 'data:{logsEnabled:';
  const startIndex = html.indexOf(marker);
  if (startIndex === -1) {
    return [];
  }

  const endIndex = html.indexOf('},uses:', startIndex);
  if (endIndex === -1) {
    return [];
  }

  const block = html.slice(startIndex, endIndex);
  const entries = [];
  const entryPattern = /\{id:"[^"]+",name:"[^"]+",boss:"([^"]+)",difficulty:"([^"]+)"[^}]*timestamp:(\d{13})[^}]*\}/g;

  for (const match of block.matchAll(entryPattern)) {
    entries.push({
      boss: match[1],
      difficulty: match[2],
      timestamp: Number(match[3])
    });
  }

  return entries;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
