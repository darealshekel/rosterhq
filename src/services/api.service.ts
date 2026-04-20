import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
import { CharacterEntry, GroupRoster, RawRosterEntry } from '../app/api-model';
import { environment } from '../environments/environment';
import { formatClassLabel, ROSTER_OWNER_DEFINITIONS } from '../shared/rosterhq-core.js';

@Injectable({
  providedIn: 'root'
})

export class ApiService {
  private readonly rosterSources = ROSTER_OWNER_DEFINITIONS;

  constructor(private http: HttpClient) { }

  getGroupRosters(): Observable<GroupRoster[]> {
    if (environment.production) {
      return this.http.get<GroupRoster[]>('data/rosters.json');
    }

    return forkJoin(
      this.rosterSources.map((source) =>
        this.http.get(`/lostark-bible${source.sourcePath}`, { responseType: 'text' }).pipe(
          map((html) => this.parseRosterPage(html, source))
        )
      )
    );
  }

  private parseRosterPage(
    html: string,
    source: (typeof this.rosterSources)[number]
  ): GroupRoster {
    const arrayLiteral = this.extractRosterLiteral(html);
    const rawEntries = Function(`"use strict"; return (${arrayLiteral});`)() as RawRosterEntry[];
    const allCharacters = rawEntries
      .slice()
      .sort((a, b) => Number(b.ilvl) - Number(a.ilvl))
      .map((entry) => this.mapCharacter(entry));
    const characters = allCharacters
      .slice(0, 6)
      .map((entry) => entry);

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

  private extractRosterLiteral(html: string): string {
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

  private mapCharacter(entry: RawRosterEntry): CharacterEntry {
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
}
