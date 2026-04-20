import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { CharacterEntry, GroupRoster } from '../api-model';
import { Subscription } from 'rxjs';
import { PlannerSharedState, PlannerStateService } from '../../services/planner-state.service';

interface RaidTierDefinition {
  key: string;
  difficulty: 'NM' | 'HM' | 'NIGHTMARE';
  itemLevel: number;
  gold: number;
  chestCost?: number;
}

interface RaidFamilyDefinition {
  key: string;
  title: string;
  tiers: RaidTierDefinition[];
}

interface CharacterPlannerRaid {
  familyKey: string;
  raidKey: string;
  title: string;
  difficulty: 'NM' | 'HM' | 'NIGHTMARE';
  itemLevel: number;
  gold: number;
  chestCost: number;
  buysChest: boolean;
  completed: boolean;
}

interface CharacterPlannerRow {
  id: number;
  name: string;
  classKey: string;
  classLabel: string;
  itemLevel: number;
  combatPower: number;
  combatPowerIsEstimate: boolean;
  characterUrl: string;
  lastUpdate: number;
  raidsByFamily: Record<string, CharacterPlannerRaid | undefined>;
  totalGold: number;
}

interface PlannerRosterView extends GroupRoster {
  plannerRows: CharacterPlannerRow[];
  plannerTotalGold: number;
  plannerCompletedCount: number;
}

@Component({
  selector: 'app-roster',
  imports: [NgFor, NgIf, DecimalPipe],
  templateUrl: './roster.component.html',
  styleUrl: './roster.component.css'
})
export class RosterComponent implements OnInit, OnDestroy {
  private sourceRosters: GroupRoster[] = [];
  private completionState: Record<string, boolean> = {};
  private chestState: Record<string, boolean> = {};
  private plannerStateSubscription?: Subscription;
  private readonly sercaNightmareCharacters = new Set(['broke', 'scrabb', 'ardeo', 'sscombatscore', 'combatscore']);

  readonly raidFamilies: RaidFamilyDefinition[] = [
    {
      key: 'act-4',
      title: 'Act 4',
      tiers: [
        { key: 'act-4-nm', difficulty: 'NM', itemLevel: 1700, gold: 33000, chestCost: 10560 },
        { key: 'act-4-hm', difficulty: 'HM', itemLevel: 1720, gold: 42000, chestCost: 13440 }
      ]
    },
    {
      key: 'final-day',
      title: 'Final Day',
      tiers: [
        { key: 'final-day-nm', difficulty: 'NM', itemLevel: 1710, gold: 40000, chestCost: 12800 },
        { key: 'final-day-hm', difficulty: 'HM', itemLevel: 1730, gold: 52000, chestCost: 16640 }
      ]
    },
    {
      key: 'serca',
      title: 'Serca',
      tiers: [
        { key: 'serca-nm', difficulty: 'NM', itemLevel: 1710, gold: 35000, chestCost: 11200 },
        { key: 'serca-hm', difficulty: 'HM', itemLevel: 1730, gold: 44000, chestCost: 14080 },
        { key: 'serca-nightmare', difficulty: 'NIGHTMARE', itemLevel: 1740, gold: 54000, chestCost: 17280 }
      ]
    }
  ];

  plannerRosters: PlannerRosterView[] = [];

  @Input()
  set rosters(value: GroupRoster[]) {
    this.sourceRosters = value;
    this.rebuildPlannerRosters();
  }

  constructor(private plannerStateService: PlannerStateService) {}

  ngOnInit(): void {
    this.plannerStateSubscription = this.plannerStateService.state$.subscribe((state) => {
      this.applySharedState(state);
    });
    this.plannerStateService.start();
  }

  ngOnDestroy(): void {
    this.plannerStateSubscription?.unsubscribe();
  }

