'use strict';

const fs = require('fs');
const path = require('path');

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function msToTime(ms = 0) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

async function getProfileBuffer(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    const defaultProfile = path.join(process.cwd(), 'assets', 'Sinperfil.jpg');
    if (fs.existsSync(defaultProfile)) {
      return fs.readFileSync(defaultProfile);
    }
    return null;
  }
}

function calculateLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp || 0)) || 0;
}

module.exports = {
  name: 'perfil',
  aliases: ['profile', 'me', 'xp', 'nivel'],
  category: 'economía',
  desc: 'Muestra tu perfil o el de otro usuario',

  execute: async ({ sock, msg, remoteJid, sender, mentionedJid, quoted, participants, config, db, reply }) => {
    try {
      const target = cleanJid(quoted?.sender || mentionedJid?.[0] || sender);
      const user = await db.getUser(target);

      const ownerNumbers = Array.isArray(config.owner) ? config.owner.map(n => String(n).replace(/\D/g, '')) : [];
      const isOwner = ownerNumbers.includes(cleanNumber(target));
      const isPremium = user.premium === true || Number(user.premiumUntil || 0) > Date.now();

      const jailTimeLeft = Number(user.jailUntil || 0) - Date.now();
      const isJailed = jailTimeLeft > 0;

      let partnerText = '*Nadie (Soltero/a)*';
      const targetJid = target.includes('@') ? target : `${cleanNumber(target)}@s.whatsapp.net`;
      const mentions = [targetJid];

      if (user.partner && user.partner !== 'null') {
        const partnerJid = user.partner.includes('@') ? user.partner : `${cleanNumber(user.partner)}@s.whatsapp.net`;
        const partnerNum = cleanNumber(partnerJid);

        let isPartnerInGroup = false;
        if (remoteJid.endsWith('@g.us') && Array.isArray(participants)) {
          const groupNums = participants.map(p => cleanNumber(p.id));
          isPartnerInGroup = groupNums.includes(partnerNum);
        }

        if (isPartnerInGroup) {
          partnerText = `@${partnerNum}`;
          mentions.push(partnerJid);
        } else {
          partnerText = '*Sí (Casado/a)*';
        }
      }

      const image = await getProfileBuffer(sock, targetJid);
      const realLevel = calculateLevel(user.xp || 0);

      const text = `👤 *PERFIL DE USUARIO*

👤 Usuario: @${cleanNumber(target)}
⭐ XP: *${user.xp || 0}*
🏆 Nivel: *${realLevel}*
💎 Premium: *${isPremium ? 'Sí' : 'No'}*
👑 Owner: *${isOwner ? 'Sí' : 'No'}*
🚫 Baneado: *${user.banned ? 'Sí' : 'No'}*

⛓️ Arrestado: *${isJailed ? 'Sí' : 'No'}*
${isJailed ? `⏳ Tiempo restante: *${msToTime(jailTimeLeft)}*\n` : ''}☠️ Fama criminal: *${user.fame || 0}*
💍 Pareja: ${partnerText}`;

      if (image) {
        await sock.sendMessage(remoteJid, { image, caption: text, mentions }, { quoted: msg });
      } else {
        await sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
      }
    } catch (err) {
      console.log('❌ Error en perfil:', err);
      return reply('❌ Error al mostrar el perfil.');
    }
  }
};
