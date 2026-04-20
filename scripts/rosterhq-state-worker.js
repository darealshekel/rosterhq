import {
  calculateLifeEnergyFromCurrent,
  DISCORD_NONE_OPTION_VALUE,
  getRaidFamilyByCommandName,
  getRaidTierByKey,
  getWeeklyResetContext,
  isRaidTierEligible,
  RAID_FAMILY_DEFINITIONS,
  RAID_TIER_DEFINITIONS,
  ROSTER_OWNER_DEFINITIONS
} from '../src/shared/rosterhq-core.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://darealshekel.github.io',
  'http://127.0.0.1:4200',
  'http://localhost:4200'
];
const REMINDER_TYPE_WEEKLY = 'weekly-checklist';
const REMINDER_TYPE_LIFE_ENERGY = 'life-energy-full';

/**
 * @typedef {{
 *   ROSTERHQ_DB: D1Database;
 *   ALLOWED_ORIGINS?: string;
 *   ROSTER_SYNC_TOKEN?: string;
 *   ROSTERHQ_WRITE_TOKEN?: string;
 *   DISCORD_PUBLIC_KEY?: string;
 *   DISCORD_BOT_TOKEN?: string;
 *   DISCORD_APPLICATION_ID?: string;
 *   DISCORD_GUILD_ID?: string;
 *   DISCORD_REMINDER_CHANNEL_ID?: string;
 *   DISCORD_REMINDER_ROLE_ID?: string;
 *   DISCORD_ROSTER_USER_MAP_JSON?: string;
 * }} Env
 */

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin, env)
      });
    }

    try {
      if (url.pathname === '/api/discord/interactions' && request.method === 'POST') {
        return handleDiscordInteraction(request, env);
      }

      await seedStaticData(env);

      if (url.pathname === '/health') {
        return jsonResponse({ ok: true, now: new Date().toISOString() }, origin, env);
      }

      if (url.pathname === '/api/state' && request.method === 'GET') {
        return jsonResponse(await buildClientState(env), origin, env);
      }

      if (url.pathname === '/api/raid-completions' && request.method === 'PUT') {
        assertWriteAccess(request, env);
        const payload = await request.json().catch(() => null);
        if (!isRaidCompletionMutation(payload)) {
          return jsonResponse({ error: 'Invalid raid completion payload.' }, origin, env, 400);
        }

        await upsertRaidCompletion(env, payload, 'website', { source: 'website' });
        return jsonResponse(await buildClientState(env), origin, env);
      }

      if (url.pathname === '/api/life-energy' && request.method === 'PUT') {
        assertWriteAccess(request, env);
        const payload = await request.json().catch(() => null);
        if (!isLifeEnergyMutation(payload)) {
          return jsonResponse({ error: 'Invalid life energy payload.' }, origin, env, 400);
        }

        await upsertLifeEnergyStatus(env, payload.rosterKey, payload.currentLifeEnergy);
        return jsonResponse(await buildClientState(env), origin, env);
      }

      if (url.pathname === '/api/admin/rosters/sync' && request.method === 'POST') {
        assertAdminAccess(request, env);
        const payload = await request.json().catch(() => null);
        const rosters = Array.isArray(payload) ? payload : payload?.rosters;
        if (!Array.isArray(rosters)) {
          return jsonResponse({ error: 'Expected a rosters array.' }, origin, env, 400);
        }

        await syncRosterSnapshot(env, rosters);
        return jsonResponse({ ok: true, syncedAt: new Date().toISOString() }, origin, env);
      }
    } catch (error) {
      console.error('worker fetch failed', error);
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : 'Unexpected server error.';
      return jsonResponse({ error: message }, origin, env, status);
    }

    return jsonResponse({ error: 'Not found.' }, origin, env, 404);
  },

  /**
   * @param {{ scheduledTime?: number }} controller
   * @param {Env} env
   * @returns {Promise<void>}
   */
  async scheduled(controller, env) {
    await seedStaticData(env);
    const now = new Date(controller.scheduledTime ?? Date.now());
    await processWeeklyChecklistReminder(env, now);
    await processLifeEnergyReminders(env, now);
  }
};

/**
 * @param {Env} env
 * @returns {Promise<void>}
 */
