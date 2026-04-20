import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  CharacterEntry,
  GroupRoster,
  LifeEnergyStatusRecord,
  RaidDifficulty,
  RosterSyncState,
  WeeklyRaidCompletionRecord
} from '../api-model';
import { RosterStateService } from '../../services/roster-state.service';
import {
  clampLifeEnergy,
  formatLifeEnergyRemaining,
  getDifficultyLabel,
  getRaidTierByKey,
  projectLifeEnergyStatus,
  RAID_FAMILY_DEFINITIONS,
  resolveEligibleRaidTier
} from '../../shared/rosterhq-core.js';

interface RaidFamilyDefinition {
  key: string;
  commandName: string;
  title: string;
  sortOrder: number;
  tiers: Array<{
    key: string;
    familyKey: string;
    title: string;
    difficulty: RaidDifficulty;
    itemLevel: number;
    gold: number;
    chestCost: number;
    sortOrder: number;
  }>;
}

interface CharacterPlannerRaid {
  familyKey: string;
  raidKey: string;
  title: string;
  difficulty: RaidDifficulty;
  itemLevel: number;
  gold: number;
  chestCost: number;
  buysChest: boolean;
  completed: boolean;
}

interface CharacterPlannerRow {
  id: number;
  rosterKey: string;
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

interface LifeEnergyUiState {
  input: string;
  status: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
}

@Component({
  selector: 'app-roster',
  imports: [NgFor, NgIf, DecimalPipe],
  templateUrl: './roster.component.html',
  styleUrl: './roster.component.css'
})
export class RosterComponent implements OnInit, OnDestroy {
  private sourceRosters: GroupRoster[] = [];
  private completionIndex = new Map<string, WeeklyRaidCompletionRecord>();
  private lifeEnergyIndex = new Map<string, LifeEnergyStatusRecord>();
  private plannerStateSubscription?: Subscription;
  private lifeEnergyIntervalId: number | null = null;
  private readonly lifeEnergySaveTimers = new Map<string, number>();

  readonly raidFamilies = RAID_FAMILY_DEFINITIONS as RaidFamilyDefinition[];
  plannerRosters: PlannerRosterView[] = [];
  lifeEnergyUiState: Record<string, LifeEnergyUiState> = {};
  syncState: RosterSyncState = {
    reset: {
      now: new Date().toISOString(),
      timeZone: 'Asia/Jerusalem',
      currentWeeklyStartAt: new Date().toISOString(),
      nextWeeklyResetAt: new Date().toISOString(),
      weeklyReminderAt: new Date().toISOString(),
      currentWeekId: new Date().toISOString()
    },
    raidCompletions: [],
    lifeEnergy: [],
    version: 0
  };

  @Input()
  set rosters(value: GroupRoster[]) {
    this.sourceRosters = value;
    this.initializeLifeEnergyInputs();
    this.rebuildPlannerRosters();
  }

  constructor(private rosterStateService: RosterStateService) {}

  ngOnInit(): void {
    this.plannerStateSubscription = this.rosterStateService.state$.subscribe((state) => {
      this.applySharedState(state);
    });
    this.rosterStateService.start();
    if (typeof window !== 'undefined') {
      this.lifeEnergyIntervalId = window.setInterval(() => this.refreshLifeEnergyInputsFromProjection(), 30000);
    }
  }

