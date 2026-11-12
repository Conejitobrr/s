'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
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

// 🔍 Extractor robusto de la estructura interna del mensaje de Ver una sola vez
function extractViewOncePayload(quotedMsg = {}) {
  if (!quotedMsg) return null;

  const inner =
    quotedMsg.viewOnceMessage?.message ||
    quotedMsg.viewOnceMessageV2?.message ||
    quotedMsg.viewOnceMessageV2Extension?.message ||
    quotedMsg.ephemeralMessage?.message?.viewOnceMessage?.message ||
    quotedMsg.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
    quotedMsg.ephemeralMessage?.message?.viewOnceMessageV2Extension?.message ||
    quotedMsg.ephemeralMessage?.message ||
    quotedMsg;

  const img = inner.imageMessage || quotedMsg.imageMessage;
  const vid = inner.videoMessage || quotedMsg.videoMessage;
  const aud = inner.audioMessage || quotedMsg.audioMessage;

  if (img) return { type: 'image', media: img, mimetype: img.mimetype || 'image/jpeg', caption: img.caption || '' };
  if (vid) return { type: 'video', media: vid, mimetype: vid.mimetype || 'video/mp4', caption: vid.caption || '' };
  if (aud) return { type: 'audio', media: aud, mimetype: aud.mimetype || 'audio/ogg; codecs=opus', caption: '' };

  return null;
}

// ⚡ Descarga segura del buffer con reintentos
async function downloadToBuffer(media, type) {
  if (!media) throw new Error('NO_MEDIA');
  let lastErr = null;
  for (let i = 1; i <= 3; i++) {
    try {
      const stream = await downloadContentFromMessage(media, type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf && buf.length > 0) return buf;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 600 * i));
    }
  }
  throw lastErr || new Error('DOWNLOAD_FAILED');
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
      let quotedMsg = ctx?.quotedMessage || quoted?.message || null;

      if (!quotedMsg && quotedId && sock.store && sock.store.messages) {
        const storedMsg = sock.store.messages.get(quotedId);
        if (storedMsg && storedMsg.message) {
          quotedMsg = storedMsg.message;
        }
      }

      if (!quotedMsg) {
        return reply('❌ Responde a una foto, video o audio de *"Ver una sola vez"* con *.ver*.');
      }

      const payload = extractViewOncePayload(quotedMsg);
      if (!payload) {
        return reply('❌ El mensaje citado no contiene contenido multimedia.');
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

      let buffer;
      try {
        buffer = await downloadToBuffer(payload.media, payload.type);
      } catch {
        return reply('⚠️ No se pudo descargar el archivo. Es posible que el mensaje ya haya expirado en el servidor.');
      }

      if (!buffer || !buffer.length) {
        return reply('❌ El archivo multimedia está vacío.');
      }

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      const captionText = payload.caption ? `📝 *Texto:* ${payload.caption}` : '';

      // 🚀 Envío limpio como archivo multimedia normal (Esto sí aparece siempre en el chat)
      if (payload.type === 'image') {
        await sock.sendMessage(remoteJid, { image: buffer, caption: captionText }, { quoted: msg });
      } else if (payload.type === 'video') {
        await sock.sendMessage(remoteJid, { video: buffer, caption: captionText }, { quoted: msg });
      } else if (payload.type === 'audio') {
        await sock.sendMessage(remoteJid, { audio: buffer, mimetype: payload.mimetype, ptt: true }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en comando .ver:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar revelar el archivo.');
    }
  }
};
