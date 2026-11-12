'use strict';

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const INV_PATH = path.join(process.cwd(), 'lib', 'inventario.json');

function getInv() {
  try { return JSON.parse(fs.readFileSync(INV_PATH, 'utf8')); } catch { return {}; }
}
function saveInv(data) {
  try { fs.writeFileSync(INV_PATH, JSON.stringify(data, null, 2)); } catch {}
}

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function findUserInvKey(dbInv, senderJid) {
  const clean = cleanJid(senderJid);
  const num = cleanNumber(senderJid);
  if (dbInv[clean] && Number(dbInv[clean].verUses || 0) > 0) return clean;
  if (dbInv[senderJid] && Number(dbInv[senderJid].verUses || 0) > 0) return senderJid;
  for (const k of Object.keys(dbInv)) {
    if (cleanNumber(k) === num && Number(dbInv[k]?.verUses || 0) > 0) return k;
  }
  return clean;
}

function getContextInfo(msg) {
  const m = msg.message || {};
  return m.extendedTextMessage?.contextInfo ||
         m.imageMessage?.contextInfo ||
         m.videoMessage?.contextInfo ||
         m.audioMessage?.contextInfo ||
         m.documentMessage?.contextInfo || null;
}

module.exports = {
  name: 'ver',
  aliases: ['rvo', 'revelar', 'viewonce'],
  category: 'utilidad & búsqueda',
  desc: 'Revela mensajes de "Ver una sola vez" respondiendo directamente al mensaje',

  execute: async ({ sock, msg, remoteJid, sender, isOwner, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedMessage = ctx?.quotedMessage;
      const stanzaId = ctx?.stanzaId;
      const participant = ctx?.participant;

      if (!quotedMessage || !stanzaId) {
        return reply('❌ Debes responder directamente a la foto, video o audio de *"Ver una sola vez"* con *.ver*.');
      }

      // 🎟️ Validar tickets de inventario si no es Owner
      const dbInv = getInv();
      const invKey = findUserInvKey(dbInv, sender);
      if (!isOwner) {
        const uses = Number(dbInv[invKey]?.verUses || 0);
        if (uses <= 0) {
          return reply('🎟️ No tienes tickets de *.ver* en tu inventario.\n🛒 Cómpralo con: *.comprar ver*');
        }
      }

      // Reconstruimos el objeto del mensaje utilizando la cita directa que llegó en el chat
      const targetMessage = {
        key: {
          remoteJid,
          fromMe: false,
          id: stanzaId,
          participant: participant || remoteJid
        },
        message: quotedMessage
      };

      let mediaBuffer;
      try {
        mediaBuffer = await downloadMediaMessage(
          targetMessage,
          'buffer',
          {},
          { logger: { level: 'silent', child: () => ({ level: 'silent' }) } }
        );
      } catch (err) {
        return reply('⚠️ No se pudo descargar el archivo. Asegúrate de responder al mensaje de Ver Una Sola Vez.');
      }

      if (!mediaBuffer || !mediaBuffer.length) {
        return reply('❌ El archivo multimedia está vacío.');
      }

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      const inner =
        quotedMessage.viewOnceMessage?.message ||
        quotedMessage.viewOnceMessageV2?.message ||
        quotedMessage.viewOnceMessageV2Extension?.message ||
        quotedMessage.ephemeralMessage?.message?.viewOnceMessage?.message ||
        quotedMessage.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
        quotedMessage.ephemeralMessage?.message?.viewOnceMessageV2Extension?.message ||
        quotedMessage.ephemeralMessage?.message ||
        quotedMessage;

      const isImage = inner.imageMessage || quotedMessage.imageMessage;
      const isVideo = inner.videoMessage || quotedMessage.videoMessage;
      const isAudio = inner.audioMessage || quotedMessage.audioMessage;
      const caption = isImage?.caption || isVideo?.caption || '';
      const captionText = caption ? `📝 *Texto:* ${caption}` : '';

      if (isImage) {
        await sock.sendMessage(remoteJid, { image: mediaBuffer, caption: captionText }, { quoted: msg });
      } else if (isVideo) {
        await sock.sendMessage(remoteJid, { video: mediaBuffer, caption: captionText }, { quoted: msg });
      } else if (isAudio) {
        await sock.sendMessage(remoteJid, { audio: mediaBuffer, mimetype: isAudio.mimetype || 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
      } else {
        await sock.sendMessage(remoteJid, { document: mediaBuffer, mimetype: 'application/octet-stream', fileName: 'revelado.bin', caption: captionText }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en comando .ver:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar revelar el archivo.');
    }
  }
};
