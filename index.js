// ============================================================
// VVLL BOT
// Vx Vnilla Landon League
// Single-file bot logic
// ============================================================

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

// ============================================================
// CONFIG
// ============================================================

// IMPORTANT:
// Put your bot token in your hosting service's environment variables.
// NEVER put your real token inside this file or GitHub.

const TOKEN = process.env.DISCORD_TOKEN;

// Your Discord application/client ID.
const CLIENT_ID = process.env.CLIENT_ID;

// Your VVLL Discord server ID.
const GUILD_ID = process.env.GUILD_ID;

// VVLL POC
const POC_ID = "1505021865985572940";

// VVLL Co-POC
const CO_POC_ID = "1429837765281058876";

// Optional staff role.
// Put the role ID here if you have one.
// Leave as "" if you want POC/Co-POC only.
const STAFF_ROLE_ID = "";

// Optional batch-review channel.
// Leave "" and the bot will create/use one automatically when possible.
const BATCH_CHANNEL_ID = "";

// ============================================================
// DATABASE
// ============================================================

const DB_FILE = path.join(__dirname, "database.json");

const DEFAULT_DATABASE = {
  version: 2,
  teams: {},
  players: {},
  games: {},
  standings: {},
  settings: {
    season: 1
  }
};

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(
        DB_FILE,
        JSON.stringify(DEFAULT_DATABASE, null, 2)
      );
      return structuredClone(DEFAULT_DATABASE);
    }

    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw);

    // Preserve existing data.
    parsed.version = parsed.version || 2;
    parsed.teams = parsed.teams || {};
    parsed.players = parsed.players || {};
    parsed.games = parsed.games || {};
    parsed.standings = parsed.standings || {};
    parsed.settings = parsed.settings || {};
    parsed.settings.season =
      parsed.settings.season || 1;

    return parsed;
  } catch (error) {
    console.error("Database load error:", error);
    return structuredClone(DEFAULT_DATABASE);
  }
}

let db = loadDatabase();

function saveDatabase() {
  try {
    const temporary = `${DB_FILE}.tmp`;

    fs.writeFileSync(
      temporary,
      JSON.stringify(db, null, 2)
    );

    fs.renameSync(temporary, DB_FILE);
  } catch (error) {
    console.error("Database save error:", error);
  }
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ============================================================
// HELPERS
// ============================================================

function id() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function cleanName(name) {
  return String(name)
    .trim()
    .replace(/[^\w\s-]/g, "")
    .slice(0, 50);
}

function isPOC(interaction) {
  return (
    interaction.user.id === POC_ID ||
    interaction.user.id === CO_POC_ID
  );
}

function hasStaffRole(interaction) {
  if (!STAFF_ROLE_ID) return false;

  const member = interaction.member;

  if (!member || !member.roles) return false;

  return member.roles.cache?.has(STAFF_ROLE_ID) || false;
}

function isStaff(interaction) {
  return (
    isPOC(interaction) ||
    hasStaffRole(interaction) ||
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

function getTeam(teamId) {
  return db.teams[teamId];
}

function getTeamByName(name) {
  const wanted = String(name).toLowerCase();

  return Object.values(db.teams).find(
    team =>
      String(team.name).toLowerCase() === wanted
  );
}

function getPlayer(userId) {
  return db.players[userId];
}

function getPlayerTeam(userId) {
  const player = getPlayer(userId);

  if (!player?.teamId) return null;

  return getTeam(player.teamId) || null;
}

function isManagerOf(team, userId) {
  if (!team) return false;

  return (
    team.managerId === userId ||
    team.coManagerIds?.includes(userId)
  );
}

function ensureTeamStats(teamId) {
  if (!db.standings[teamId]) {
    db.standings[teamId] = {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0
    };
  }

  return db.standings[teamId];
}

function ensurePlayer(userId, username = "") {
  if (!db.players[userId]) {
    db.players[userId] = {
      userId,
      username,
      teamId: null,
      goals: 0,
      assists: 0,
      saves: 0,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matchHistory: [],
      activityChecks: {}
    };
  }

  return db.players[userId];
}

function ensureGame(gameId) {
  return db.games[gameId];
}

function formatTeam(team) {
  if (!team) return "None";

  return `<@&${team.roleId}>`;
}

function getPlayerDisplay(userId) {
  const player = db.players[userId];

  if (!player) return `<@${userId}>`;

  return `<@${userId}>`;
}

async function safeDM(userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
    return true;
  } catch (error) {
    console.log(`Could not DM ${userId}`);
    return false;
  }
}

async function getOrCreateBatchChannel(guild) {
  if (BATCH_CHANNEL_ID) {
    const existing = guild.channels.cache.get(
      BATCH_CHANNEL_ID
    );

    if (existing) return existing;
  }

  let channel = guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      c.name === "batch-review"
  );

  if (channel) return channel;

  try {
    channel = await guild.channels.create({
      name: "batch-review",
      type: ChannelType.GuildText
    });

    return channel;
  } catch {
    return null;
  }
}

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [];

// -------------------- BASIC --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the VVLL bot is online.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("league")
    .setDescription("View VVLL league information.")
);

