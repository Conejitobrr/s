'use strict';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));
function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

const EVENTOS_MUERTE = [
  (k, v) => `🗡️ @${k} traicionó por la espalda a @${v} por un plato de salchipapa.`,
  (k, v) => `💣 @${v} pisó una mina que @${k} dejó escondida en el baño.`,
  (k, v) => `🩴 @${k} le lanzó un chanclazo con puntería láser a @${v} y lo eliminó.`,
  (k, v) => `🤡 @${v} se puso a llorar por su ex y @${k} aprovechó para sacarlo del mapa.`,
  (k, v) => `🚗 @${k} atropelló a @${v} manejando una mototaxi sin frenos.`,
  (k, v) => `☠️ @${v} intentó robarle el wifi a @${k} y terminó electrocutado.`,
  (k, v) => `🍳 @${k} dejó KO a @${v} de un sartenazo limpio en la nuca.`,
  (k, v) => `🕳️ @${k} empujó a @${v} a un buzón sin tapa mientras miraba TikTok.`
];

module.exports = {
  name: 'royale',
  aliases: ['batalla', 'hungergames', 'juegosdelhambre'],
  category: 'juegos',
  desc: 'Inicia un Battle Royale a muerte entre miembros del grupo con premio de XP',

  execute: async ({ sock, msg, remoteJid, fromGroup, participants, db, reply }) => {
    try {
      if (!fromGroup) return reply('❌ Este comando solo funciona en grupos.');

      let groupMembers = participants;
      if (!groupMembers || !groupMembers.length) {
        const metadata = sock.getCachedGroupMetadata
          ? await sock.getCachedGroupMetadata(remoteJid)
          : await sock.groupMetadata(remoteJid);
        groupMembers = metadata?.participants || [];
      }

      const allMembers = groupMembers.map(p => cleanJid(p.id));
      if (allMembers.length < 4) {
        return reply('❌ Se necesitan al menos 4 miembros en el grupo para armar el Battle Royale.');
      }

      const shuffled = [...allMembers].sort(() => Math.random() - 0.5);
      let alive = shuffled.slice(0, Math.min(8, shuffled.length));
      const initialMentions = [...alive];

      let log = [];
      const listTxt = alive.map((u, i) => `${i + 1}. @${cleanNumber(u)}`).join('\n');

      const sent = await sock.sendMessage(remoteJid, {
        text: `🪂 *¡INICIA EL BATTLE ROYALE DEL GRUPO!* 🪂\n\n*Tributos en la isla:*\n${listTxt}\n\n⏳ _Que comience la masacre..._`,
        mentions: initialMentions
      }, { quoted: msg });

      let round = 1;
      while (alive.length > 1) {
        await sleep(2200);

        const victimIdx = Math.floor(Math.random() * alive.length);
        const victim = alive[victimIdx];
        alive.splice(victimIdx, 1);

        const killer = alive[Math.floor(Math.random() * alive.length)];
        const fraseFn = EVENTOS_MUERTE[Math.floor(Math.random() * EVENTOS_MUERTE.length)];

        log.push(`*Ronda ${round}:* ${fraseFn(cleanNumber(killer), cleanNumber(victim))}`);
        round++;

        const statusTxt =
          `🔥 *BATTLE ROYALE EN CURSO* 🔥\n` +
          `👥 *Vivos:* ${alive.length} | 💀 *Eliminados:* ${initialMentions.length - alive.length}\n\n` +
          `${log.slice(-4).join('\n\n')}`;

        await sock.sendMessage(remoteJid, {
          text: statusTxt,
          edit: sent.key,
          mentions: initialMentions
        });
      }

      await sleep(1800);
      const winner = alive[0];
      const winnerNum = cleanNumber(winner);
      const prize = 1500;

      if (db?.addXP) {
        await db.addXP(winner, prize);
      }

      const finalTxt =
        `👑 *¡FINAL DEL BATTLE ROYALE!* 👑\n\n` +
        `${log.slice(-4).join('\n\n')}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🏆 *ÚNICO SOBREVIVIENTE:* @${winnerNum}\n` +
        `💰 *Premio de Victoria:* +${prize} XP`;

      await sock.sendMessage(remoteJid, {
        text: finalTxt,
        edit: sent.key,
        mentions: initialMentions
      });

    } catch (err) {
      console.log('❌ Error en battleroyale.js:', err);
      return reply('❌ Ocurrió un error durante la batalla campal.');
    }
  }
};
