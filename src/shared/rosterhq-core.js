/**
 * Shared Roster HQ data model and business rules used by the website,
 * the Cloudflare worker, and Discord command tooling.
 */

export const RESET_TIME_ZONE = 'Asia/Jerusalem';
export const RESET_HOUR = 13;
export const RESET_MINUTE = 0;
export const LIFE_ENERGY_MAX = 11500;
export const LIFE_ENERGY_RESTORE_AMOUNT = 33;
export const LIFE_ENERGY_RESTORE_WINDOW_MINUTES = 10;
export const LIFE_ENERGY_WINDOW_MS = LIFE_ENERGY_RESTORE_WINDOW_MINUTES * 60 * 1000;
export const LIFE_ENERGY_RESTORE_PER_MS = LIFE_ENERGY_RESTORE_AMOUNT / LIFE_ENERGY_WINDOW_MS;
export const DISCORD_NONE_OPTION_VALUE = 'none';

/**
 * @typedef {'NM' | 'HM' | 'NIGHTMARE'} RaidDifficulty
 */

/**
 * @typedef {{
 *   key: string;
 *   familyKey: string;
 *   title: string;
 *   difficulty: RaidDifficulty;
 *   itemLevel: number;
 *   gold: number;
 *   chestCost: number;
 *   sortOrder: number;
 * }} RaidTierDefinition
 */

/**
 * @typedef {{
 *   key: string;
 *   commandName: string;
 *   title: string;
 *   sortOrder: number;
 *   tiers: RaidTierDefinition[];
 * }} RaidFamilyDefinition
 */

/**
 * @typedef {{
 *   key: string;
 *   title: string;
 *   sourceCharacter: string;
 *   sourcePath: string;
 *   bannerImage: string;
 *   bannerAccent: string;
 * }} RosterOwnerDefinition
 */

/**
 * @typedef {{
 *   currentLifeEnergy: number;
 *   maxLifeEnergy: number;
 *   missingLifeEnergy: number;
 *   exactCurrentLifeEnergy: number;
 *   isFull: boolean;
 *   msUntilFull: number;
 *   fullAt: string | null;
 * }} LifeEnergyComputation
 */

