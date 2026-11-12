'use strict';

const fs = require('fs');
const path = require('path');

const COOLDOWN_PATH = path.join(process.cwd(), 'lib', 'cooldowns.json');
if (!fs.existsSync(path.dirname(COOLDOWN_PATH))) fs.mkdirSync(path.dirname(COOLDOWN_PATH), { recursive: true });
if (!fs.existsSync(COOLDOWN_PATH)) fs.writeFileSync(COOLDOWN_PATH, '{}');

function getCooldowns() { try { return JSON.parse(fs.readFileSync(COOLDOWN_PATH, 'utf8')); } catch { return {}; } }
function saveCooldowns(data) { fs.writeFileSync(COOLDOWN_PATH, JSON.stringify(data, null, 2)); }

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function msToTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}

module.exports = {
  name: 'claim',
  aliases: ['diario', 'daily', 'recompensa'],
  category: 'economía',
  desc: 'Reclama tu recompensa diaria de XP',

  execute: async ({ sock, msg, remoteJid, sender, db, reply }) => {
    const target = cleanJid(sender);
    const pureNumber = cleanNumber(target);

    const cooldowns = getCooldowns();
    const now = Date.now();
    const delay = 24 * 60 * 60 * 1000;

    if (cooldowns[target] && cooldowns[target].lastClaim) {
      const timeLeft = (cooldowns[target].lastClaim + delay) - now;
      if (timeLeft > 0) {
        return sock.sendMessage(remoteJid, {
          text: `⏳ *MÁS DESPACIO*\n\n@${pureNumber}, ya reclamaste tu recompensa.\n🕒 Vuelve en: *${msToTime(timeLeft)}*`,
          mentions: [target]
        }, { quoted: msg });
      }
    }

    const rewardXP = Math.floor(Math.random() * 1000) + 500;

    try {
      if (db && typeof db.addXP === 'function') {
        await db.addXP(target, rewardXP);
      } else {
        return reply('❌ Error interno: No se pudo contactar con la base de datos de economía.');
      }

      if (!cooldowns[target]) cooldowns[target] = {};
      cooldowns[target].lastClaim = now;
      saveCooldowns(cooldowns);

      await sock.sendMessage(remoteJid, {
        text: `🎁 *RECOMPENSA DIARIA*\n\nFelicidades @${pureNumber}, has abierto tu caja de hoy.\n\n⭐ Ganaste: *+${rewardXP} XP*\n\n_¡Vuelve mañana por más!_`,
        mentions: [target]
      }, { quoted: msg });

    } catch (err) {
      console.log('Error en plugin claim:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar reclamar tu recompensa.');
    }
  }
};
