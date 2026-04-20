export interface RawRosterEntry {
  id: number;
  name: string;
  class: string;
  ilvl: number;
  combatPower: {
    id: number;
    score: number;
  };
  combatPowerIsEstimate: boolean;
  lastUpdate: number;
}

export interface CharacterEntry {
  id: number;
  name: string;
  classKey: string;
  classLabel: string;
  itemLevel: number;
  combatPower: number;
  combatPowerIsEstimate: boolean;
  lastUpdate: number;
  characterUrl: string;
}

export interface GroupRoster {
  key: string;
  title: string;
  sourcePath: string;
  sourceCharacter: string;
  bannerImage: string;
  bannerAccent: string;
  characters: CharacterEntry[];
  allCharacters: CharacterEntry[];
  averageItemLevel: number;
  averageCombatPower: number;
  highestItemLevel: number;
}

export interface RaidColumn {
  key: string;
  count: number;
  names: string[];
  completedCount: number;
  earnedGold: number;
}

export interface RaidRow {
  key: string;
  family: string;
  name: string;
  itemLevel: number;
  goldReward: number;
  totalEligible: number;
  everyRosterReady: boolean;
  rosterColumns: RaidColumn[];
}

export interface RosterGoldSummary {
  key: string;
  title: string;
  totalGold: number;
  completedRaids: number;
  availableRaids: number;
}

export type RaidDifficulty = 'NM' | 'HM' | 'NIGHTMARE';

export interface ResetContext {
  now: string;
  timeZone: string;
  currentWeeklyStartAt: string;
  nextWeeklyResetAt: string;
  weeklyReminderAt: string;
  currentWeekId: string;
}

export interface WeeklyRaidCompletionRecord {
  id?: number;
  weekId: string;
  rosterKey: string;
  characterId: number;
  characterName: string;
  familyKey: string;
  raidKey: string;
  difficulty: RaidDifficulty;
  boughtIn: boolean;
  completedAt: string;
  completedSource: 'website' | 'discord';
}

export interface LifeEnergyStatusRecord {
  rosterKey: string;
  current_life_energy: number;
  life_energy_last_updated_at: string;
  calculated_full_at: string | null;
  reminder_sent_at: string | null;
}

export interface RosterSyncState {
  reset: ResetContext;
  raidCompletions: WeeklyRaidCompletionRecord[];
  lifeEnergy: LifeEnergyStatusRecord[];
  updatedAt?: string;
  version?: number;
}
