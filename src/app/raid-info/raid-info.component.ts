import { Component, Input } from '@angular/core';
import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { CharacterEntry, GroupRoster, RaidColumn, RaidRow, RosterGoldSummary } from '../api-model';

interface RaidDefinition {
  key: string;
  family: string;
  name: string;
  itemLevel: number;
  defaultGold: number;
}

interface PlannerRaidState {
  raidKey: string;
  name: string;
  gold: number;
  completed: boolean;
}

interface CharacterPlannerRow {
  id: number;
  name: string;
  classLabel: string;
  itemLevel: number;
  combatPower: number;
  combatPowerIsEstimate: boolean;
  bonusGold: number;
  totalGold: number;
  eligibleRaids: PlannerRaidState[];
}

interface PlannerRosterGroup {
  key: string;
  title: string;
  accent: string;
  rows: CharacterPlannerRow[];
}

@Component({
  selector: 'app-raid-info',
  imports: [NgFor, NgIf, NgClass, DecimalPipe],
  templateUrl: './raid-info.component.html',
  styleUrl: './raid-info.component.css'
})
export class RaidInfoComponent {
  private readonly storageKey = 'roster-hq-gold-planner-v2';
  private readonly raidDefinitions: RaidDefinition[] = [
    { key: 'serka-hm', family: 'serka', name: 'Serka HM', itemLevel: 1730, defaultGold: 0 },
    { key: 'serka-nm', family: 'serka', name: 'Serka NM', itemLevel: 1710, defaultGold: 0 },
    { key: 'kazeros-hm', family: 'kazeros', name: 'Kazeros HM', itemLevel: 1730, defaultGold: 0 },
    { key: 'kazeros-nm', family: 'kazeros', name: 'Kazeros NM', itemLevel: 1710, defaultGold: 0 },
    { key: 'act-4-hm', family: 'act-4', name: 'Act 4 HM', itemLevel: 1720, defaultGold: 0 },
    { key: 'act-4-nm', family: 'act-4', name: 'Act 4 NM', itemLevel: 1700, defaultGold: 0 }
  ];

  private completionState: Record<string, Record<string, boolean>> = {};
  private goldState: Record<string, number> = {};
  private bonusGoldState: Record<string, number> = {};

  rosterHeaders: GroupRoster[] = [];
  raidRows: RaidRow[] = [];
  rosterSummaries: RosterGoldSummary[] = [];
  plannerGroups: PlannerRosterGroup[] = [];

  @Input()
  set rosters(value: GroupRoster[]) {
    this.rosterHeaders = value;
    this.refreshPlanner();
  }

  constructor() {
    this.restoreState();
  }

  private refreshPlanner(): void {
    this.raidRows = this.buildRaidRows(this.rosterHeaders);
    this.plannerGroups = this.buildPlannerGroups(this.rosterHeaders);
    this.rosterSummaries = this.buildRosterSummaries(this.plannerGroups);
    this.saveState();
  }

  private buildRaidRows(rosters: GroupRoster[]): RaidRow[] {
    return this.raidDefinitions.map((raid) => {
      const goldReward = this.goldState[raid.key] ?? raid.defaultGold;
      const rosterColumns: RaidColumn[] = rosters.map((roster) => {
        const eligibleCharacters = roster.allCharacters.filter((character) => this.isRaidEligible(character, raid));
        const completedCount = eligibleCharacters.filter(
          (character) => this.completionState[this.characterKey(character.id)]?.[raid.key]
        ).length;

        return {
          key: roster.key,
          count: eligibleCharacters.length,
          names: eligibleCharacters.map((character) => character.name),
          completedCount,
          earnedGold: completedCount * goldReward
        };
      });

      return {
        key: raid.key,
        family: raid.family,
        name: raid.name,
        itemLevel: raid.itemLevel,
        goldReward,
        totalEligible: rosterColumns.reduce((sum, column) => sum + column.count, 0),
        everyRosterReady: rosterColumns.every((column) => column.count > 0),
        rosterColumns
      };
    });
  }

  private buildPlannerGroups(rosters: GroupRoster[]): PlannerRosterGroup[] {
    return rosters.map((roster) => ({
      key: roster.key,
      title: roster.title,
      accent: roster.bannerAccent,
      rows: roster.allCharacters.map((character) => this.buildCharacterPlannerRow(character))
    }));
  }