async function seedStaticData(env) {
  const discordUserMap = parseDiscordUserMap(env.DISCORD_ROSTER_USER_MAP_JSON);
  const statements = [];

  for (const roster of ROSTER_OWNER_DEFINITIONS) {
    statements.push(
      env.ROSTERHQ_DB.prepare(`
        INSERT INTO roster_owners (
          roster_key,
          title,
          source_character,
          source_path,
          banner_image,
          banner_accent,
          discord_user_id,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(roster_key) DO UPDATE SET
          title = excluded.title,
          source_character = excluded.source_character,
          source_path = excluded.source_path,
          banner_image = excluded.banner_image,
          banner_accent = excluded.banner_accent,
          discord_user_id = COALESCE(excluded.discord_user_id, roster_owners.discord_user_id),
          updated_at = excluded.updated_at
      `).bind(
        roster.key,
        roster.title,
        roster.sourceCharacter,
        roster.sourcePath,
        roster.bannerImage,
        roster.bannerAccent,
        discordUserMap[roster.key] ?? null,
        new Date().toISOString()
      )
    );
  }

  for (const raid of RAID_TIER_DEFINITIONS) {
    statements.push(
      env.ROSTERHQ_DB.prepare(`
        INSERT INTO raid_definitions (
          raid_key,
          family_key,
          title,
          difficulty,
          item_level,
          gold,
          chest_cost,
          sort_order,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(raid_key) DO UPDATE SET
          family_key = excluded.family_key,
          title = excluded.title,
          difficulty = excluded.difficulty,
          item_level = excluded.item_level,
          gold = excluded.gold,
          chest_cost = excluded.chest_cost,
          sort_order = excluded.sort_order,
          is_active = 1
      `).bind(
        raid.key,
        raid.familyKey,
        raid.title,
        raid.difficulty,
        raid.itemLevel,
        raid.gold,
        raid.chestCost,
        raid.sortOrder
      )
    );
  }

  await env.ROSTERHQ_DB.batch(statements);
}

/**
 * @param {Env} env
 * @returns {Promise<import('../src/app/api-model').RosterSyncState>}
 */
async function buildClientState(env) {
  const reset = getWeeklyResetContext();
  const raidCompletions = await queryAll(
    env,
    `
      SELECT
        id,
        week_id AS weekId,
        roster_key AS rosterKey,
        character_id AS characterId,
        character_name AS characterName,
        family_key AS familyKey,
        raid_key AS raidKey,
        difficulty,
        bought_in AS boughtIn,
        completed_at AS completedAt,
        completed_source AS completedSource
      FROM weekly_raid_completions
      WHERE week_id = ?
      ORDER BY roster_key ASC, character_name ASC
    `,
    [reset.currentWeekId]
  );
  const lifeEnergy = await queryAll(
    env,
    `
      SELECT
        roster_key AS rosterKey,
        current_life_energy,
        life_energy_last_updated_at,
        calculated_full_at,
        reminder_sent_at
      FROM life_energy_status
      ORDER BY roster_key ASC
    `
  );

  return {
    reset,
    raidCompletions: raidCompletions.map((row) => ({
      ...row,
      boughtIn: Boolean(row.boughtIn)
    })),
    lifeEnergy,
    updatedAt: new Date().toISOString(),
    version: Number(new Date().getTime())
  };
}

/**
 * @param {Env} env
 * @param {{ rosterKey: string; characterId: number; raidKey: string; boughtIn: boolean; completed: boolean }} payload
 * @param {'website' | 'discord'} source
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<void>}
 */
