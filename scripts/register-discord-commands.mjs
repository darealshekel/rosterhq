import process from 'node:process';
import { RAID_FAMILY_DEFINITIONS, ROSTER_OWNER_DEFINITIONS } from '../src/shared/rosterhq-core.js';

const applicationId = process.env.DISCORD_APPLICATION_ID ?? process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !botToken) {
  console.error('DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID) and DISCORD_BOT_TOKEN are required.');
  process.exit(1);
}

const commands = RAID_FAMILY_DEFINITIONS.map((family) => ({
  name: family.commandName,
  description: `Record ${family.title} weekly completion.`,
  type: 1,
  options: [
    {
      type: 3,
      name: 'difficulty',
      description: 'Raid difficulty to record.',
      required: true,
      choices: family.tiers.map((tier) => ({
        name: tier.difficulty === 'NIGHTMARE' ? 'Nightmare' : tier.difficulty,
        value: tier.difficulty
      }))
    },
    ...ROSTER_OWNER_DEFINITIONS.flatMap((roster) => ([
      {
        type: 3,
        name: roster.key,
        description: `${roster.title} character or NONE.`,
        required: false,
        autocomplete: true
      },
      {
        type: 5,
        name: `${roster.key}_bought_in`,
        description: `Bought in for ${roster.title}. Ignored when NONE is selected.`,
        required: false
      }
    ]))
  ]
}));

const route = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;

const response = await fetch(route, {
  method: 'PUT',
  headers: {
    'Authorization': `Bot ${botToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(commands)
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}

const registered = await response.json();
console.log(`Registered ${registered.length} Discord raid commands${guildId ? ` for guild ${guildId}` : ''}.`);