  formatUpdated(timestampSeconds: number): string {
    const diffMinutes = Math.max(0, Math.round((Date.now() - (timestampSeconds * 1000)) / 60000));
    if (diffMinutes < 1) {
      return 'just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  }

  onRaidToggle(characterId: number, raidKey: string, completed: boolean): void {
    const plannerKey = this.characterRaidKey(characterId, raidKey);
    this.completionState[plannerKey] = completed;
    if (!this.applyRaidToggle(characterId, raidKey, completed)) {
      this.rebuildPlannerRosters();
    }
    this.plannerStateService.setCompletion(plannerKey, completed).subscribe((state) => {
      this.applySharedState(state);
    });
  }

  onChestToggle(characterId: number, raidKey: string, buysChest: boolean): void {
    const plannerKey = this.characterRaidKey(characterId, raidKey);
    this.chestState[plannerKey] = buysChest;
    if (!this.applyChestToggle(characterId, raidKey, buysChest)) {
      this.rebuildPlannerRosters();
    }
    this.plannerStateService.setChest(plannerKey, buysChest).subscribe((state) => {
      this.applySharedState(state);
    });
  }

  trackRoster(_index: number, roster: PlannerRosterView): string {
    return roster.key;
  }

  trackCharacter(_index: number, character: CharacterPlannerRow): number {
    return character.id;
  }

  trackRaidFamily(_index: number, family: RaidFamilyDefinition): string {
    return family.key;
  }

  getBannerImageUrl(bannerImage: string): string | null {
    if (!bannerImage) {
      return null;
    }

    return `url('${bannerImage}')`;
  }

  getDifficultyLabel(difficulty: CharacterPlannerRaid['difficulty'] | RaidTierDefinition['difficulty']): string {
    return difficulty === 'NIGHTMARE' ? 'NMR' : difficulty;
  }

  getClassBadgeLabel(classKey: string, classLabel: string): string {
    const knownLabels: Record<string, string> = {
      soul_eater: 'SE',
      dragon_knight: 'VK',
      blade: 'DB',
      alchemist: 'AL',
      berserker: 'BZ',
      breaker: 'BR',
      bard: 'BD',
      artist: 'AR',
      holy_knight: 'PL',
      paladin: 'PL'
    };

    if (knownLabels[classKey]) {
      return knownLabels[classKey];
    }

    const parts = classLabel.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return classLabel.slice(0, 2).toUpperCase();
  }

  getClassAccent(classKey: string): string {
    const palette: Record<string, string> = {
      soul_eater: '#7c64ff',
      dragon_knight: '#ff8f5a',
      blade: '#ff5e86',
      alchemist: '#6bd2a9',
      berserker: '#ff6c59',
      breaker: '#f2a94a',
      bard: '#ff7cc6',
      artist: '#7bc8ff',
      holy_knight: '#f3d37a',
      paladin: '#f3d37a'
    };

    return palette[classKey] ?? '#ff8ccc';
  }

  private buildPlannerRoster(roster: GroupRoster): PlannerRosterView {
    const plannerRows = roster.characters.map((character) => this.buildPlannerRow(character));
    return {
      ...roster,
      plannerRows,
      plannerTotalGold: plannerRows.reduce((sum, row) => sum + row.totalGold, 0),
      plannerCompletedCount: plannerRows.reduce(
        (sum, row) => sum + Object.values(row.raidsByFamily).filter((raid) => raid?.completed).length,
        0
      )
    };
  }

  private buildFallbackPlannerRoster(roster: GroupRoster): PlannerRosterView {
    const plannerRows = roster.characters.map((character) => ({
      id: character.id,
      name: character.name,
      classKey: character.classKey,
      classLabel: character.classLabel,
      itemLevel: character.itemLevel,
      combatPower: character.combatPower,
      combatPowerIsEstimate: character.combatPowerIsEstimate,
      characterUrl: character.characterUrl,
      lastUpdate: character.lastUpdate,
      raidsByFamily: this.raidFamilies.reduce<Record<string, CharacterPlannerRaid | undefined>>((acc, family) => {
        acc[family.key] = undefined;
        return acc;
      }, {}),
      totalGold: 0
    }));

    return {
      ...roster,
      plannerRows,
      plannerTotalGold: 0,
      plannerCompletedCount: 0
    };
  }

  private buildPlannerRow(character: CharacterEntry): CharacterPlannerRow {
    const raidsByFamily = this.raidFamilies.reduce<Record<string, CharacterPlannerRaid | undefined>>((acc, family) => {
      const tier = this.resolveTier(character, family);
      acc[family.key] = tier
        ? {
            familyKey: family.key,
            raidKey: tier.key,
            title: family.title,
            difficulty: tier.difficulty,
            itemLevel: tier.itemLevel,
            gold: tier.gold,
            chestCost: tier.chestCost ?? 0,
            buysChest: this.chestState[this.characterRaidKey(character.id, tier.key)] ?? false,
            completed: this.completionState[this.characterRaidKey(character.id, tier.key)] ?? true
          }
        : undefined;
      return acc;
    }, {});

    const totalGold = Object.values(raidsByFamily).reduce(
      (sum, raid) => sum + this.getRaidNetGold(raid),
      0
    );

    return {
      id: character.id,
      name: character.name,
      classKey: character.classKey,
      classLabel: character.classLabel,
      itemLevel: character.itemLevel,
      combatPower: character.combatPower,
      combatPowerIsEstimate: character.combatPowerIsEstimate,
      characterUrl: character.characterUrl,
      lastUpdate: character.lastUpdate,
      raidsByFamily,
      totalGold
    };
  }

  private resolveTier(character: CharacterEntry, family: RaidFamilyDefinition): RaidTierDefinition | undefined {
    const eligibleTier = family.tiers
      .slice()
      .sort((left, right) => right.itemLevel - left.itemLevel)
      .find((tier) => character.itemLevel >= tier.itemLevel);

    if (!eligibleTier) {
      return undefined;
    }

    if (family.key !== 'serca' || eligibleTier.difficulty !== 'NIGHTMARE' || this.canRunSercaNightmare(character.name)) {
      return eligibleTier;
    }

    return family.tiers
      .slice()
      .sort((left, right) => right.itemLevel - left.itemLevel)
      .find((tier) => tier.difficulty !== 'NIGHTMARE' && character.itemLevel >= tier.itemLevel);
  }

  private canRunSercaNightmare(characterName: string): boolean {
    let normalizedName = characterName.toLowerCase();

    try {
      normalizedName = normalizedName.normalize('NFKD');
    } catch {
      // Some restricted or older browser contexts may not support string normalization.
    }

    normalizedName = normalizedName
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss');

    return this.sercaNightmareCharacters.has(normalizedName);
  }

  private getRaidNetGold(raid: CharacterPlannerRaid | undefined): number {
    if (!raid?.completed) {
      return 0;
    }

    return raid.gold - (raid.buysChest ? raid.chestCost : 0);
  }

  private characterRaidKey(characterId: number, raidKey: string): string {
    return `${characterId}:${raidKey}`;
  }

  private applySharedState(state: PlannerSharedState): void {
    const nextCompletionState = { ...(state.completionState ?? {}) };
    const nextChestState = { ...(state.chestState ?? {}) };
    const completionChanged = !this.sameBooleanRecord(this.completionState, nextCompletionState);
    const chestChanged = !this.sameBooleanRecord(this.chestState, nextChestState);

    this.completionState = nextCompletionState;
    this.chestState = nextChestState;

    if ((completionChanged || chestChanged) && this.sourceRosters.length > 0) {
      this.rebuildPlannerRosters();
    }
  }

  private rebuildPlannerRosters(): void {
    try {
      this.plannerRosters = this.sourceRosters.map((roster) => this.buildPlannerRoster(roster));
    } catch {
      this.plannerRosters = this.sourceRosters.map((roster) => this.buildFallbackPlannerRoster(roster));
    }
  }

  private applyRaidToggle(characterId: number, raidKey: string, completed: boolean): boolean {
    for (const roster of this.plannerRosters) {
      const row = roster.plannerRows.find((character) => character.id === characterId);
      if (!row) {
        continue;
      }

      const raid = Object.values(row.raidsByFamily).find((candidate) => candidate?.raidKey === raidKey);
      if (!raid) {
        return false;
      }

      if (raid.completed === completed) {
        return true;
      }

      const goldDelta = completed ? this.getRaidNetGold({ ...raid, completed: true }) : -this.getRaidNetGold(raid);
      raid.completed = completed;
      row.totalGold += goldDelta;
      roster.plannerTotalGold += goldDelta;
      roster.plannerCompletedCount += completed ? 1 : -1;
      return true;
    }

    return false;
  }

  private applyChestToggle(characterId: number, raidKey: string, buysChest: boolean): boolean {
    for (const roster of this.plannerRosters) {
      const row = roster.plannerRows.find((character) => character.id === characterId);
      if (!row) {
        continue;
      }

      const raid = Object.values(row.raidsByFamily).find((candidate) => candidate?.raidKey === raidKey);
      if (!raid) {
        return false;
      }

      if (!raid.chestCost || raid.buysChest === buysChest) {
        return true;
      }

      raid.buysChest = buysChest;
      if (raid.completed) {
        const goldDelta = buysChest ? -raid.chestCost : raid.chestCost;
        row.totalGold += goldDelta;
        roster.plannerTotalGold += goldDelta;
      }
      return true;
    }

    return false;
  }

  private sameBooleanRecord(
    left: Record<string, boolean>,
    right: Record<string, boolean>
  ): boolean {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every((key) => left[key] === right[key]);
  }
}
