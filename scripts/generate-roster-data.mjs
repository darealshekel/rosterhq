import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rosterSources = [
  {
    key: 'shekel',
    title: "Shekel's Roster",
    sourceCharacter: 'ẞcombatscore',
    sourcePath: '/character/CE/%E1%BA%9Ecombatscore/roster',
    bannerImage: '',
    bannerAccent: '#ff5fab'
  },
  {
    key: 'dj',
    title: "DJ's Roster",
    sourceCharacter: 'Bröke',
    sourcePath: '/character/CE/Br%C3%B6ke/roster',
    bannerImage: 'images/dj-roster-banner-expanded-2.png',
    bannerAccent: '#ff7ac3'
  },
  {
    key: 'hollow',
    title: "Hollow's Roster",
    sourceCharacter: 'Ardeö',
    sourcePath: '/character/CE/Arde%C3%B6/roster',
    bannerImage: 'images/hollow-roster-banner.png',
    bannerAccent: '#ff6f95'
  },
  {
    key: 'basri',
    title: "Basri's Roster",
    sourceCharacter: 'Scrabb',
    sourcePath: '/character/CE/Scrabb/roster',
    bannerImage: '',
    bannerAccent: '#f76dc8'
  }
];

async function fetchRosterHtml(sourcePath) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`https://lostark.bible${sourcePath}`, {
      headers: {
        'user-agent': 'rosterhq-pages-sync'
      }
    });

    if (response.ok) {
      return response.text();
    }

    if (response.status !== 429 || attempt === 4) {
      throw new Error(`Failed to fetch ${sourcePath}: ${response.status} ${response.statusText}`);
    }

    await wait(1500 * attempt);
  }
}

function extractRosterLiteral(html) {
  const rosterBlockMatch = html.match(/\bdata\s*:\s*\{\s*roster\s*:/);
  if (!rosterBlockMatch || rosterBlockMatch.index === undefined) {
    throw new Error('Roster data block was not found in the lostark.bible page.');
  }

  const arrayStart = html.indexOf('[', rosterBlockMatch.index);
  if (arrayStart === -1) {
    throw new Error('Roster array start was not found.');
  }

  let depth = 0;
  let inString = false;
  let stringDelimiter = '';
  let escaped = false;

  for (let index = arrayStart; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === stringDelimiter) {
        inString = false;
        stringDelimiter = '';
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      inString = true;
      stringDelimiter = char;
      continue;
    }

    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return html.slice(arrayStart, index + 1);
      }
    }
  }

  throw new Error('Roster array end was not found.');
}

function formatClassLabel(classKey) {
  const knownLabels = {
    soul_eater: 'Souleater',
    dragon_knight: 'Valkyrie',
    blade: 'Deathblade',
    alchemist: 'Alchemist',
    berserker: 'Berserker',
    breaker: 'Breaker',
    bard: 'Bard',
    artist: 'Artist',
    holy_knight: 'Paladin',
    paladin: 'Paladin'
  };

  if (knownLabels[classKey]) {
    return knownLabels[classKey];
  }

  return classKey
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mapCharacter(entry) {
  return {
    id: entry.id,
    name: entry.name,
    classKey: entry.class,
    classLabel: formatClassLabel(entry.class),
    itemLevel: Number(entry.ilvl),
    combatPower: Number(entry.combatPower?.score ?? 0),
    combatPowerIsEstimate: entry.combatPowerIsEstimate,
    lastUpdate: Number(entry.lastUpdate),
    characterUrl: `https://lostark.bible/character/CE/${encodeURIComponent(entry.name)}`
  };
}

async function buildRoster(source) {
  const html = await fetchRosterHtml(source.sourcePath);
  const arrayLiteral = extractRosterLiteral(html);
  const rawEntries = Function(`"use strict"; return (${arrayLiteral});`)();
  const allCharacters = rawEntries
    .slice()
    .sort((a, b) => Number(b.ilvl) - Number(a.ilvl))
    .map((entry) => mapCharacter(entry));
  const characters = allCharacters.slice(0, 6);

  const averageItemLevel = characters.length
    ? characters.reduce((sum, character) => sum + character.itemLevel, 0) / characters.length
    : 0;
  const averageCombatPower = characters.length
    ? characters.reduce((sum, character) => sum + character.combatPower, 0) / characters.length
    : 0;

  return {
    key: source.key,
    title: source.title,
    sourceCharacter: source.sourceCharacter,
    sourcePath: source.sourcePath,
    bannerImage: source.bannerImage,
    bannerAccent: source.bannerAccent,
    characters,
    allCharacters,
    averageItemLevel,
    averageCombatPower,
    highestItemLevel: characters[0]?.itemLevel ?? 0
  };
}

async function main() {
  const rosters = [];
  for (const source of rosterSources) {
    rosters.push(await buildRoster(source));
    await wait(500);
  }
  const outputPath = path.join(process.cwd(), 'public', 'data', 'rosters.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(rosters, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
