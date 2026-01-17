import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder
} from "discord.js";
import fs from "fs";
import dotenv from "dotenv";
import { createCanvas, loadImage } from "canvas";
import GIFEncoder from "gifencoder";

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

// ================= RANK CARD =================
async function createRankCard(member, isWinner = false) {
  const user = data[member.id];
  const needed = pointsForNextLevel(user.level);
  const progress = Math.min(user.points / needed, 1);

  const width = 700;
  const height = 250;

  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(120);
  encoder.setQuality(10);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage("./background.png");
  const avatar = await loadImage(
    member.user.displayAvatarURL({ extension: "png" })
  );

  for (let i = 0; i < 10; i++) {
    ctx.clearRect(0, 0, width, height);

    ctx.drawImage(bg, 0, 0, width, height);

    const pulse = Math.sin(i / 2) * 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 125, 60 + pulse, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 50, 65, 120, 120);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial";
    ctx.fillText(member.user.username, 200, 70);

    ctx.font = "18px Arial";
    ctx.fillText(`Level | لفل: ${user.level}`, 200, 110);
    ctx.fillText(`Points | النقاط: ${user.points} / ${needed}`, 200, 140);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(200, 170, 430, 18);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(200, 170, 430 * progress, 18);

    if (isWinner) {
      ctx.font = "bold 22px Arial";
      ctx.fillStyle = "#facc15";
      ctx.fillText("🏅 DAILY WINNER", 480, 40);
    }

    encoder.addFrame(ctx);
  }

  encoder.finish();
  return new AttachmentBuilder(encoder.out.getData(), { name: "rank.gif" });
}

// ================= COMMANDS REGISTER =================
const commands = [
  new SlashCommandBuilder()
    .setName("نقاطي")
    .setDescription("يعرض بطاقتك ونقاطك"),

  new SlashCommandBuilder()
    .setName("معلومات")
    .setDescription("معلومات عن البوت ونظام النقاط")
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

          const isWinner =
            member.roles.cache.has(TOP1_ROLE) ||
            member.roles.cache.has(TOP2_ROLE) ||
            member.roles.cache.has(TOP3_ROLE);

          const card = await createRankCard(member, isWinner);
          const levelChannel = guild.channels.cache.get(LEVEL_CHANNEL_ID);

          if (levelChannel) {
            levelChannel.send({
              content: `🎉 <@${member.id}> Level Up!`,
              files: [card]
            });
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

  // ===== أمر نقاطي =====
  if (interaction.commandName === "نقاطي") {
    try {
      await interaction.deferReply({ ephemeral: false });

      if (!data[interaction.user.id]) {
        data[interaction.user.id] = { points: 0, level: 0, dailyPoints: 0 };
      }

      const member = interaction.member;

      const isWinner =
        member.roles.cache.has(TOP1_ROLE) ||
        member.roles.cache.has(TOP2_ROLE) ||
        member.roles.cache.has(TOP3_ROLE);

      const card = await createRankCard(member, isWinner);

      await interaction.editReply({ files: [card] });
    } catch (err) {
      console.error("❌ RANK ERROR:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("❌ حصل خطأ أثناء إنشاء البطاقة");
      }
    }
  }

  // ===== أمر معلومات =====
  if (interaction.commandName === "معلومات") {
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle("✨ نظام النقاط والتفاعل الصوتي ✨")
      .setDescription(
        "🎧 هذا البوت مصمم لمكافأة الأعضاء الأكثر تفاعلًا في الرومات الصوتية تلقائيًا،\n" +
        "بدون أي تدخل من الإدارة."
      )
      .addFields(
        {
          name: "⚙️ كيف يعمل؟",
          value:
            "⏱️ التواجد في روم صوت *(بدون Deaf)*\n" +
            "🆙 رفع لفل تلقائي\n" +
            "🎉 بطاقة فخمة عند كل ترقية"
        },
        {
          name: "🏆 الترتيب اليومي",
          value:
            "🕛 يوميًا الساعة **12:00 الليل (توقيت السعودية 🇸🇦)**\n" +
            "🥇 أفضل 5 متفاعلين\n" +
            "🎖️ أفضل 3 يحصلون على رولات خاصة"
        },
        {
          name: "📌 الأوامر المتاحة",
          value: "`/نقاطي` — عرض بطاقتك وتقدمك"
        },
        {
          name: "ℹ️ ملاحظات مهمة",
          value:
            "✅ الميوت مسموح\n" +
            "❌ Deaf غير محتسب\n" +
            "🔒 النقاط محفوظة دائمًا\n" +
            "🎮 كل ما زاد اللفل زادت الصعوبة"
        }
      )
      .setFooter({ text: "🔥 خلك متفاعل وخلي الصوت دايم عامر 🎧" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

// ================= READY =================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
