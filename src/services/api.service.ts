import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable } from 'rxjs';
import { CharacterEntry, GroupRoster, RawRosterEntry } from '../app/api-model';

@Injectable({
  providedIn: 'root'
})

export class ApiService {
  private readonly rosterSources = [
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
      bannerImage: '/images/dj-roster-banner-expanded-2.png',
      bannerAccent: '#ff7ac3'
    },
    {
      key: 'hollow',
      title: "Hollow's Roster",
      sourceCharacter: 'Ardeö',
      sourcePath: '/character/CE/Arde%C3%B6/roster',
      bannerImage: '/images/hollow-roster-banner.png',
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
  ] as const;

  constructor(private http: HttpClient) { }

  getGroupRosters(): Observable<GroupRoster[]> {
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
      classLabel: this.formatClassLabel(entry.class),
      itemLevel: Number(entry.ilvl),
      combatPower: Number(entry.combatPower?.score ?? 0),
      combatPowerIsEstimate: entry.combatPowerIsEstimate,
      lastUpdate: Number(entry.lastUpdate),
      characterUrl: `https://lostark.bible/character/CE/${encodeURIComponent(entry.name)}`
    };
  }

  private formatClassLabel(classKey: string): string {
    const knownLabels: Record<string, string> = {
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
}