  ngOnDestroy(): void {
    this.plannerStateSubscription?.unsubscribe();
    if (this.lifeEnergyIntervalId !== null) {
      window.clearInterval(this.lifeEnergyIntervalId);
    }

    for (const timerId of this.lifeEnergySaveTimers.values()) {
      window.clearTimeout(timerId);
    }
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

  onRaidToggle(character: CharacterPlannerRow, raid: CharacterPlannerRaid, completed: boolean): void {
    this.rosterStateService.upsertRaidCompletion({
      rosterKey: character.rosterKey,
      characterId: character.id,
      raidKey: raid.raidKey,
      boughtIn: completed ? raid.buysChest : false,
      completed
    }).subscribe((state) => this.applySharedState(state));
  }

  onChestToggle(character: CharacterPlannerRow, raid: CharacterPlannerRaid, buysChest: boolean): void {
    this.rosterStateService.upsertRaidCompletion({
      rosterKey: character.rosterKey,
      characterId: character.id,
      raidKey: raid.raidKey,
      boughtIn: buysChest,
      completed: true
    }).subscribe((state) => this.applySharedState(state));
  }

  onLifeEnergyInput(rosterKey: string, rawValue: string): void {
    this.lifeEnergyUiState[rosterKey] = {
      input: rawValue,
      status: 'saving',
      message: 'Syncing reminder state...'
    };

    const existingTimerId = this.lifeEnergySaveTimers.get(rosterKey);
    if (existingTimerId !== undefined) {
      window.clearTimeout(existingTimerId);
    }

    const timerId = window.setTimeout(() => {
      this.persistLifeEnergy(rosterKey);
      this.lifeEnergySaveTimers.delete(rosterKey);
    }, 700);
    this.lifeEnergySaveTimers.set(rosterKey, timerId);
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

  getDifficultyLabel(difficulty: CharacterPlannerRaid['difficulty']): string {
    return getDifficultyLabel(difficulty);
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

  getLifeEnergyPreview(rosterKey: string) {
    const uiState = this.lifeEnergyUiState[rosterKey];
    const persisted = this.lifeEnergyIndex.get(rosterKey);

    if (uiState && (uiState.status === 'saving' || uiState.status === 'error' || !persisted)) {
      return projectLifeEnergyStatus({
        current_life_energy: clampLifeEnergy(uiState.input),
        life_energy_last_updated_at: new Date().toISOString(),
        calculated_full_at: null
      });
    }

    return projectLifeEnergyStatus(persisted ?? {});
  }

  getLifeEnergyTimeRemaining(rosterKey: string): string {
    return formatLifeEnergyRemaining(this.getLifeEnergyPreview(rosterKey).msUntilFull);
  }

  getLifeEnergyTimestamp(rosterKey: string): string {
    const preview = this.getLifeEnergyPreview(rosterKey);
    if (!preview.fullAt) {
      return 'Already full';
    }

    return this.formatLocalTimestamp(preview.fullAt);
  }

  getLifeEnergyInput(rosterKey: string): string {
    return this.lifeEnergyUiState[rosterKey]?.input ?? '';
  }

  getLifeEnergyStatus(rosterKey: string): LifeEnergyUiState['status'] {
    return this.lifeEnergyUiState[rosterKey]?.status ?? 'idle';
  }

  getLifeEnergyMessage(rosterKey: string): string {
    return this.lifeEnergyUiState[rosterKey]?.message ?? 'Saved values power Discord reminders.';
  }

  private buildPlannerRoster(roster: GroupRoster): PlannerRosterView {
    const plannerRows = roster.characters.map((character) => this.buildPlannerRow(roster.key, character));
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

  private buildPlannerRow(rosterKey: string, character: CharacterEntry): CharacterPlannerRow {
    const raidsByFamily = this.raidFamilies.reduce<Record<string, CharacterPlannerRaid | undefined>>((acc, family) => {
      const completion = this.completionIndex.get(this.characterFamilyKey(character.id, family.key));
      const selectedTier = completion ? getRaidTierByKey(completion.raidKey) : undefined;
      const eligibleTier = resolveEligibleRaidTier(character, family);
      const tier = selectedTier ?? eligibleTier;

      if (!tier) {
        acc[family.key] = undefined;
        return acc;
      }

      acc[family.key] = {
        familyKey: family.key,
        raidKey: tier.key,
        title: family.title,
        difficulty: tier.difficulty,
        itemLevel: tier.itemLevel,
        gold: tier.gold,
        chestCost: tier.chestCost,
        buysChest: completion?.boughtIn ?? false,
        completed: Boolean(completion)
      };

      return acc;
    }, {});

    const totalGold = (Object.values(raidsByFamily) as Array<CharacterPlannerRaid | undefined>).reduce(
      (sum, raid) => sum + this.getRaidNetGold(raid),
      0
    );

    return {
      id: character.id,
      rosterKey,
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

  private applySharedState(state: RosterSyncState): void {
    this.syncState = state;
    this.completionIndex = new Map(
      state.raidCompletions.map((completion) => [this.characterFamilyKey(completion.characterId, completion.familyKey), completion])
    );
    this.lifeEnergyIndex = new Map(state.lifeEnergy.map((entry) => [entry.rosterKey, entry]));
    this.refreshLifeEnergyInputsFromProjection();
    this.rebuildPlannerRosters();
  }

  private rebuildPlannerRosters(): void {
    this.plannerRosters = this.sourceRosters.map((roster) => this.buildPlannerRoster(roster));
  }

  private initializeLifeEnergyInputs(): void {
    for (const roster of this.sourceRosters) {
      if (this.lifeEnergyUiState[roster.key]) {
        continue;
      }

      const projected = projectLifeEnergyStatus(this.lifeEnergyIndex.get(roster.key) ?? {});
      this.lifeEnergyUiState[roster.key] = {
        input: String(projected.currentLifeEnergy),
        status: 'idle',
        message: 'Saved values power Discord reminders.'
      };
    }
  }

  private refreshLifeEnergyInputsFromProjection(): void {
    for (const roster of this.sourceRosters) {
      const currentState = this.lifeEnergyUiState[roster.key];
      if (!currentState || currentState.status === 'saving') {
        continue;
      }

      const projected = projectLifeEnergyStatus(this.lifeEnergyIndex.get(roster.key) ?? {});
      this.lifeEnergyUiState[roster.key] = {
        input: String(projected.currentLifeEnergy),
        status: currentState.status,
        message: currentState.message
      };
    }
  }

  private persistLifeEnergy(rosterKey: string): void {
    const uiState = this.lifeEnergyUiState[rosterKey];
    const nextValue = clampLifeEnergy(uiState?.input ?? 0);

    this.rosterStateService.updateLifeEnergy({
      rosterKey,
      currentLifeEnergy: nextValue
    }).subscribe({
      next: (state) => {
        this.lifeEnergyUiState[rosterKey] = {
          input: String(clampLifeEnergy(nextValue)),
          status: 'saved',
          message: 'Life energy synced for website and Discord reminders.'
        };
        this.applySharedState(state);
      },
      error: () => {
        this.lifeEnergyUiState[rosterKey] = {
          input: String(nextValue),
          status: 'error',
          message: 'Failed to sync life energy. Preview is still local.'
        };
      }
    });
  }

  private getRaidNetGold(raid: CharacterPlannerRaid | undefined): number {
    if (!raid?.completed) {
      return 0;
    }

    return raid.gold - (raid.buysChest ? raid.chestCost : 0);
  }

  private characterFamilyKey(characterId: number, familyKey: string): string {
    return `${characterId}:${familyKey}`;
  }

  private formatLocalTimestamp(value: string): string {
    const date = new Date(value);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }
}
