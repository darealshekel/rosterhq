CREATE TABLE IF NOT EXISTS roster_owners (
  roster_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_character TEXT NOT NULL,
  source_path TEXT NOT NULL,
  banner_image TEXT NOT NULL DEFAULT '',
  banner_accent TEXT NOT NULL,
  discord_user_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  character_id INTEGER PRIMARY KEY,
  roster_key TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  class_key TEXT NOT NULL,
  class_label TEXT NOT NULL,
  item_level REAL NOT NULL,
  combat_power REAL NOT NULL,
  combat_power_is_estimate INTEGER NOT NULL DEFAULT 0,
  last_update INTEGER NOT NULL,
  character_url TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  snapshot_updated_at TEXT NOT NULL,
  FOREIGN KEY (roster_key) REFERENCES roster_owners(roster_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_characters_roster
  ON characters (roster_key, is_primary DESC, item_level DESC, name ASC);

CREATE TABLE IF NOT EXISTS raid_definitions (
  raid_key TEXT PRIMARY KEY,
  family_key TEXT NOT NULL,
  title TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  item_level INTEGER NOT NULL,
  gold INTEGER NOT NULL,
  chest_cost INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_raid_definitions_family
  ON raid_definitions (family_key, sort_order ASC);

CREATE TABLE IF NOT EXISTS weekly_raid_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id TEXT NOT NULL,
  roster_key TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  character_name TEXT NOT NULL,
  family_key TEXT NOT NULL,
  raid_key TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  bought_in INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT NOT NULL,
  completed_source TEXT NOT NULL,
  metadata_json TEXT,
  UNIQUE (week_id, character_id, family_key),
  FOREIGN KEY (roster_key) REFERENCES roster_owners(roster_key) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(character_id) ON DELETE CASCADE,
  FOREIGN KEY (raid_key) REFERENCES raid_definitions(raid_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weekly_raid_completions_week
  ON weekly_raid_completions (week_id, roster_key, character_name);

CREATE TABLE IF NOT EXISTS life_energy_status (
  roster_key TEXT PRIMARY KEY,
  current_life_energy INTEGER NOT NULL,
  life_energy_last_updated_at TEXT NOT NULL,
  calculated_full_at TEXT,
  reminder_sent_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (roster_key) REFERENCES roster_owners(roster_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_life_energy_due
  ON life_energy_status (calculated_full_at, reminder_sent_at);

CREATE TABLE IF NOT EXISTS reminder_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reminder_type TEXT NOT NULL,
  cycle_key TEXT NOT NULL,
  roster_key TEXT NOT NULL,
  channel_id TEXT,
  sent_at TEXT NOT NULL,
  payload_json TEXT,
  UNIQUE (reminder_type, cycle_key, roster_key)
);
