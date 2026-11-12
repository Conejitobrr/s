'use strict';

const { getContextInfo } = require('../lib/utils');

function getPureJid(jid = '') {
  const str = String(jid);
  if (!str) return '';
  const num = str.split('@')[0].split(':')[0].replace(/\D/g, '');
  return `${num}@s.whatsapp.net`;
}

async function tryDeleteMessage(sock, remoteJid, key) {
  const attempts = [
    key,
    { ...key, fromMe: true },
    { ...key, fromMe: false }
  ];

  let lastError = null;
  for (const deleteKey of attempts) {
    try {
      await sock.sendMessage(remoteJid, { delete: deleteKey });
      return true;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('No se pudo eliminar el mensaje.');
}

module.exports = {
  name: 'del',
  aliases: ['delete', 'borrar', 'eliminar'],
  category: 'administración',
  desc: 'Elimina primero el mensaje seleccionado y luego el comando',

  execute: async ({ sock, msg, remoteJid, sender, fromGroup, isAdmin, isOwner, userData, reply }) => {
    try {
      const isPremium = userData?.premium === true || Number(userData?.premiumUntil || 0) > Date.now();

      if (!isOwner && !isAdmin && !isPremium) {
        return reply('❌ Solo los administradores, owner o usuarios premium pueden usar este comando.');
      }

      const quotedInfo = getContextInfo(msg);
      if (!quotedInfo?.stanzaId) {
        return reply('❌ Debes responder al mensaje que quieres eliminar.\n\n📌 Uso:\n*.del*');
      }

      const botJid = getPureJid(sock.user?.id || '');
      const quotedParticipant = quotedInfo.participant ? getPureJid(quotedInfo.participant) : '';
      const isOwnMessage = quotedParticipant === botJid || (!fromGroup && !quotedParticipant);

      if (!fromGroup && !isOwnMessage) {
        return reply('❌ En chats privados solo puedo eliminar los mensajes enviados por mí.');
      }

      const targetKey = {
        remoteJid,
        id: quotedInfo.stanzaId,
        participant: fromGroup ? (quotedInfo.participant || quotedParticipant) : undefined,
        fromMe: isOwnMessage
      };

      const commandKey = {
        remoteJid: msg.key.remoteJid,
        id: msg.key.id,
        participant: msg.key.participant,
        fromMe: !!msg.key.fromMe
      };

      try {
        await tryDeleteMessage(sock, remoteJid, targetKey);
      } catch {
        return reply('❌ No pude eliminar el mensaje. Asegúrate de que el bot sea Administrador.');
      }

      await new Promise(resolve => setTimeout(resolve, 250));

      try {
        await tryDeleteMessage(sock, remoteJid, commandKey);
      } catch {}
    } catch (err) {
      console.log('❌ Error en plugin del:', err?.message || err);
      return reply('❌ Ocurrió un error al procesar la solicitud.');
    }
  }
};
