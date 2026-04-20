import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workerUrl = process.env.ROSTER_SYNC_API_URL;
const syncToken = process.env.ROSTER_SYNC_TOKEN;

if (!workerUrl || !syncToken) {
  console.error('ROSTER_SYNC_API_URL and ROSTER_SYNC_TOKEN are required.');
  process.exit(1);
}

const snapshotPath = path.join(process.cwd(), 'public', 'data', 'rosters.json');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));

const response = await fetch(`${workerUrl.replace(/\/$/, '')}/api/admin/rosters/sync`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${syncToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ rosters: snapshot })
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

const result = await response.json();
console.log(`Roster snapshot synced at ${result.syncedAt}.`);