export const ROSTER_OWNER_DEFINITIONS = [
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

export const RAID_FAMILY_DEFINITIONS = [
  {
    key: 'act-4',
    commandName: 'act-4',
    title: 'Act 4',
    sortOrder: 10,
    tiers: [
      {
        key: 'act-4-nm',
        familyKey: 'act-4',
        title: 'Act 4',
        difficulty: 'NM',
        itemLevel: 1700,
        gold: 33000,
        chestCost: 10560,
        sortOrder: 1
      },
      {
        key: 'act-4-hm',
        familyKey: 'act-4',
        title: 'Act 4',
        difficulty: 'HM',
        itemLevel: 1720,
        gold: 42000,
        chestCost: 13440,
        sortOrder: 2
      }
    ]
  },
  {
    key: 'final-day',
    commandName: 'final-day',
    title: 'Final Day',
    sortOrder: 20,
    tiers: [
      {
        key: 'final-day-nm',
        familyKey: 'final-day',
        title: 'Final Day',
        difficulty: 'NM',
        itemLevel: 1710,
        gold: 40000,
        chestCost: 12800,
        sortOrder: 1
      },
      {
        key: 'final-day-hm',
        familyKey: 'final-day',
        title: 'Final Day',
        difficulty: 'HM',
        itemLevel: 1730,
        gold: 52000,
        chestCost: 16640,
        sortOrder: 2
      }
    ]
  },
  {
    key: 'serca',
    commandName: 'serca',
    title: 'Serca',
    sortOrder: 30,
    tiers: [
      {
        key: 'serca-nm',
        familyKey: 'serca',
        title: 'Serca',
        difficulty: 'NM',
        itemLevel: 1710,
        gold: 35000,
        chestCost: 11200,
        sortOrder: 1
      },
      {
        key: 'serca-hm',
        familyKey: 'serca',
        title: 'Serca',
        difficulty: 'HM',
        itemLevel: 1730,
        gold: 44000,
        chestCost: 14080,
        sortOrder: 2
      },
      {
        key: 'serca-nightmare',
        familyKey: 'serca',
        title: 'Serca',
        difficulty: 'NIGHTMARE',
        itemLevel: 1740,
        gold: 54000,
        chestCost: 17280,
        sortOrder: 3
      }
    ]
  }
];

export const RAID_TIER_DEFINITIONS = RAID_FAMILY_DEFINITIONS.flatMap((family) => family.tiers);

const raidFamilyByKey = new Map(RAID_FAMILY_DEFINITIONS.map((family) => [family.key, family]));
const raidFamilyByCommandName = new Map(RAID_FAMILY_DEFINITIONS.map((family) => [family.commandName, family]));
const raidTierByKey = new Map(RAID_TIER_DEFINITIONS.map((tier) => [tier.key, tier]));
const classLabels = {
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
const sercaNightmareCharacters = new Set(['broke', 'scrabb', 'ardeo', 'sscombatscore', 'combatscore']);

/**
 * @param {string} classKey
 * @returns {string}
 */
export function formatClassLabel(classKey) {
  if (classLabels[classKey]) {
    return classLabels[classKey];
  }

  return classKey
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * @param {string} characterName
 * @returns {string}
 */
export function normalizeCharacterName(characterName) {
  let normalizedName = characterName.toLowerCase();

  try {
    normalizedName = normalizedName.normalize('NFKD');
  } catch {
    // String normalization is not available in every runtime.
  }

  return normalizedName
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

/**
 * @param {string} characterName
 * @returns {boolean}
 */
export function canRunSercaNightmare(characterName) {
  return sercaNightmareCharacters.has(normalizeCharacterName(characterName));
}

/**
 * @param {string} familyKey
 * @returns {RaidFamilyDefinition | undefined}
 */
export function getRaidFamilyByKey(familyKey) {
  return raidFamilyByKey.get(familyKey);
}

/**
 * @param {string} commandName
 * @returns {RaidFamilyDefinition | undefined}
 */
export function getRaidFamilyByCommandName(commandName) {
  return raidFamilyByCommandName.get(commandName);
}

/**
 * @param {string} raidKey
 * @returns {RaidTierDefinition | undefined}
 */
export function getRaidTierByKey(raidKey) {
  return raidTierByKey.get(raidKey);
}

/**
 * @param {RaidDifficulty} difficulty
 * @returns {string}
 */
export function getDifficultyLabel(difficulty) {
  return difficulty === 'NIGHTMARE' ? 'NMR' : difficulty;
}

/**
 * @param {{ itemLevel: number; name: string }} character
 * @param {RaidTierDefinition} tier
 * @returns {boolean}
 */
export function isRaidTierEligible(character, tier) {
  if (character.itemLevel < tier.itemLevel) {
    return false;
  }

  return !(tier.familyKey === 'serca' && tier.difficulty === 'NIGHTMARE' && !canRunSercaNightmare(character.name));
}

/**
 * @param {{ itemLevel: number; name: string }} character
 * @param {RaidFamilyDefinition} family
 * @returns {RaidTierDefinition | undefined}
 */
export function resolveEligibleRaidTier(character, family) {
  const sortedTiers = family.tiers
    .slice()
    .sort((left, right) => right.itemLevel - left.itemLevel);

  return sortedTiers.find((tier) => isRaidTierEligible(character, tier));
}

/**
 * @param {Date} date
 * @param {string} [timeZone]
 * @returns {{ year: number; month: number; day: number; hour: number; minute: number; second: number }}
 */
export function getZonedParts(date, timeZone = RESET_TIME_ZONE) {
  let formatter;

  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
  }

  const parts = formatter.formatToParts(date);
  const read = (type) => Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second')
  };
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {number} second
 * @param {string} [timeZone]
 * @returns {Date}
 */
export function zonedDateTimeToUtcDate(year, month, day, hour, minute, second, timeZone = RESET_TIME_ZONE) {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desiredUtc;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const zoned = getZonedParts(new Date(guess), timeZone);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    guess += desiredUtc - zonedAsUtc;
  }

  return new Date(guess);
}

/**
 * @param {{ hour: number; minute: number; second: number }} local
 * @returns {boolean}
 */
export function isAtOrPastReset(local) {
  if (local.hour > RESET_HOUR) {
    return true;
  }

  if (local.hour < RESET_HOUR) {
    return false;
  }

  if (local.minute > RESET_MINUTE) {
    return true;
  }

  return local.minute === RESET_MINUTE && local.second >= 0;
}

/**
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {{
 *   now: string;
 *   timeZone: string;
 *   currentWeeklyStartAt: string;
 *   nextWeeklyResetAt: string;
 *   weeklyReminderAt: string;
 *   currentWeekId: string;
 * }}
 */
export function getWeeklyResetContext(now = new Date(), timeZone = RESET_TIME_ZONE) {
  const local = getZonedParts(now, timeZone);
  const todayAtReset = zonedDateTimeToUtcDate(
    local.year,
    local.month,
    local.day,
    RESET_HOUR,
    RESET_MINUTE,
    0,
    timeZone
  );
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  let nextWeeklyOffset = (3 - weekday + 7) % 7;

  if (nextWeeklyOffset === 0 && isAtOrPastReset(local)) {
    nextWeeklyOffset = 7;
  }

  const nextResetBase = new Date(Date.UTC(local.year, local.month - 1, local.day));
  nextResetBase.setUTCDate(nextResetBase.getUTCDate() + nextWeeklyOffset);

  const nextWeeklyResetAt = zonedDateTimeToUtcDate(
    nextResetBase.getUTCFullYear(),
    nextResetBase.getUTCMonth() + 1,
    nextResetBase.getUTCDate(),
    RESET_HOUR,
    RESET_MINUTE,
    0,
    timeZone
  );
  const currentWeeklyStartAt = new Date(nextWeeklyResetAt.getTime() - (7 * 24 * 60 * 60 * 1000));
  const weeklyReminderAt = new Date(nextWeeklyResetAt.getTime() - (24 * 60 * 60 * 1000));

  return {
    now: now.toISOString(),
    timeZone,
    currentWeeklyStartAt: currentWeeklyStartAt.toISOString(),
    nextWeeklyResetAt: nextWeeklyResetAt.toISOString(),
    weeklyReminderAt: weeklyReminderAt.toISOString(),
    currentWeekId: currentWeeklyStartAt.toISOString()
  };
}

/**
 * @param {Date} [now]
 * @param {string} [timeZone]
 * @returns {Date}
 */
export function getNextDailyResetAt(now = new Date(), timeZone = RESET_TIME_ZONE) {
  const local = getZonedParts(now, timeZone);
  const base = new Date(Date.UTC(local.year, local.month - 1, local.day));

  if (isAtOrPastReset(local)) {
    base.setUTCDate(base.getUTCDate() + 1);
  }

  return zonedDateTimeToUtcDate(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    RESET_HOUR,
    RESET_MINUTE,
    0,
    timeZone
  );
}

/**
 * @param {number | string | null | undefined} value
 * @returns {number}
 */
export function clampLifeEnergy(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(LIFE_ENERGY_MAX, Math.max(0, Math.round(parsed)));
}

/**
 * @param {number | string | null | undefined} value
 * @param {Date} [updatedAt]
 * @returns {LifeEnergyComputation}
 */
export function calculateLifeEnergyFromCurrent(value, updatedAt = new Date()) {
  const currentLifeEnergy = clampLifeEnergy(value);
  const exactCurrentLifeEnergy = currentLifeEnergy;
  const missingLifeEnergy = Math.max(0, LIFE_ENERGY_MAX - currentLifeEnergy);
  const msUntilFull = missingLifeEnergy === 0
    ? 0
    : Math.ceil((missingLifeEnergy * LIFE_ENERGY_WINDOW_MS) / LIFE_ENERGY_RESTORE_AMOUNT);
  const fullAt = new Date(updatedAt.getTime() + msUntilFull);

  return {
    currentLifeEnergy,
    maxLifeEnergy: LIFE_ENERGY_MAX,
    missingLifeEnergy,
    exactCurrentLifeEnergy,
    isFull: missingLifeEnergy === 0,
    msUntilFull,
    fullAt: missingLifeEnergy === 0 ? updatedAt.toISOString() : fullAt.toISOString()
  };
}

/**
 * @param {{
 *   current_life_energy?: number | string | null;
 *   life_energy_last_updated_at?: string | null;
 *   calculated_full_at?: string | null;
 * }} status
 * @param {Date} [now]
 * @returns {LifeEnergyComputation}
 */
export function projectLifeEnergyStatus(status, now = new Date()) {
  const baseCurrent = clampLifeEnergy(status.current_life_energy ?? 0);
  const updatedAt = status.life_energy_last_updated_at
    ? new Date(status.life_energy_last_updated_at)
    : now;
  const fullAt = status.calculated_full_at ? new Date(status.calculated_full_at) : null;
  const elapsedMs = Math.max(0, now.getTime() - updatedAt.getTime());
  const regenerated = elapsedMs * LIFE_ENERGY_RESTORE_PER_MS;
  const exactCurrentLifeEnergy = Math.min(LIFE_ENERGY_MAX, baseCurrent + regenerated);
  const currentLifeEnergy = Math.min(LIFE_ENERGY_MAX, Math.floor(exactCurrentLifeEnergy));
  const missingLifeEnergy = Math.max(0, LIFE_ENERGY_MAX - currentLifeEnergy);
  const msUntilFull = fullAt
    ? Math.max(0, fullAt.getTime() - now.getTime())
    : Math.max(
      0,
      Math.ceil(((LIFE_ENERGY_MAX - exactCurrentLifeEnergy) * LIFE_ENERGY_WINDOW_MS) / LIFE_ENERGY_RESTORE_AMOUNT)
    );

  return {
    currentLifeEnergy,
    maxLifeEnergy: LIFE_ENERGY_MAX,
    missingLifeEnergy,
    exactCurrentLifeEnergy,
    isFull: currentLifeEnergy >= LIFE_ENERGY_MAX || msUntilFull === 0,
    msUntilFull,
    fullAt: fullAt ? fullAt.toISOString() : calculateLifeEnergyFromCurrent(baseCurrent, updatedAt).fullAt
  };
}

/**
 * @param {number} msUntilFull
 * @returns {string}
 */
export function formatLifeEnergyRemaining(msUntilFull) {
  if (msUntilFull <= 0) {
    return 'Already full';
  }

  const totalMinutes = Math.ceil(msUntilFull / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }

  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * @param {string | Date | null | undefined} value
 * @returns {Date | null}
 */
export function toOptionalDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