async function upsertRaidCompletion(env, payload, source, metadata) {
  const reset = getWeeklyResetContext();
  const tier = getRaidTierByKey(payload.raidKey);
  if (!tier) {
    throw new HttpError(400, `Unknown raid key "${payload.raidKey}".`);
  }

  const character = await queryFirst(
    env,
    `
      SELECT
        character_id AS characterId,
        roster_key AS rosterKey,
        name,
        item_level AS itemLevel
      FROM characters
      WHERE character_id = ? AND roster_key = ?
    `,
    [payload.characterId, payload.rosterKey]
  );

  if (!character) {
    throw new HttpError(400, 'Selected character was not found in that roster snapshot.');
  }

  if (!isRaidTierEligible(character, tier)) {
    throw new HttpError(400, `${character.name} is not eligible for ${tier.title} ${tier.difficulty}.`);
  }

  if (!payload.completed) {
    await execute(
      env,
      `
        DELETE FROM weekly_raid_completions
        WHERE week_id = ? AND character_id = ? AND family_key = ?
      `,
      [reset.currentWeekId, payload.characterId, tier.familyKey]
    );
    return;
  }

  await execute(
    env,
    `
      INSERT INTO weekly_raid_completions (
        week_id,
        roster_key,
        character_id,
        character_name,
        family_key,
        raid_key,
        difficulty,
        bought_in,
        completed_at,
        completed_source,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_id, character_id, family_key) DO UPDATE SET
        roster_key = excluded.roster_key,
        character_name = excluded.character_name,
        raid_key = excluded.raid_key,
        difficulty = excluded.difficulty,
        bought_in = excluded.bought_in,
        completed_at = excluded.completed_at,
        completed_source = excluded.completed_source,
        metadata_json = excluded.metadata_json
    `,
    [
      reset.currentWeekId,
      payload.rosterKey,
      payload.characterId,
      character.name,
      tier.familyKey,
      tier.key,
      tier.difficulty,
      payload.boughtIn ? 1 : 0,
      new Date().toISOString(),
      source,
      JSON.stringify(metadata)
    ]
  );
}

/**
 * @param {Env} env
 * @param {string} rosterKey
 * @param {number} currentLifeEnergy
 * @returns {Promise<void>}
 */
async function upsertLifeEnergyStatus(env, rosterKey, currentLifeEnergy) {
  const roster = ROSTER_OWNER_DEFINITIONS.find((entry) => entry.key === rosterKey);
  if (!roster) {
    throw new HttpError(400, `Unknown roster "${rosterKey}".`);
  }

  const computed = calculateLifeEnergyFromCurrent(currentLifeEnergy, new Date());
  const nowIso = new Date().toISOString();

  await execute(
    env,
    `
      INSERT INTO life_energy_status (
        roster_key,
        current_life_energy,
        life_energy_last_updated_at,
        calculated_full_at,
        reminder_sent_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(roster_key) DO UPDATE SET
        current_life_energy = excluded.current_life_energy,
        life_energy_last_updated_at = excluded.life_energy_last_updated_at,
        calculated_full_at = excluded.calculated_full_at,
        reminder_sent_at = excluded.reminder_sent_at,
        updated_at = excluded.updated_at
    `,
    [
      rosterKey,
      computed.currentLifeEnergy,
      nowIso,
      computed.fullAt,
      computed.isFull ? nowIso : null,
      nowIso
    ]
  );
}

/**
 * @param {Env} env
 * @param {Array<any>} rosters
 * @returns {Promise<void>}
 */
