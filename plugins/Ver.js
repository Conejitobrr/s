'use strict';

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getContextInfo } = require('../lib/utils');

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

module.exports = {
  name: 'ver',
  aliases: ['rvo', 'revelar', 'viewonce'],
  category: 'utilidad & búsqueda',
  desc: 'Revela y reenvía mensajes de "Ver una sola vez"',

  execute: async ({ sock, msg, remoteJid, sender, isOwner, quoted, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedId = ctx?.stanzaId || quoted?.key?.id || null;
      let targetMsg = quoted?.message || ctx?.quotedMessage || null;

      // Si no viene en la cita directa, lo buscamos en el store global de mensajes del bot
      if (!targetMsg && quotedId && sock.store && sock.store.messages) {
        const stored = sock.store.messages.get(quotedId);
        if (stored && stored.message) {
          targetMsg = stored.message;
        }
      }

      if (!targetMsg) {
        return reply('❌ Responde a una foto, video o audio de *"Ver una sola vez"* con *.ver*.');
      }

      // Reconstruimos un objeto de mensaje válido para que Baileys lo descargue sin restricciones
      const fullMsgObject = {
        key: {
          remoteJid,
          id: quotedId,
          participant: ctx?.participant || quoted?.key?.participant
        },
        message: targetMsg
      };

      // 🎟️ Validar tickets de inventario si no es Owner
      const dbInv = getInv();
      const invKey = findUserInvKey(dbInv, sender);
      if (!isOwner) {
        const uses = Number(dbInv[invKey]?.verUses || 0);
        if (uses <= 0) {
          return reply('🎟️ No tienes tickets de *.ver* en tu inventario.\n🛒 Cómpralo con: *.comprar ver*');
        }
      }

      // 🚀 Descarga nativa garantizada con Baileys
      let mediaBuffer;
      try {
        mediaBuffer = await downloadMediaMessage(
          fullMsgObject,
          'buffer',
          {},
          { logger: { level: 'silent', child: () => ({ level: 'silent' }) } }
        );
      } catch (err) {
        return reply('⚠️ No se pudo descargar el archivo. Es posible que el mensaje ya haya expirado en los servidores de WhatsApp.');
      }

      if (!mediaBuffer || !mediaBuffer.length) {
        return reply('❌ El archivo multimedia está vacío.');
      }

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      // Detectar el tipo de archivo para enviarlo correctamente
      const inner =
        targetMsg.viewOnceMessage?.message ||
        targetMsg.viewOnceMessageV2?.message ||
        targetMsg.viewOnceMessageV2Extension?.message ||
        targetMsg.ephemeralMessage?.message?.viewOnceMessage?.message ||
        targetMsg.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
        targetMsg.ephemeralMessage?.message?.viewOnceMessageV2Extension?.message ||
        targetMsg.ephemeralMessage?.message ||
        targetMsg;

      const isImage = inner.imageMessage || targetMsg.imageMessage;
      const isVideo = inner.videoMessage || targetMsg.videoMessage;
      const isAudio = inner.audioMessage || targetMsg.audioMessage;
      const caption = isImage?.caption || isVideo?.caption || '';
      const captionText = caption ? `📝 *Texto:* ${caption}` : '';

      if (isImage) {
        await sock.sendMessage(remoteJid, { image: mediaBuffer, caption: captionText }, { quoted: msg });
      } else if (isVideo) {
        await sock.sendMessage(remoteJid, { video: mediaBuffer, caption: captionText }, { quoted: msg });
      } else if (isAudio) {
        await sock.sendMessage(remoteJid, { audio: mediaBuffer, mimetype: isAudio.mimetype || 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
      } else {
        // Fallback genérico si detecta cualquier otro archivo
        await sock.sendMessage(remoteJid, { document: mediaBuffer, mimetype: 'application/octet-stream', fileName: 'archivo_revelado.bin', caption: captionText }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en comando .ver:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar revelar el archivo.');
    }
  }
};