// -------------------- TEAM --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("team-create")
    .setDescription("Create a VVLL team.")
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("Team name")
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName("manager")
        .setDescription("Team manager")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("team-delete")
    .setDescription("Delete a VVLL team.")
    .addStringOption(option =>
      option
        .setName("team")
        .setDescription("Team name")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("team-info")
    .setDescription("View information about a team.")
    .addStringOption(option =>
      option
        .setName("team")
        .setDescription("Team name")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("team-roster")
    .setDescription("View a team's roster.")
    .addStringOption(option =>
      option
        .setName("team")
        .setDescription("Team name")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("team-add-manager")
    .setDescription("Add a co-manager to your team.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("team-remove-manager")
    .setDescription("Remove a co-manager.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("team-swap-manager")
    .setDescription("Change the main manager.")
    .addStringOption(option =>
      option
        .setName("team")
        .setDescription("Team")
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName("manager")
        .setDescription("New manager")
        .setRequired(true)
    )
);

// -------------------- PLAYERS --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("sign")
    .setDescription("Send a player a team signing request.")
    .addUserOption(option =>
      option
        .setName("player")
        .setDescription("Player")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a player from your team.")
    .addUserOption(option =>
      option
        .setName("player")
        .setDescription("Player")
        .setRequired(true)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("View player information.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Player")
        .setRequired(true)
    )
);

// -------------------- GAMES --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("game-create")
    .setDescription("Create a VVLL game.")
    .addStringOption(option =>
      option
        .setName("home")
        .setDescription("Home team")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("away")
        .setDescription("Away team")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("format")
        .setDescription("Game format")
        .setRequired(true)
        .addChoices(
          { name: "4v4", value: "4v4" },
          { name: "5v5", value: "5v5" },
          { name: "6v6", value: "6v6" },
          { name: "7v7", value: "7v7" },
          { name: "8v8", value: "8v8" },
          { name: "9v9", value: "9v9" },
          { name: "10v10", value: "10v10" },
          { name: "11v11", value: "11v11" }
        )
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("game-result")
    .setDescription("Submit the result of a game.")
    .addStringOption(option =>
      option
        .setName("game")
        .setDescription("Game ID")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("home-score")
        .setDescription("Home score")
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("away-score")
        .setDescription("Away score")
        .setRequired(true)
        .setMinValue(0)
    )
);

// -------------------- STATS --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Manage player match statistics.")
    .addUserOption(option =>
      option
        .setName("player")
        .setDescription("Player")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("goals")
        .setDescription("Goals")
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("assists")
        .setDescription("Assists")
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("saves")
        .setDescription("Saves")
        .setRequired(false)
        .setMinValue(0)
    )
);

// -------------------- ACTIVITY --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("activity-check")
    .setDescription("Create a VVLL activity check.")
    .addIntegerOption(option =>
      option
        .setName("number")
        .setDescription("Activity check number")
        .setRequired(true)
        .setMinValue(1)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("activity-panel")
    .setDescription("View activity check records.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("activity-certain")
    .setDescription("Manually mark a player active.")
    .addUserOption(option =>
      option
        .setName("player")
        .setDescription("Player")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("number")
        .setDescription("Activity check number")
        .setRequired(true)
        .setMinValue(1)
    )
);

// -------------------- BATCH --------------------

commands.push(
  new SlashCommandBuilder()
    .setName("send-batch")
    .setDescription("Submit a batch.")
    .addStringOption(option =>
      option
        .setName("message-link")
        .setDescription("Discord message link")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("Numbers only")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("credits")
        .setDescription("Optional credits amount")
        .setRequired(false)
        .setMinValue(0)
    )
);

// ============================================================
// REGISTER COMMANDS
// ============================================================

async function registerCommands() {
  if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.log(
      "Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID."
    );
    return;
  }

  try {
    const rest = new REST({ version: "10" }).setToken(
      TOKEN
    );

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands.map(command => command.toJSON())
      }
    );

    console.log(
      `Registered ${commands.length} VVLL commands.`
    );
  } catch (error) {
    console.error(
      "Command registration error:",
      error
    );
  }
}

// ============================================================
// READY
// ============================================================

client.once("ready", () => {
  console.log(
    `VVLL Bot online as ${client.user.tag}`
  );

  client.user.setPresence({
    activities: [
      {
        name: "VVLL | NA | S1",
        type: 3
      }
    ],
    status: "online"
  });
});

// ============================================================
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {
  try {
    // ========================================================
    // BUTTONS
    // ========================================================

    if (interaction.isButton()) {
      // ------------------------------------------------------
      // ACTIVITY CHECK
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith(
          "activity_check:"
        )
      ) {
        const number = interaction.customId.split(":")[1];

        const player = ensurePlayer(
          interaction.user.id,
          interaction.user.username
        );

        player.activityChecks[number] = true;

        saveDatabase();

        await interaction.reply({
          content:
            `✅ You are marked active for Activity Check #${number}.`,
          ephemeral: true
        });

        return;
      }

      // ------------------------------------------------------
      // BATCH APPROVE
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith(
          "batch_yes:"
        )
      ) {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content:
              "❌ You do not have permission to approve batches.",
            ephemeral: true
          });

          return;
        }

        const batchId =
          interaction.customId.split(":")[1];

        const batch = db.settings.batches?.[batchId];

        if (!batch) {
          await interaction.reply({
            content: "❌ Batch not found.",
            ephemeral: true
          });

          return;
        }

        if (batch.status !== "pending") {
          await interaction.reply({
            content:
              "❌ This batch has already been decided.",
            ephemeral: true
          });

          return;
        }

        batch.status = "approved";
        batch.approvedBy = interaction.user.id;
        batch.approvedAt = Date.now();

        saveDatabase();

        const embed =
          EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x22c55e)
            .setFooter({
              text: `Approved by ${interaction.user.username}`
            });

        await interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `batch_yes_done:${batchId}`
                )
                .setLabel("Approved")
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),

              new ButtonBuilder()
                .setCustomId(
                  `batch_no_done:${batchId}`
                )
                .setLabel("Disproved")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            )
          ]
        });

        await safeDM(
          batch.userId,
          "✅ Your batch has been confirmed for the next batch send."
        );

        return;
      }

      // ------------------------------------------------------
      // BATCH DENY
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith(
          "batch_no:"
        )
      ) {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content:
              "❌ You do not have permission to disprove batches.",
            ephemeral: true
          });

          return;
        }

        const batchId =
          interaction.customId.split(":")[1];

        const batch = db.settings.batches?.[batchId];

        if (!batch) {
          await interaction.reply({
            content: "❌ Batch not found.",
            ephemeral: true
          });

          return;
        }

        if (batch.status !== "pending") {
          await interaction.reply({
            content:
              "❌ This batch has already been decided.",
            ephemeral: true
          });

          return;
        }

        batch.status = "disproved";
        batch.disprovedBy = interaction.user.id;
        batch.disprovedAt = Date.now();

        saveDatabase();

        const embed =
          EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xef4444)
            .setFooter({
              text: `Disproved by ${interaction.user.username}`
            });

        await interaction.update({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `batch_yes_done:${batchId}`
                )
                .setLabel("Approved")
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),

              new ButtonBuilder()
                .setCustomId(
                  `batch_no_done:${batchId}`
                )
                .setLabel("Disproved")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            )
          ]
        });

        await safeDM(
          batch.userId,
          "❌ Your batch submission has been disproved."
        );

        return;
      }

      // ------------------------------------------------------
      // SIGNING REQUEST
      // ------------------------------------------------------

      if (
        interaction.customId.startsWith(
          "sign_accept:"
        )
      ) {
        const teamId =
          interaction.customId.split(":")[1];

        const team = getTeam(teamId);

        if (!team) {
          await interaction.reply({
            content: "❌ Team no longer exists.",
            ephemeral: true
          });

          return;
        }

        const player = ensurePlayer(
          interaction.user.id,
          interaction.user.username
        );

        if (
          player.teamId &&
          player.teamId !== teamId
        ) {
          await interaction.reply({
            content:
              "❌ You are already on another team.",
            ephemeral: true
          });

          return;
        }

        player.teamId = teamId;

        if (!team.roster) {
          team.roster = [];
        }

        if (
          !team.roster.includes(
            interaction.user.id
          )
        ) {
          team.roster.push(
            interaction.user.id
          );
        }

        saveDatabase();

        try {
          const role =
            interaction.guild.roles.cache.get(
              team.roleId
            );

          if (role) {
            await interaction.member.roles.add(
              role
            );
          }
        } catch {}

        await interaction.update({
          content:
            `✅ You joined **${team.name}**!`,
          embeds: [],
          components: []
        });

        return;
      }

      if (
        interaction.customId.startsWith(
          "sign_decline:"
        )
      ) {
        await interaction.update({
          content:
            "❌ You declined the team signing request.",
          embeds: [],
          components: []
        });

        return;
      }

      return;
    }

    // ========================================================
    // SLASH COMMANDS
    // ========================================================

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.commandName;

    // ========================================================
    // PING
    // ========================================================

    if (command === "ping") {
      await interaction.reply(
        `🏓 VVLL Bot online!\nLatency: ${client.ws.ping}ms`
      );

      return;
    }

    // ========================================================
    // LEAGUE
    // ========================================================

    if (command === "league") {
      const teams = Object.values(db.teams);

      const sorted = teams.sort((a, b) => {
        const sa = ensureTeamStats(a.id);
        const sb = ensureTeamStats(b.id);

        return (
          sb.points - sa.points ||
          (sb.goalsFor - sb.goalsAgainst) -
            (sa.goalsFor - sa.goalsAgainst)
        );
      });

      let description = "";

      if (sorted.length === 0) {
        description = "No teams have been created yet.";
      } else {
        sorted.forEach((team, index) => {
          const stats = ensureTeamStats(team.id);

          description +=
            `**${index + 1}. ${team.name}** — ` +
            `${stats.points} pts | ` +
            `${stats.wins}-${stats.losses}-${stats.draws}\n`;
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("VVLL | League Standings")
        .setDescription(description)
        .setColor(0xd946ef)
        .setFooter({
          text: `Season ${db.settings.season}`
        });

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // TEAM CREATE
    // ========================================================

    if (command === "team-create") {
      if (!isPOC(interaction)) {
        await interaction.reply({
          content:
            "❌ Only the VVLL POC/Co-POC can create teams.",
          ephemeral: true
        });

        return;
      }

      const name =
        cleanName(
          interaction.options.getString("name")
        );

      const manager =
        interaction.options.getUser("manager");

      if (getTeamByName(name)) {
        await interaction.reply({
          content:
            "❌ A team with that name already exists.",
          ephemeral: true
        });

        return;
      }

      const teamId = id();

      let role;

      try {
        role = await interaction.guild.roles.create({
          name,
          reason: "VVLL team creation"
        });
      } catch (error) {
        console.error(error);

        await interaction.reply({
          content:
            "❌ I couldn't create the Discord role. Make sure the bot can manage roles.",
          ephemeral: true
        });

        return;
      }

      db.teams[teamId] = {
        id: teamId,
        name,
        roleId: role.id,
        managerId: manager.id,
        coManagerIds: [],
        roster: [],
        createdAt: Date.now()
      };

      ensureTeamStats(teamId);

      const player =
        ensurePlayer(
          manager.id,
          manager.username
        );

      player.teamId = teamId;

      db.teams[teamId].roster.push(
        manager.id
      );

      saveDatabase();

      try {
        const member =
          await interaction.guild.members.fetch(
            manager.id
          );

        await member.roles.add(role);
      } catch {}

      await interaction.reply({
        content:
          `✅ Created **${name}** and assigned <@${manager.id}> as manager.`
      });

      return;
    }

    // ========================================================
    // TEAM DELETE
    // ========================================================

    if (command === "team-delete") {
      if (!isPOC(interaction)) {
        await interaction.reply({
          content:
            "❌ Only the POC/Co-POC can delete teams.",
          ephemeral: true
        });

        return;
      }

      const name =
        interaction.options.getString("team");

      const team = getTeamByName(name);

      if (!team) {
        await interaction.reply({
          content: "❌ Team not found.",
          ephemeral: true
        });

        return;
      }

      for (const userId of team.roster || []) {
        if (db.players[userId]) {
          db.players[userId].teamId = null;
        }
      }

      delete db.standings[team.id];
      delete db.teams[team.id];

      saveDatabase();

      try {
        const role =
          interaction.guild.roles.cache.get(
            team.roleId
          );

        if (role) {
          await role.delete(
            "VVLL team deleted"
          );
        }
      } catch {}

      await interaction.reply(
        `🗑️ **${team.name}** has been deleted.`
      );

      return;
    }

    // ========================================================
    // TEAM INFO
    // ========================================================

    if (command === "team-info") {
      const name =
        interaction.options.getString("team");

      const team = getTeamByName(name);

      if (!team) {
        await interaction.reply({
          content: "❌ Team not found.",
          ephemeral: true
        });

        return;
      }

      const stats = ensureTeamStats(team.id);

      const embed = new EmbedBuilder()
        .setTitle(`⚽ ${team.name}`)
        .setColor(0xd946ef)
        .addFields(
          {
            name: "Manager",
            value: team.managerId
              ? `<@${team.managerId}>`
              : "None",
            inline: true
          },
          {
            name: "Co-Managers",
            value:
              team.coManagerIds?.length
                ? team.coManagerIds
                    .map(id => `<@${id}>`)
                    .join(", ")
                : "None",
            inline: true
          },
          {
            name: "Roster",
            value: String(
              team.roster?.length || 0
            ),
            inline: true
          },
          {
            name: "Record",
            value:
              `${stats.wins}-${stats.losses}-${stats.draws}`,
            inline: true
          },
          {
            name: "Goals",
            value:
              `${stats.goalsFor} GF / ${stats.goalsAgainst} GA`,
            inline: true
          },
          {
            name: "Points",
            value: String(stats.points),
            inline: true
          }
        );

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // TEAM ROSTER
    // ========================================================

    if (command === "team-roster") {
      const name =
        interaction.options.getString("team");

      const team = getTeamByName(name);

      if (!team) {
        await interaction.reply({
          content: "❌ Team not found.",
          ephemeral: true
        });

        return;
      }

      const roster =
        team.roster || [];

      let description = "";

      if (!roster.length) {
        description = "No players.";
      } else {
        roster.forEach((userId, index) => {
          const player =
            db.players[userId];

          description +=
            `${index + 1}. <@${userId}>`;

          if (
            team.managerId === userId
          ) {
            description += " — **Manager**";
          } else if (
            team.coManagerIds?.includes(
              userId
            )
          ) {
            description += " — **Co-Manager**";
          }

          if (player) {
            description +=
              ` | ⚽ ${player.goals} | 🎯 ${player.assists}`;
          }

          description += "\n";
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(
          `${team.name} | Roster`
        )
        .setDescription(description)
        .setColor(0xd946ef);

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // ADD CO-MANAGER
    // ========================================================

    if (command === "team-add-manager") {
      const user =
        interaction.options.getUser("user");

      const team =
        getPlayerTeam(
          interaction.user.id
        );

      if (
        !team ||
        !isManagerOf(
          team,
          interaction.user.id
        )
      ) {
        await interaction.reply({
          content:
            "❌ You must be a manager/co-manager.",
          ephemeral: true
        });

        return;
      }

      if (
        team.coManagerIds.includes(
          user.id
        )
      ) {
        await interaction.reply({
          content:
            "❌ That player is already a co-manager.",
          ephemeral: true
        });

        return;
      }

      if (
        team.coManagerIds.length >= 2
      ) {
        await interaction.reply({
          content:
            "❌ This team already has 2 co-managers.",
          ephemeral: true
        });

        return;
      }

      const player =
        ensurePlayer(
          user.id,
          user.username
        );

      player.teamId = team.id;

      if (
        !team.roster.includes(user.id)
      ) {
        team.roster.push(user.id);
      }

      team.coManagerIds.push(
        user.id
      );

      saveDatabase();

      try {
        const role =
          interaction.guild.roles.cache.get(
            team.roleId
          );

        const member =
          await interaction.guild.members.fetch(
            user.id
          );

        if (role) {
          await member.roles.add(role);
        }
      } catch {}

      await interaction.reply(
        `✅ <@${user.id}> is now a co-manager of **${team.name}**.`
      );

      return;
    }

    // ========================================================
    // REMOVE CO-MANAGER
    // ========================================================

    if (command === "team-remove-manager") {
      const user =
        interaction.options.getUser("user");

      const team =
        getPlayerTeam(
          interaction.user.id
        );

      if (
        !team ||
        !isManagerOf(
          team,
          interaction.user.id
        )
      ) {
        await interaction.reply({
          content:
            "❌ You must be a manager/co-manager.",
          ephemeral: true
        });

        return;
      }

      const index =
        team.coManagerIds.indexOf(
          user.id
        );

      if (index === -1) {
        await interaction.reply({
          content:
            "❌ That user is not a co-manager.",
          ephemeral: true
        });

        return;
      }

      team.coManagerIds.splice(
        index,
        1
      );

      saveDatabase();

      await interaction.reply(
        `✅ <@${user.id}> is no longer a co-manager of **${team.name}**.`
      );

      return;
    }

    // ========================================================
    // SWAP MANAGER
    // ========================================================

    if (command === "team-swap-manager") {
      if (!isPOC(interaction)) {
        await interaction.reply({
          content:
            "❌ Only the POC/Co-POC can swap managers.",
          ephemeral: true
        });

        return;
      }

      const name =
        interaction.options.getString(
          "team"
        );

      const newManager =
        interaction.options.getUser(
          "manager"
        );

      const team =
        getTeamByName(name);

      if (!team) {
        await interaction.reply({
          content: "❌ Team not found.",
          ephemeral: true
        });

        return;
      }

      if (
        team.managerId &&
        team.managerId !==
          newManager.id
      ) {
        team.coManagerIds =
          team.coManagerIds.filter(
            id =>
              id !== newManager.id
          );
      }

      team.managerId =
        newManager.id;

      const player =
        ensurePlayer(
          newManager.id,
          newManager.username
        );

      player.teamId =
        team.id;

      if (
        !team.roster.includes(
          newManager.id
        )
      ) {
        team.roster.push(
          newManager.id
        );
      }

      saveDatabase();

      await interaction.reply(
        `✅ <@${newManager.id}> is now the manager of **${team.name}**.`
      );

      return;
    }

    // ========================================================
    // SIGN
    // ========================================================

    if (command === "sign") {
      const user =
        interaction.options.getUser(
          "player"
        );

      const team =
        getPlayerTeam(
          interaction.user.id
        );

      if (
        !team ||
        !isManagerOf(
          team,
          interaction.user.id
        )
      ) {
        await interaction.reply({
          content:
            "❌ You must be a team manager/co-manager to sign players.",
          ephemeral: true
        });

        return;
      }

      const player =
        ensurePlayer(
          user.id,
          user.username
        );

      if (player.teamId) {
        await interaction.reply({
          content:
            "❌ That player is already on a team.",
          ephemeral: true
        });

        return;
      }

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `sign_accept:${team.id}`
              )
              .setLabel("Accept")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `sign_decline:${team.id}`
              )
              .setLabel("Decline")
              .setStyle(
                ButtonStyle.Danger
              )
          );

      const embed =
        new EmbedBuilder()
          .setTitle(
            "⚽ VVLL Team Signing Request"
          )
          .setDescription(
            `**${team.name}** wants to sign you.\n\n` +
            `Manager: <@${team.managerId}>\n\n` +
            `Choose **Accept** or **Decline** below.`
          )
          .setColor(0xd946ef);

      try {
        await user.send({
          embeds: [embed],
          components: [row]
        });

        await interaction.reply({
          content:
            `✅ Signing request sent to <@${user.id}>.`,
          ephemeral: true
        });
      } catch {
        await interaction.reply({
          content:
            "❌ I couldn't DM that player.",
          ephemeral: true
        });
      }

      return;
    }

    // ========================================================
    // RELEASE
    // ========================================================

    if (command === "release") {
      const user =
        interaction.options.getUser(
          "player"
        );

      const team =
        getPlayerTeam(
          interaction.user.id
        );

      if (
        !team ||
        !isManagerOf(
          team,
          interaction.user.id
        )
      ) {
        await interaction.reply({
          content:
            "❌ You must be a manager/co-manager.",
          ephemeral: true
        });

        return;
      }

      if (
        !team.roster.includes(
          user.id
        )
      ) {
        await interaction.reply({
          content:
            "❌ That player isn't on your team.",
          ephemeral: true
        });

        return;
      }

      if (
        team.managerId === user.id
      ) {
        await interaction.reply({
          content:
            "❌ You cannot release the team's main manager.",
          ephemeral: true
        });

        return;
      }

      team.roster =
        team.roster.filter(
          id => id !== user.id
        );

      team.coManagerIds =
        team.coManagerIds.filter(
          id => id !== user.id
        );

      if (db.players[user.id]) {
        db.players[user.id].teamId =
          null;
      }

      saveDatabase();

      await interaction.reply(
        `✅ <@${user.id}> has been released from **${team.name}**.`
      );

      return;
    }

    // ========================================================
    // PLAYER
    // ========================================================

    if (command === "player") {
      const user =
        interaction.options.getUser(
          "user"
        );

      const player =
        ensurePlayer(
          user.id,
          user.username
        );

      const team =
        getPlayerTeam(
          user.id
        );

      const embed =
        new EmbedBuilder()
          .setTitle(
            `👤 ${user.username}`
          )
          .setColor(0xd946ef)
          .addFields(
            {
              name: "Team",
              value:
                team?.name || "Free Agent",
              inline: true
            },
            {
              name: "Games",
              value: String(
                player.games
              ),
              inline: true
            },
            {
              name: "Goals",
              value: String(
                player.goals
              ),
              inline: true
            },
            {
              name: "Assists",
              value: String(
                player.assists
              ),
              inline: true
            },
            {
              name: "Saves",
              value: String(
                player.saves
              ),
              inline: true
            }
          );

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // GAME CREATE
    // ========================================================

    if (command === "game-create") {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content:
            "❌ Only VVLL staff can create games.",
          ephemeral: true
        });

        return;
      }

      const homeName =
        interaction.options.getString(
          "home"
        );

      const awayName =
        interaction.options.getString(
          "away"
        );

      const format =
        interaction.options.getString(
          "format"
        );

      const home =
        getTeamByName(homeName);

      const away =
        getTeamByName(awayName);

      if (!home || !away) {
        await interaction.reply({
          content:
            "❌ One or both teams were not found.",
          ephemeral: true
        });

        return;
      }

      if (home.id === away.id) {
        await interaction.reply({
          content:
            "❌ A team cannot play itself.",
          ephemeral: true
        });

        return;
      }

      const gameId =
        id();

      db.games[gameId] = {
        id: gameId,
        season: db.settings.season,
        homeTeamId: home.id,
        awayTeamId: away.id,
        format,
        status: "scheduled",
        homeScore: null,
        awayScore: null,
        stats: {},
        createdAt: Date.now()
      };

      saveDatabase();

      const embed =
        new EmbedBuilder()
          .setTitle(
            "⚽ VVLL Game Created"
          )
          .setColor(0xd946ef)
          .addFields(
            {
              name: "Game ID",
              value: `\`${gameId}\``
            },
            {
              name: "Match",
              value:
                `**${home.name}** vs **${away.name}**`
            },
            {
              name: "Format",
              value: format
            },
            {
              name: "Status",
              value: "Scheduled"
            }
          );

      await interaction.reply({
        embeds: [embed]
      });

      return;
    }

    // ========================================================
    // GAME RESULT
    // ========================================================

    if (command === "game-result") {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content:
            "❌ Only VVLL staff can submit game results.",
          ephemeral: true
        });

        return;
      }

      const gameId =
        interaction.options.getString(
          "game"
        );

      const homeScore =
        interaction.options.getInteger(
          "home-score"
        );

      const awayScore =
        interaction.options.getInteger(
          "away-score"
        );

      const game =
        ensureGame(gameId);

      if (!game) {
        await interaction.reply({
          content:
            "❌ Game not found.",
          ephemeral: true
        });

        return;
      }

      if (
        game.status === "completed"
      ) {
        await interaction.reply({
          content:
            "❌ This game already has a result.",
          ephemeral: true
        });

        return;
      }

      game.homeScore =
        homeScore;

      game.awayScore =
        awayScore;

      game.status =
        "completed";

      const homeStats =
        ensureTeamStats(
          game.homeTeamId
        );

      const awayStats =
        ensureTeamStats(
          game.awayTeamId
        );

      homeStats.played++;
      awayStats.played++;

      homeStats.goalsFor +=
        homeScore;

      homeStats.goalsAgainst +=
        awayScore;

      awayStats.goalsFor +=
        awayScore;

      awayStats.goalsAgainst +=
        homeScore;

      if (homeScore > awayScore) {
        homeStats.wins++;
        homeStats.points += 3;

        awayStats.losses++;
      } else if (
        awayScore > homeScore
      ) {
        awayStats.wins++;
        awayStats.points += 3;

        homeStats.losses++;
      } else {
        homeStats.draws++;
        awayStats.draws++;

        homeStats.points++;
        awayStats.points++;
      }

      saveDatabase();

      await interaction.reply(
        `✅ Result recorded:\n**${getTeam(game.homeTeamId).name} ${homeScore} - ${awayScore} ${getTeam(game.awayTeamId).name}**`
      );

      return;
    }

    // ========================================================
    // STATS
    // ========================================================

    if (command === "stats") {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content:
            "❌ Only VVLL staff can edit stats.",
          ephemeral: true
        });

        return;
      }

      const user =
        interaction.options.getUser(
          "player"
        );

      const goals =
        interaction.options.getInteger(
          "goals"
        );

      const assists =
        interaction.options.getInteger(
          "assists"
        );

      const saves =
        interaction.options.getInteger(
          "saves"
        );

      const player =
        ensurePlayer(
          user.id,
          user.username
        );

      if (goals !== null) {
        player.goals += goals;
      }

      if (assists !== null) {
        player.assists += assists;
      }

      if (saves !== null) {
        player.saves += saves;
      }

      saveDatabase();

      await interaction.reply(
        `✅ Stats updated for <@${user.id}>.\n` +
        `⚽ Goals: ${player.goals}\n` +
        `🎯 Assists: ${player.assists}\n` +
        `🧤 Saves: ${player.saves}`
      );

      return;
    }

    // ========================================================
    // ACTIVITY CHECK
    // ========================================================

    if (command === "activity-check") {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content:
            "❌ Only VVLL staff can create activity checks.",
          ephemeral: true
        });

        return;
      }

      const number =
        interaction.options.getInteger(
          "number"
        );

      if (
        !db.settings.activityChecks
      ) {
        db.settings.activityChecks = {};
      }

      db.settings.activityChecks[
        number
      ] = {
        number,
        createdBy:
          interaction.user.id,
        createdAt: Date.now()
      };

      saveDatabase();

      const row =
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `activity_check:${number}`
            )
            .setLabel(
              "✅ Active Check"
            )
            .setStyle(
              ButtonStyle.Success
            )
        );

      const embed =
        new EmbedBuilder()
          .setTitle(
            `📋 Activity Check #${number}`
          )
          .setDescription(
            `React/tick below to mark yourself active.\n\n` +
            `⚠️ If you don't tick Activity Check #${number}, you cannot win giveaways.\n\n` +
            `Click the button below when you are active.`
          )
          .setColor(0xd946ef);

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });

      return;
    }

    // ========================================================
    // ACTIVITY PANEL
    // ========================================================

    if (command === "activity-panel") {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content:
            "❌ Only VVLL staff can view the activity panel.",
          ephemeral: true
        });

        return;
      }

      let description = "";

      const players =
        Object.values(db.players);

      const checks =
        db.settings.activityChecks || {};

      const checkNumbers =
        Object.keys(checks);

      if (!checkNumbers.length) {
        description =
          "No activity checks have been created.";
      } else {
        for (
          const number of checkNumbers
        ) {
          const active =
            players.filter(
              player =>
                player.activityChecks?.[
                  number
                ]
            );

          description +=
            `**Activity Check #${number}**\n`;

          if (!active.length) {
            description +=
              "Nobody checked in yet.\n\n";
          } else {
            description +=
              active
                .map(
                  player =>
                    `• <@${player.userId}>`
                )
                .join("\n");

            description += "\n\n";
          }
        }
      }

      const embed =
        new EmbedBuilder()
          .setTitle(
            "📋 VVLL Activity Panel"
          )
          .setDescription(
            description
          )
          .setColor(0xd946ef);

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

      return;
    }

    // ========================================================
    // ACTIVITY CERTAIN
    // ========================================================

    if (command === "activity-certain") {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content:
            "❌ Only VVLL staff can manually mark activity.",
          ephemeral: true
        });

        return;
      }

      const user =
        interaction.options.getUser(
          "player"
        );

      const number =
        interaction.options.getInteger(
          "number"
        );

      const player =
        ensurePlayer(
          user.id,
          user.username
        );

      player.activityChecks[
        number
      ] = true;

      saveDatabase();

      await interaction.reply(
        `✅ <@${user.id}> is marked active for Activity Check #${number}.`
      );

      return;
    }

    // ========================================================
    // SEND BATCH
    // ========================================================

    if (command === "send-batch") {
      const messageLink =
        interaction.options.getString(
          "message-link"
        );

      const submittedId =
        interaction.options.getString(
          "id"
        );

      const credits =
        interaction.options.getInteger(
          "credits"
        );

      // Discord message links normally look like:
      // https://discord.com/channels/GUILD/CHANNEL/MESSAGE
      const validLink =
        /^https:\/\/(discord\.com|discordapp\.com)\/channels\/\d+\/\d+\/\d+$/
          .test(messageLink);

      if (!validLink) {
        await interaction.reply({
          content:
            "❌ That is not a valid Discord message link.",
          ephemeral: true
        });

        return;
      }

      // Numbers only.
      if (!/^\d+$/.test(submittedId)) {
        await interaction.reply({
          content:
            "❌ ID must contain numbers only. Example: `1234567`.",
          ephemeral: true
        });

        return;
      }

      if (!db.settings.batches) {
        db.settings.batches = {};
      }

      const batchId =
        id();

      db.settings.batches[
        batchId
      ] = {
        id: batchId,
        userId:
          interaction.user.id,
        messageLink,
        submittedId,
        credits:
          credits ?? null,
        status: "pending",
        createdAt: Date.now()
      };

      saveDatabase();

      const channel =
        await getOrCreateBatchChannel(
          interaction.guild
        );

      if (!channel) {
        await interaction.reply({
          content:
            "❌ I couldn't find/create the batch review channel.",
          ephemeral: true
        });

        return;
      }

      const embed =
        new EmbedBuilder()
          .setTitle(
            "📦 VVLL Batch Submission"
          )
          .setColor(0xf59e0b)
          .addFields(
            {
              name: "Submitted By",
              value: `<@${interaction.user.id}>`,
              inline: true
            },
            {
              name: "ID",
              value: submittedId,
              inline: true
            },
            {
              name: "Credits",
              value:
                credits !== null &&
                credits !== undefined
                  ? String(credits)
                  : "Not provided",
              inline: true
            },
            {
              name: "Message Link",
              value: `[Open Message](${messageLink})`
            },
            {
              name: "Status",
              value:
                "🟡 Pending Batch"
            }
          )
          .setFooter({
            text: `Batch ID: ${batchId}`
          });

      const row =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `batch_yes:${batchId}`
              )
              .setLabel("Yes")
              .setStyle(
                ButtonStyle.Success
              ),

            new ButtonBuilder()
              .setCustomId(
                `batch_no:${batchId}`
              )
              .setLabel("No")
              .setStyle(
                ButtonStyle.Danger
              )
          );

      await channel.send({
        embeds: [embed],
        components: [row]
      });

      await interaction.reply({
        content:
          "✅ Your batch was submitted for review.",
        ephemeral: true
      });

      return;
    }
  } catch (error) {
    console.error(
      "Interaction error:",
      error
    );

    try {
      if (interaction.replied) {
        await interaction.followUp({
          content:
            "❌ Something went wrong while processing that command.",
          ephemeral: true
        });
      } else if (
        interaction.deferred
      ) {
        await interaction.editReply({
          content:
            "❌ Something went wrong while processing that command."
        });
      } else {
        await interaction.reply({
          content:
            "❌ Something went wrong while processing that command.",
          ephemeral: true
        });
      }
    } catch {}
  }
});

// ============================================================
// START
// ============================================================

async function start() {
  if (!TOKEN) {
    console.error(
      "❌ DISCORD_TOKEN is missing."
    );
    return;
  }

  await registerCommands();

  await client.login(TOKEN);
}

start();
