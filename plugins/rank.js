'use strict';

function getRole(level) {
  if (level >= 500) return '🐉 Trascendido';
  if (level >= 250) return '☄️ Celestial';
  if (level >= 150) return '🪐 Divino';
  if (level >= 100) return '👑 Inmortal';
  if (level >= 70) return '💠 Mítico';
  if (level >= 50) return '🌟 Leyenda';
  if (level >= 35) return '🧙 Maestro';
  if (level >= 25) return '🔥 Elite';
  if (level >= 18) return '⚔️ Veterano';
  if (level >= 12) return '🛡️ Guerrero';
  if (level >= 8) return '⚡ Aventurero';
  if (level >= 5) return '📚 Aprendiz';
  if (level >= 3) return '🌱 Principiante';
  return '🐣 Novato';
}

function makeBar(progress, total, size = 10) {
  let filled = Math.round((progress / total) * size);
  if (filled < 0) filled = 0;
  if (filled > size) filled = size;
  const empty = size - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function calculateLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp || 0)) || 0;
}

module.exports = {
  name: 'rank',
  aliases: ['rango'],
  category: 'economía',
  desc: 'Muestra tu rango o el de otro usuario con barra de progreso',

  execute: async ({ sock, msg, remoteJid, sender, pushName, mentionedJid, quoted, db }) => {
    const target = cleanJid(quoted?.sender || mentionedJid?.[0] || sender);
    const user = await db.getUser(target);

    const xp = user.xp || 0;
    const level = calculateLevel(xp);

    const currentBaseXP = 100 * Math.pow(level, 2);
    const nextBaseXP = 100 * Math.pow(level + 1, 2);

    const tierTotal = nextBaseXP - currentBaseXP;
    const progress = xp - currentBaseXP;
    const needed = nextBaseXP - xp;

    const role = getRole(level);
    const bar = makeBar(progress, tierTotal);

    const number = cleanNumber(target);
    const displayUser = target === cleanJid(sender) ? `👤 ${pushName}` : `👤 @${number}`;
    const targetJid = `${number}@s.whatsapp.net`;

    const text = `╔════════════════════╗
║      🎖️ PERFIL RANK
╠════════════════════╣
║ ${displayUser}
║
║ ⭐ XP: *${xp}*
║ 📈 Nivel: *${level}*
║ 🎭 Rol: *${role}*
║
║ ${bar}
║ ${progress} / ${tierTotal} XP
║
║ ⏳ Faltan: ${needed} XP
╚════════════════════╝`;

    await sock.sendMessage(remoteJid, { text, mentions: [targetJid] }, { quoted: msg });
  }
};
