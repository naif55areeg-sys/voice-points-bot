import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} from "discord.js";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= SETTINGS =================
const POINTS_FILE = "./points.json";
const LEVEL_CHANNEL_ID = "1461437410381660231";
const DAILY_TOP_CHANNEL_ID = "1461437410381660231";

const TOP1_ROLE = "1461438173551792365";
const TOP2_ROLE = "1461438239448629390";
const TOP3_ROLE = "1461438275897131249";

// ================= DATA =================
let data = {};
if (fs.existsSync(POINTS_FILE)) {
  const file = fs.readFileSync(POINTS_FILE, "utf8");
  data = file ? JSON.parse(file) : {};
}

function saveData() {
  fs.writeFileSync(POINTS_FILE, JSON.stringify(data, null, 2));
}

// ================= LEVEL SYSTEM =================
function pointsForNextLevel(level) {
  return Math.floor(20 + level * level * 5);
}

// ================= COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName("نقاطي")
    .setDescription("يعرض نقاطك ولفلك"),

  new SlashCommandBuilder()
    .setName("معلومات")
    .setDescription("معلومات عن نظام النقاط")
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );
  console.log("✅ Commands registered");
})();

// ================= VOICE POINTS =================
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased()) continue;

      for (const member of channel.members.values()) {
        if (member.voice.selfDeaf) continue;

        if (!data[member.id]) {
          data[member.id] = { points: 0, level: 0, dailyPoints: 0 };
        }

        data[member.id].points++;
        data[member.id].dailyPoints++;

        const needed = pointsForNextLevel(data[member.id].level);
        if (data[member.id].points >= needed) {
          data[member.id].points -= needed;
          data[member.id].level++;

          const channelLevel = guild.channels.cache.get(LEVEL_CHANNEL_ID);
          if (channelLevel) {
            channelLevel.send(
              `🎉 <@${member.id}> **Level Up!**\n🆙 Level: **${data[member.id].level}**`
            );
          }
        }
      }
    }
  }
  saveData();
}, 60 * 1000);

// ================= DAILY TOP (12 AM KSA) =================
setInterval(async () => {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })
  );

  if (now.getHours() !== 0 || now.getMinutes() !== 0) return;

  for (const guild of client.guilds.cache.values()) {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].dailyPoints - a[1].dailyPoints)
      .slice(0, 5);

    const channel = guild.channels.cache.get(DAILY_TOP_CHANNEL_ID);
    if (!channel) continue;

    let text = "";
    sorted.forEach((u, i) => {
      text += `**${i + 1}.** <@${u[0]}> — ${u[1].dailyPoints} XP\n`;
    });

    channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Daily Top 5 | أفضل 5 اليوم")
          .setDescription(text || "لا يوجد بيانات")
          .setColor(0xfacc15)
      ]
    });

    for (const member of guild.members.cache.values()) {
      await member.roles
        .remove([TOP1_ROLE, TOP2_ROLE, TOP3_ROLE])
        .catch(() => {});
    }

    if (sorted[0]) guild.members.cache.get(sorted[0][0])?.roles.add(TOP1_ROLE);
    if (sorted[1]) guild.members.cache.get(sorted[1][0])?.roles.add(TOP2_ROLE);
    if (sorted[2]) guild.members.cache.get(sorted[2][0])?.roles.add(TOP3_ROLE);

    for (const id in data) data[id].dailyPoints = 0;
  }

  saveData();
}, 60 * 1000);

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "نقاطي") {
    if (!data[interaction.user.id]) {
      data[interaction.user.id] = { points: 0, level: 0, dailyPoints: 0 };
    }

    await interaction.reply(
      `👤 <@${interaction.user.id}>\n` +
      `🆙 Level: **${data[interaction.user.id].level}**\n` +
      `⭐ Points: **${data[interaction.user.id].points}**`
    );
  }

  if (interaction.commandName === "معلومات") {
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle("✨ نظام النقاط الصوتية ✨")
      .setDescription("🎧 نقاط تلقائية عند التواجد في الرومات الصوتية")
      .addFields(
        { name: "⏱️ النظام", value: "نقطة كل دقيقة بدون Deaf" },
        { name: "🏆 الترتيب اليومي", value: "12:00 الليل بتوقيت السعودية 🇸🇦" },
        { name: "📌 أمر", value: "`/نقاطي`" }
      );

    await interaction.reply({ embeds: [embed] });
  }
});

// ================= READY =================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