  private buildCharacterPlannerRow(character: CharacterEntry): CharacterPlannerRow {
    const eligibleRaids = this.getEligibleRaids(character).map((raid) => {
      const raidKey = this.characterKey(character.id);
      const gold = this.goldState[raid.key] ?? raid.defaultGold;

      return {
        raidKey: raid.key,
        name: raid.name,
        gold,
        completed: this.completionState[raidKey]?.[raid.key] ?? false
      };
    });

    const bonusGold = this.bonusGoldState[this.characterKey(character.id)] ?? 0;
    const totalGold = eligibleRaids.reduce(
      (sum, raid) => sum + (raid.completed ? raid.gold : 0),
      bonusGold
    );

    return {
      id: character.id,
      name: character.name,
      classLabel: character.classLabel,
      itemLevel: character.itemLevel,
      combatPower: character.combatPower,
      combatPowerIsEstimate: character.combatPowerIsEstimate,
      bonusGold,
      totalGold,
      eligibleRaids
    };
  }

  private buildRosterSummaries(groups: PlannerRosterGroup[]): RosterGoldSummary[] {
    return groups.map((group) => ({
      key: group.key,
      title: group.title,
      totalGold: group.rows.reduce((sum, row) => sum + row.totalGold, 0),
      completedRaids: group.rows.reduce(
        (sum, row) => sum + row.eligibleRaids.filter((raid) => raid.completed).length,
        0
      ),
      availableRaids: group.rows.reduce((sum, row) => sum + row.eligibleRaids.length, 0)
    }));
  }

  private getEligibleRaids(character: CharacterEntry): RaidDefinition[] {
    return this.raidDefinitions.filter((raid) => this.isRaidEligible(character, raid));
  }

  private isRaidEligible(character: CharacterEntry, raid: RaidDefinition): boolean {
    if (character.itemLevel < raid.itemLevel) {
      return false;
    }

    return !this.raidDefinitions.some(
      (candidate) =>
        candidate.family === raid.family &&
        candidate.itemLevel > raid.itemLevel &&
        character.itemLevel >= candidate.itemLevel
    );
  }

  onCompletionToggle(characterId: number, raidKey: string, completed: boolean): void {
    const plannerKey = this.characterKey(characterId);
    this.completionState = {
      ...this.completionState,
      [plannerKey]: {
        ...(this.completionState[plannerKey] ?? {}),
        [raidKey]: completed
      }
    };
    this.refreshPlanner();
  }

  onGoldRewardChange(raidKey: string, rawValue: string): void {
    const parsedValue = Number(rawValue);
    this.goldState = {
      ...this.goldState,
      [raidKey]: Number.isFinite(parsedValue) && parsedValue > 0 ? Math.round(parsedValue) : 0
    };
    this.refreshPlanner();
  }

  onBonusGoldChange(characterId: number, rawValue: string): void {
    const parsedValue = Number(rawValue);
    this.bonusGoldState = {
      ...this.bonusGoldState,
      [this.characterKey(characterId)]: Number.isFinite(parsedValue) && parsedValue > 0 ? Math.round(parsedValue) : 0
    };
    this.refreshPlanner();
  }

  overallGoldTotal(): number {
    return this.rosterSummaries.reduce((sum, summary) => sum + summary.totalGold, 0);
  }

  rosterAccent(rosterKey: string): string {
    return this.rosterHeaders.find((roster) => roster.key === rosterKey)?.bannerAccent ?? '#ff7dc5';
  }

  summaryTotal(rosterKey: string): number {
    return this.rosterSummaries.find((summary) => summary.key === rosterKey)?.totalGold ?? 0;
  }

  namesLabel(names: string[]): string {
    return names.length ? names.join(', ') : 'No eligible characters';
  }

  private characterKey(characterId: number): string {
    return String(characterId);
  }

  private restoreState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    const rawState = localStorage.getItem(this.storageKey);
    if (!rawState) {
      return;
    }

    try {
      const parsedState = JSON.parse(rawState) as {
        completionState?: Record<string, Record<string, boolean>>;
        goldState?: Record<string, number>;
        bonusGoldState?: Record<string, number>;
      };

      this.completionState = parsedState.completionState ?? {};
      this.goldState = parsedState.goldState ?? {};
      this.bonusGoldState = parsedState.bonusGoldState ?? {};
    } catch {
      this.completionState = {};
      this.goldState = {};
      this.bonusGoldState = {};
    }
  }

  private saveState(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(
      this.storageKey,
      JSON.stringify({
        completionState: this.completionState,
        goldState: this.goldState,
        bonusGoldState: this.bonusGoldState
      })
    );
  }
}
