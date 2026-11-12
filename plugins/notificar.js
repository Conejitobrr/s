'use strict';

const { getContextInfo } = require('../lib/utils');

const dailyLimits = new Map();

function getQuotedInfo(msg) {
  const context = getContextInfo(msg);
  if (!context?.quotedMessage) return null;

  return {
    quotedMessage: context.quotedMessage,
    participant: context.participant,
    stanzaId: context.stanzaId
  };
}

module.exports = {
  name: 'notify',
  aliases: ['hidetag', 'notificar', 'tag'],
  category: 'grupos',
  desc: 'Etiqueta a todos los miembros de forma invisible',

  execute: async ({ sock, msg, remoteJid, args, sender, fromGroup, isOwner, isAdmin, participants, userData, reply }) => {
    if (!fromGroup) {
      return reply('❌ Solo funciona en grupos.');
    }

    try {
      const isPremium = userData?.premium === true || Number(userData?.premiumUntil || 0) > Date.now();
      let remaining = null;

      if (!isOwner && !isPremium && !isAdmin) {
        const today = new Date().toDateString();
        let limitInfo = dailyLimits.get(sender) || { date: today, count: 0 };

        if (limitInfo.date !== today) {
          limitInfo = { date: today, count: 0 };
        }

        if (limitInfo.count >= 5) {
          return reply('❌ Ya usaste tus *5 notificaciones gratis* de hoy.\n\n⭐ Hazte premium o admin para uso ilimitado.');
        }

        limitInfo.count += 1;
        dailyLimits.set(sender, limitInfo);
        remaining = 5 - limitInfo.count;
      }

      let users = Array.isArray(participants) && participants.length
        ? participants.map(p => p.id)
        : [];

      if (!users.length) {
        const metadata = sock.getCachedGroupMetadata
          ? await sock.getCachedGroupMetadata(remoteJid)
          : await sock.groupMetadata(remoteJid);
        users = (metadata?.participants || []).map(p => p.id);
      }

      const text = args.join(' ').trim();
      const quoted = getQuotedInfo(msg);
      const extra = remaining !== null ? `\n\n📊 Usos restantes: ${remaining}/5` : '';

      if (quoted && !text) {
        return await sock.sendMessage(remoteJid, {
          forward: {
            key: { remoteJid, fromMe: false, id: quoted.stanzaId, participant: quoted.participant },
            message: quoted.quotedMessage
          },
          contextInfo: { mentionedJid: users }
        }, { quoted: msg });
      }

      if (quoted && text) {
        return await sock.sendMessage(remoteJid, {
          text: text + extra,
          mentions: users
        }, {
          quoted: {
            key: { remoteJid, fromMe: false, id: quoted.stanzaId, participant: quoted.participant },
            message: quoted.quotedMessage
          }
        });
      }

      if (!text) {
        return reply('❌ Escribe un mensaje o responde a uno con *.notify*');
      }

      await sock.sendMessage(remoteJid, {
        text: text + extra,
        mentions: users
      }, { quoted: msg });

    } catch (e) {
      console.log('❌ Error notify:', e?.stack || e);
      await reply('❌ Error al enviar notificación.');
    }
  }
};
