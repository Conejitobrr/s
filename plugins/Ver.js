'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getContextInfo } = require('../lib/utils');

const INV_PATH = path.join(process.cwd(), 'lib', 'inventario.json');

// 🧠 Memoria automática de alta retención
const viewOnceCache = new Map();
const lastInChat = new Map();
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 horas

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

// 🔍 Extractor universal adaptado a las estructuras de WhatsApp 
function extractViewOnceMedia(msgObj = {}) {
  if (!msgObj) return null;

  const inner =
    msgObj.viewOnceMessage?.message ||
    msgObj.viewOnceMessageV2?.message ||
    msgObj.viewOnceMessageV2Extension?.message ||
    msgObj.ephemeralMessage?.message?.viewOnceMessage?.message ||
    msgObj.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
    msgObj.ephemeralMessage?.message?.viewOnceMessageV2Extension?.message ||
    msgObj.ephemeralMessage?.message ||
    msgObj;

  const img = inner.imageMessage || msgObj.imageMessage;
  const vid = inner.videoMessage || msgObj.videoMessage;
  const aud = inner.audioMessage || msgObj.audioMessage;

  const isVO = (m) => m && (m.viewOnce || msgObj.viewOnceMessage || msgObj.viewOnceMessageV2 || msgObj.viewOnceMessageV2Extension);

  if (img && isVO(img)) {
    return { type: 'image', media: img, mimetype: img.mimetype || 'image/jpeg', caption: img.caption || '' };
  }
  if (vid && isVO(vid)) {
    return { type: 'video', media: vid, mimetype: vid.mimetype || 'video/mp4', caption: vid.caption || '' };
  }
  if (aud && isVO(aud)) {
    return { type: 'audio', media: aud, mimetype: aud.mimetype || 'audio/ogg; codecs=opus', caption: '' };
  }
  return null;
}

function extractFromQuoted(quoted = {}) {
  const vo = extractViewOnceMedia(quoted);
  if (vo) return vo;

  if (quoted.imageMessage) {
    return { type: 'image', media: quoted.imageMessage, mimetype: quoted.imageMessage.mimetype || 'image/jpeg', caption: quoted.imageMessage.caption || '' };
  }
  if (quoted.videoMessage) {
    return { type: 'video', media: quoted.videoMessage, mimetype: quoted.videoMessage.mimetype || 'video/mp4', caption: quoted.videoMessage.caption || '' };
  }
  if (quoted.audioMessage) {
    return { type: 'audio', media: quoted.audioMessage, mimetype: quoted.audioMessage.mimetype || 'audio/ogg; codecs=opus', caption: '' };
  }
  return null;
}

// ⚡ Descarga con reintentos automáticos para evitar errores de red en Termux
async function downloadToBuffer(media, type) {
  if (!media || !media.mediaKey) {
    throw new Error('EMPTY_MEDIA_KEY');
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stream = await downloadContentFromMessage(media, type);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf && buf.length > 0) return buf;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 800 * attempt)); // Espera progresiva antes de reintentar
    }
  }
  throw lastErr || new Error('DOWNLOAD_FAILED');
}

module.exports = {
  name: 'ver',
  aliases: ['rvo', 'revelar', 'viewonce'],
  category: 'utilidad & búsqueda',
  desc: 'Revela mensajes de "Ver una sola vez" sin restricciones',

  // 📡 Captura pasiva automática apenas entra al chat
  onMessage: async ({ msg, remoteJid }) => {
    try {
      if (!msg?.message || !msg?.key?.id) return;
      const extracted = extractViewOnceMedia(msg.message);
      if (!extracted) return;

      const now = Date.now();
      for (const [id, item] of viewOnceCache.entries()) {
        if (now - item.time > CACHE_TTL) viewOnceCache.delete(id);
      }

      viewOnceCache.set(msg.key.id, {
        type: extracted.type,
        mimetype: extracted.mimetype,
        caption: extracted.caption,
        media: extracted.media,
        time: now
      });

      lastInChat.set(remoteJid, msg.key.id);
    } catch {}
  },

  execute: async ({ sock, msg, remoteJid, sender, isOwner, quoted, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedId = ctx?.stanzaId || quoted?.key?.id || null;
      let quotedMsg = ctx?.quotedMessage || quoted?.message || null;

      let targetData = null;

      // 1. Buscar en la memoria RAM del bot
      if (quotedId && viewOnceCache.has(quotedId)) {
        targetData = viewOnceCache.get(quotedId);
      }

      // 2. Si no está en RAM, buscar en el almacén global (store) de Baileys
      if (!targetData && quotedId && sock.store && sock.store.messages) {
        const storedMsg = sock.store.messages.get(quotedId);
        if (storedMsg && storedMsg.message) {
          const fromStored = extractViewOnceMedia(storedMsg.message);
          if (fromStored) {
            targetData = {
              type: fromStored.type,
              mimetype: fromStored.mimetype,
              caption: fromStored.caption,
              media: fromStored.media,
              time: Date.now()
            };
          }
        }
      }

      // 3. Extraer directamente del mensaje citado actual
      if (!targetData && quotedMsg) {
        const fromQuote = extractFromQuoted(quotedMsg);
        if (fromQuote) {
          targetData = {
            type: fromQuote.type,
            mimetype: fromQuote.mimetype,
            caption: fromQuote.caption,
            media: fromQuote.media,
            time: Date.now()
          };
        }
      }

      // 4. Si puso .ver sin citar, usar el último elemento del chat
      if (!targetData && !quotedMsg) {
        const lastId = lastInChat.get(remoteJid);
        if (lastId && viewOnceCache.has(lastId)) {
          targetData = viewOnceCache.get(lastId);
        }
      }

      if (!targetData) {
        return reply('❌ Responde a una foto, video o audio de *"Ver una sola vez"* con *.ver*.');
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

      // 📥 Descarga segura con reintentos
      let finalBuffer = null;
      try {
        finalBuffer = await downloadToBuffer(targetData.media, targetData.type);
      } catch (err) {
        return reply('⚠️ No se pudo descargar el contenido multimedia. Es posible que el servidor de WhatsApp haya expirado el enlace de este archivo.');
      }

      if (!finalBuffer || !finalBuffer.length) {
        return reply('❌ El archivo multimedia está vacío o no se pudo procesar.');
      }

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      const captionText = targetData.caption ? `📝 *Texto:* ${targetData.caption}` : '';

      if (targetData.type === 'image') {
        await sock.sendMessage(remoteJid, { image: finalBuffer, caption: captionText }, { quoted: msg });
      } else if (targetData.type === 'video') {
        await sock.sendMessage(remoteJid, { video: finalBuffer, caption: captionText }, { quoted: msg });
      } else if (targetData.type === 'audio') {
        await sock.sendMessage(remoteJid, { audio: finalBuffer, mimetype: targetData.mimetype, ptt: true }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error enviando media en .ver:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar revelar el archivo.');
    }
  }
};