async function syncRosterSnapshot(env, rosters) {
  const discordUserMap = parseDiscordUserMap(env.DISCORD_ROSTER_USER_MAP_JSON);
  const statements = [];

  for (const roster of rosters) {
    const owner = ROSTER_OWNER_DEFINITIONS.find((entry) => entry.key === roster.key);
    if (!owner) {
      continue;
    }

    const primaryIds = new Set((Array.isArray(roster.characters) ? roster.characters : []).map((character) => character.id));
    statements.push(
      env.ROSTERHQ_DB.prepare(`
        INSERT INTO roster_owners (
          roster_key,
          title,
          source_character,
          source_path,
          banner_image,
          banner_accent,
          discord_user_id,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(roster_key) DO UPDATE SET
          title = excluded.title,
          source_character = excluded.source_character,
          source_path = excluded.source_path,
          banner_image = excluded.banner_image,
          banner_accent = excluded.banner_accent,
          discord_user_id = COALESCE(excluded.discord_user_id, roster_owners.discord_user_id),
          updated_at = excluded.updated_at
      `).bind(
        owner.key,
        roster.title ?? owner.title,
        roster.sourceCharacter ?? owner.sourceCharacter,
        roster.sourcePath ?? owner.sourcePath,
        roster.bannerImage ?? owner.bannerImage,
        roster.bannerAccent ?? owner.bannerAccent,
        discordUserMap[owner.key] ?? null,
        new Date().toISOString()
      )
    );
    statements.push(env.ROSTERHQ_DB.prepare(`DELETE FROM characters WHERE roster_key = ?`).bind(owner.key));

    for (const character of Array.isArray(roster.allCharacters) ? roster.allCharacters : []) {
      statements.push(
        env.ROSTERHQ_DB.prepare(`
          INSERT INTO characters (
            character_id,
            roster_key,
            name,
            normalized_name,
            class_key,
            class_label,
            item_level,
            combat_power,
            combat_power_is_estimate,
            last_update,
            character_url,
            is_primary,
            snapshot_updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          character.id,
          owner.key,
          character.name,
          character.name.toLowerCase(),
          character.classKey,
          character.classLabel,
          Number(character.itemLevel ?? 0),
          Number(character.combatPower ?? 0),
          character.combatPowerIsEstimate ? 1 : 0,
          Number(character.lastUpdate ?? 0),
          character.characterUrl,
          primaryIds.has(character.id) ? 1 : 0,
          new Date().toISOString()
        )
      );
    }
  }

  await env.ROSTERHQ_DB.batch(statements);
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function handleDiscordInteraction(request, env) {
  if (!env.DISCORD_PUBLIC_KEY) {
    return new Response('Discord public key is not configured.', { status: 500 });
  }

  /** @type {any | null} */
  let interaction = null;

  try {
    const timestamp = request.headers.get('X-Signature-Timestamp');
    const signature = request.headers.get('X-Signature-Ed25519');
    const body = await request.text();
    const verified = await verifyDiscordSignature(env.DISCORD_PUBLIC_KEY, timestamp, body, signature);

    if (!verified) {
      return new Response('Invalid request signature.', { status: 401 });
    }

    interaction = JSON.parse(body);

    if (interaction.type === 1) {
      return discordJson({ type: 1 });
    }

    if (interaction.type === 4) {
      return discordJson(await buildAutocompleteResponse(env, interaction));
    }

    if (interaction.type === 2) {
      return discordJson(await handleRaidCommand(env, interaction));
    }

    return discordJson({
      type: 4,
      data: {
        content: 'Unsupported Discord interaction.',
        flags: 64
      }
    });
  } catch (error) {
    console.error('discord interaction failed', error);

    if (interaction?.type === 2 || interaction?.type === 4) {
      return discordJson(buildEphemeralMessage('Roster HQ failed to process that Discord request.'));
    }

    return new Response('Internal interaction error.', { status: 500 });
  }
}

/**
 * @param {Env} env
 * @param {any} interaction
 * @returns {Promise<any>}
 */
async function buildAutocompleteResponse(env, interaction) {
  const family = getRaidFamilyByCommandName(interaction.data?.name);
  if (!family) {
    return { type: 8, data: { choices: [] } };
  }

  const optionMap = extractOptionMap(interaction.data?.options ?? []);
  const focused = extractFocusedOption(interaction.data?.options ?? []);
  const rosterKey = focused?.name;

  if (!rosterKey) {
    return { type: 8, data: { choices: [] } };
  }

  const difficulty = optionMap.get('difficulty');
  const selectedTier = family.tiers.find((tier) => tier.difficulty === difficulty);
  const characters = await queryAll(
    env,
    `
      SELECT
        character_id AS characterId,
        name,
        item_level AS itemLevel
      FROM characters
      WHERE roster_key = ? AND is_primary = 1
      ORDER BY item_level DESC, name ASC
    `,
    [rosterKey]
  );
  const filtered = selectedTier
    ? characters.filter((character) => isRaidTierEligible(character, selectedTier))
    : characters;
  const choices = [
    { name: 'NONE', value: DISCORD_NONE_OPTION_VALUE },
    ...filtered.map((character) => ({
      name: `${character.name} (${Number(character.itemLevel).toFixed(2)})`,
      value: String(character.characterId)
    }))
  ].slice(0, 25);

  return {
    type: 8,
    data: {
      choices
    }
  };
}

/**
 * @param {Env} env
 * @param {any} interaction
 * @returns {Promise<any>}
 */
async function handleRaidCommand(env, interaction) {
  const family = getRaidFamilyByCommandName(interaction.data?.name);
  if (!family) {
    return buildEphemeralMessage('Unknown raid command.');
  }

  const optionMap = extractOptionMap(interaction.data?.options ?? []);
  const difficulty = optionMap.get('difficulty');
  const tier = family.tiers.find((candidate) => candidate.difficulty === difficulty);
  if (!tier) {
    return buildEphemeralMessage('Select a valid difficulty.');
  }

  const selections = [];

  for (const roster of ROSTER_OWNER_DEFINITIONS) {
    const characterValue = optionMap.get(roster.key);
    const boughtIn = optionMap.get(`${roster.key}_bought_in`) === true;

    if (!characterValue || characterValue === DISCORD_NONE_OPTION_VALUE) {
      selections.push({ roster, value: 'None', characterId: null, boughtIn: false });
      continue;
    }

    const characterId = Number(characterValue);
    if (!Number.isFinite(characterId)) {
      return buildEphemeralMessage(`Invalid character selection for ${roster.title}.`);
    }

    const character = await queryFirst(
      env,
      `
        SELECT
          character_id AS characterId,
          name,
          item_level AS itemLevel
        FROM characters
        WHERE character_id = ? AND roster_key = ? AND is_primary = 1
      `,
      [characterId, roster.key]
    );

    if (!character) {
      return buildEphemeralMessage(`${roster.title} does not have that character in the current tracked roster.`);
    }

    if (!isRaidTierEligible(character, tier)) {
      return buildEphemeralMessage(`${character.name} is not eligible for ${family.title} ${tier.difficulty}.`);
    }

    selections.push({
      roster,
      value: character.name,
      characterId,
      boughtIn
    });
  }

  if (!selections.some((selection) => selection.characterId !== null)) {
    return buildEphemeralMessage('Pick at least one character or this command does nothing.');
  }

  for (const selection of selections) {
    if (selection.characterId === null) {
      continue;
    }

    await upsertRaidCompletion(
      env,
      {
        rosterKey: selection.roster.key,
        characterId: selection.characterId,
        raidKey: tier.key,
        boughtIn: selection.boughtIn,
        completed: true
      },
      'discord',
      {
        discordUserId: interaction.member?.user?.id ?? interaction.user?.id ?? null,
        discordUsername: interaction.member?.user?.username ?? interaction.user?.username ?? null,
        commandName: family.commandName
      }
    );
  }

  const lines = [
    `Raid: ${family.title}`,
    `Difficulty: ${tier.difficulty === 'NIGHTMARE' ? 'Nightmare' : tier.difficulty}`,
    ...selections.map((selection) => (
      selection.characterId === null
        ? `${selection.roster.title.replace("'s Roster", '')}: None`
        : `${selection.roster.title.replace("'s Roster", '')}: ${selection.value} (Bought In: ${selection.boughtIn ? 'Yes' : 'No'})`
    )),
    'Status: Weekly completion synced successfully'
  ];

  return buildEphemeralMessage(lines.join('\n'));
}

/**
 * @param {Env} env
 * @param {Date} now
 * @returns {Promise<void>}
 */
async function processWeeklyChecklistReminder(env, now) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_REMINDER_CHANNEL_ID) {
    return;
  }

  const reset = getWeeklyResetContext(now);
  const reminderAt = new Date(reset.weeklyReminderAt);
  const nextResetAt = new Date(reset.nextWeeklyResetAt);

  if (now < reminderAt || now >= nextResetAt) {
    return;
  }

  const cycleKey = reset.nextWeeklyResetAt;
  const inserted = await insertReminderReservation(env, REMINDER_TYPE_WEEKLY, cycleKey, 'all');
  if (!inserted) {
    return;
  }

  try {
    const mention = await buildWeeklyReminderMention(env);
    const prefix = mention ? `${mention} ` : '';
    await sendDiscordMessage(
      env,
      `${prefix}Reminder: do your Hourglass, Paradise, Crucible, and Hell keys before weekly reset tomorrow.`
    );
  } catch (error) {
    await releaseReminderReservation(env, REMINDER_TYPE_WEEKLY, cycleKey, 'all');
    throw error;
  }
}

/**
 * @param {Env} env
 * @param {Date} now
 * @returns {Promise<void>}
 */
async function processLifeEnergyReminders(env, now) {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_REMINDER_CHANNEL_ID) {
    return;
  }

  const dueStatuses = await queryAll(
    env,
    `
      SELECT
        status.roster_key AS rosterKey,
        owners.title,
        owners.discord_user_id AS discordUserId,
        status.calculated_full_at AS calculatedFullAt
      FROM life_energy_status AS status
      JOIN roster_owners AS owners
        ON owners.roster_key = status.roster_key
      WHERE status.calculated_full_at IS NOT NULL
        AND status.reminder_sent_at IS NULL
        AND status.calculated_full_at <= ?
    `,
    [now.toISOString()]
  );

  for (const status of dueStatuses) {
    const cycleKey = status.calculatedFullAt;
    const inserted = await insertReminderReservation(env, REMINDER_TYPE_LIFE_ENERGY, cycleKey, status.rosterKey);
    if (!inserted) {
      continue;
    }

    try {
      const mention = status.discordUserId ? `<@${status.discordUserId}>` : status.title;
      await sendDiscordMessage(env, `${mention} Your life energy is now full.`);
      await execute(
        env,
        `
          UPDATE life_energy_status
          SET reminder_sent_at = ?, updated_at = ?
          WHERE roster_key = ?
        `,
        [now.toISOString(), now.toISOString(), status.rosterKey]
      );
    } catch (error) {
      await releaseReminderReservation(env, REMINDER_TYPE_LIFE_ENERGY, cycleKey, status.rosterKey);
      throw error;
    }
  }
}

/**
 * @param {Env} env
 * @returns {Promise<string>}
 */
async function buildWeeklyReminderMention(env) {
  if (env.DISCORD_REMINDER_ROLE_ID) {
    return `<@&${env.DISCORD_REMINDER_ROLE_ID}>`;
  }

  const owners = await queryAll(
    env,
    `
      SELECT discord_user_id AS discordUserId
      FROM roster_owners
      WHERE discord_user_id IS NOT NULL
      ORDER BY roster_key ASC
    `
  );

  return owners
    .map((owner) => owner.discordUserId)
    .filter(Boolean)
    .map((userId) => `<@${userId}>`)
    .join(' ');
}

/**
 * @param {Env} env
 * @param {string} content
 * @returns {Promise<void>}
 */
async function sendDiscordMessage(env, content) {
  const response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_REMINDER_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content,
      allowed_mentions: {
        parse: ['roles', 'users']
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to send Discord message: ${response.status} ${body}`);
  }
}

/**
 * @param {Env} env
 * @param {string} reminderType
 * @param {string} cycleKey
 * @param {string} rosterKey
 * @returns {Promise<boolean>}
 */
async function insertReminderReservation(env, reminderType, cycleKey, rosterKey) {
  const result = await execute(
    env,
    `
      INSERT OR IGNORE INTO reminder_dispatches (
        reminder_type,
        cycle_key,
        roster_key,
        channel_id,
        sent_at,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      reminderType,
      cycleKey,
      rosterKey,
      env.DISCORD_REMINDER_CHANNEL_ID ?? null,
      new Date().toISOString(),
      null
    ]
  );

  return Number(result?.meta?.changes ?? 0) > 0;
}

/**
 * @param {Env} env
 * @param {string} reminderType
 * @param {string} cycleKey
 * @param {string} rosterKey
 * @returns {Promise<void>}
 */
async function releaseReminderReservation(env, reminderType, cycleKey, rosterKey) {
  await execute(
    env,
    `
      DELETE FROM reminder_dispatches
      WHERE reminder_type = ? AND cycle_key = ? AND roster_key = ?
    `,
    [reminderType, cycleKey, rosterKey]
  );
}

/**
 * @param {string} publicKeyHex
 * @param {string | null} timestamp
 * @param {string} body
 * @param {string | null} signatureHex
 * @returns {Promise<boolean>}
 */
async function verifyDiscordSignature(publicKeyHex, timestamp, body, signatureHex) {
  if (!timestamp || !signatureHex) {
    return false;
  }

  const encoder = new TextEncoder();
  const publicKey = await crypto.subtle.importKey(
    'raw',
    hexToBytes(publicKeyHex),
    { name: 'Ed25519' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    hexToBytes(signatureHex),
    encoder.encode(`${timestamp}${body}`)
  );
}

/**
 * @param {string} value
 * @returns {Uint8Array}
 */
function hexToBytes(value) {
  const pairs = value.match(/.{1,2}/g) ?? [];
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
}

/**
 * @param {Array<any>} options
 * @returns {Map<string, any>}
 */
function extractOptionMap(options) {
  const optionMap = new Map();
  for (const option of options) {
    optionMap.set(option.name, option.value);
  }
  return optionMap;
}

/**
 * @param {Array<any>} options
 * @returns {any | undefined}
 */
function extractFocusedOption(options) {
  return options.find((option) => option.focused === true);
}

/**
 * @param {string} message
 * @returns {any}
 */
function buildEphemeralMessage(message) {
  return {
    type: 4,
    data: {
      content: message,
      flags: 64
    }
  };
}

/**
 * @param {unknown} payload
 * @returns {payload is { rosterKey: string; characterId: number; raidKey: string; boughtIn: boolean; completed: boolean }}
 */
function isRaidCompletionMutation(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.rosterKey === 'string' &&
    typeof payload.characterId === 'number' &&
    typeof payload.raidKey === 'string' &&
    typeof payload.boughtIn === 'boolean' &&
    typeof payload.completed === 'boolean'
  );
}

/**
 * @param {unknown} payload
 * @returns {payload is { rosterKey: string; currentLifeEnergy: number }}
 */
function isLifeEnergyMutation(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.rosterKey === 'string' &&
    typeof payload.currentLifeEnergy === 'number'
  );
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {void}
 */
function assertAdminAccess(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('X-RosterHQ-Sync-Token');
  if (!env.ROSTER_SYNC_TOKEN || token !== env.ROSTER_SYNC_TOKEN) {
    throw new HttpError(401, 'Missing or invalid roster sync token.');
  }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {void}
 */
function assertWriteAccess(request, env) {
  if (!env.ROSTERHQ_WRITE_TOKEN) {
    return;
  }

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? request.headers.get('X-RosterHQ-Write-Token');
  if (token !== env.ROSTERHQ_WRITE_TOKEN) {
    throw new HttpError(401, 'Missing or invalid write token.');
  }
}

/**
 * @param {string | null} origin
 * @param {Env} env
 * @returns {HeadersInit}
 */
function buildCorsHeaders(origin, env) {
  const allowedOrigins = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [])
  ]);
  const allowOrigin = allowedOrigins.has(origin ?? '') ? origin : DEFAULT_ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RosterHQ-Sync-Token, X-RosterHQ-Write-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

/**
 * @param {unknown} body
 * @param {string | null} origin
 * @param {Env} env
 * @param {number} [status]
 * @returns {Response}
 */
function jsonResponse(body, origin, env, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...buildCorsHeaders(origin, env)
    }
  });
}

/**
 * @param {unknown} body
 * @returns {Response}
 */
function discordJson(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

/**
 * @param {Env} env
 * @param {string} sql
 * @param {Array<any>} [bindings]
 * @returns {Promise<any>}
 */
async function execute(env, sql, bindings = []) {
  return env.ROSTERHQ_DB.prepare(sql).bind(...bindings).run();
}

/**
 * @param {Env} env
 * @param {string} sql
 * @param {Array<any>} [bindings]
 * @returns {Promise<Array<any>>}
 */
async function queryAll(env, sql, bindings = []) {
  const result = await env.ROSTERHQ_DB.prepare(sql).bind(...bindings).all();
  return result.results ?? [];
}

/**
 * @param {Env} env
 * @param {string} sql
 * @param {Array<any>} [bindings]
 * @returns {Promise<any | null>}
 */
async function queryFirst(env, sql, bindings = []) {
  const result = await env.ROSTERHQ_DB.prepare(sql).bind(...bindings).first();
  return result ?? null;
}

/**
 * @param {string | undefined} rawValue
 * @returns {Record<string, string>}
 */
function parseDiscordUserMap(rawValue) {
  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
