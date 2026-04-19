import { ApiService } from './api.service';
import { HttpClient } from '@angular/common/http';

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(() => {
    service = new ApiService({} as HttpClient);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('extracts the roster array from the current svelte bootstrap payload', () => {
    const html = `
      <script>
        kit.start(app, element, {
          data: [
            { type: "data", data: { header: { id: 1 } }, uses: {} },
            {
              type: "data",
              data: {
                roster: [
                  { id: 2, name: "Beta", class: "bard", ilvl: 1620, combatPower: { id: 1, score: 2222.22 }, combatPowerIsEstimate: true, lastUpdate: 1776542439 },
                  { id: 1, name: "Alpha", class: "blade", ilvl: 1630.5, combatPower: { id: 1, score: 3333.33 }, combatPowerIsEstimate: false, lastUpdate: 1776541412 }
                ]
              },
              uses: { parent: 1 }
            }
          ]
        });
      </script>
    `;

    const rosterLiteral = (service as unknown as { extractRosterLiteral(html: string): string }).extractRosterLiteral(html);
    const roster = Function(`"use strict"; return (${rosterLiteral});`)() as Array<{ name: string }>;

    expect(roster.length).toBe(2);
    expect(roster[0].name).toBe('Beta');
    expect(roster[1].name).toBe('Alpha');
  });

  it('parses and sorts the top roster characters by item level', () => {
    const html = `
      <script>
        kit.start(app, element, {
          data: [
            {
              type: "data",
              data: {
                roster: [
                  { id: 1, name: "Alpha", class: "blade", ilvl: 1630.5, combatPower: { id: 1, score: 3333.33 }, combatPowerIsEstimate: false, lastUpdate: 1776541412 },
                  { id: 2, name: "Beta", class: "bard", ilvl: 1620, combatPower: { id: 1, score: 2222.22 }, combatPowerIsEstimate: true, lastUpdate: 1776542439 }
                ]
              },
              uses: { parent: 1 }
            }
          ]
        });
      </script>
    `;
    const source = {
      key: 'test',
      title: 'Test Roster',
      sourceCharacter: 'Alpha',
      sourcePath: '/character/CE/Alpha/roster',
      bannerImage: '',
      bannerAccent: '#fff'
    };

    const roster = (service as unknown as {
      parseRosterPage(html: string, source: {
        key: string;
        title: string;
        sourceCharacter: string;
        sourcePath: string;
        bannerImage: string;
        bannerAccent: string;
      }): {
        allCharacters: Array<{ name: string; itemLevel: number; classLabel: string }>;
        highestItemLevel: number;
      };
    }).parseRosterPage(html, source);

    expect(roster.allCharacters.map((entry) => entry.name)).toEqual(['Alpha', 'Beta']);
    expect(roster.allCharacters[0].itemLevel).toBe(1630.5);
    expect(roster.allCharacters[0].classLabel).toBe('Deathblade');
    expect(roster.highestItemLevel).toBe(1630.5);
  });
});
