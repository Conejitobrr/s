'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const INV_PATH = path.join(process.cwd(), 'lib', 'inventario.json');

// 🧠 Memoria automática: guarda las fotos "Ver una sola vez" apenas llegan al chat (antes de que las abras)
const viewOnceCache = new Map();
const lastInChat = new Map();
const CACHE_TTL = 60 * 60 * 1000; // Las recuerda por 1 hora

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

  if (inner.imageMessage && (inner.imageMessage.viewOnce || msgObj.viewOnceMessage || msgObj.viewOnceMessageV2 || msgObj.viewOnceMessageV2Extension)) {
    return { type: 'image', media: inner.imageMessage, mimetype: inner.imageMessage.mimetype || 'image/jpeg', caption: inner.imageMessage.caption || '' };
  }
  if (inner.videoMessage && (inner.videoMessage.viewOnce || msgObj.viewOnceMessage || msgObj.viewOnceMessageV2 || msgObj.viewOnceMessageV2Extension)) {
    return { type: 'video', media: inner.videoMessage, mimetype: inner.videoMessage.mimetype || 'video/mp4', caption: inner.videoMessage.caption || '' };
  }
  if (inner.audioMessage && (inner.audioMessage.viewOnce || msgObj.viewOnceMessage || msgObj.viewOnceMessageV2 || msgObj.viewOnceMessageV2Extension)) {
    return { type: 'audio', media: inner.audioMessage, mimetype: inner.audioMessage.mimetype || 'audio/ogg; codecs=opus', caption: '' };
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

async function downloadToBuffer(media, type) {
  if (!media || !media.mediaKey || !media.mediaKey.length) {
    throw new Error('EMPTY_MEDIA_KEY');
  }
  const stream = await downloadContentFromMessage(media, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = {
  name: 'ver',
  aliases: ['rvo', 'revelar', 'viewonce'],
  category: 'utilidad & búsqueda',
  desc: 'Revela mensajes de "Ver una sola vez" en privado o grupos',

  // 📡 Captura el archivo apenas entra al chat (antes de que quede "Abierto")
  onMessage: async ({ msg, remoteJid }) => {
    try {
      if (!msg?.message || !msg?.key?.id) return;
      const extracted = extractViewOnceMedia(msg.message);
      if (!extracted) return;

      const now = Date.now();
      for (const [id, item] of viewOnceCache.entries()) {
        if (now - item.time > CACHE_TTL) viewOnceCache.delete(id);
      }

      let buffer = null;
      if (extracted.media?.mediaKey && extracted.media.mediaKey.length > 0) {
        try {
          buffer = await downloadToBuffer(extracted.media, extracted.type);
        } catch {}
      }

      viewOnceCache.set(msg.key.id, {
        type: extracted.type,
        mimetype: extracted.mimetype,
        caption: extracted.caption,
        media: extracted.media,
        buffer,
        time: now
      });

      lastInChat.set(remoteJid, msg.key.id);
    } catch {}
  },

  execute: async ({ sock, msg, remoteJid, sender, isOwner, reply }) => {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quotedId = ctx?.stanzaId || null;
      const quotedMsg = ctx?.quotedMessage || null;

      let targetData = null;

      // 1. Buscar en la memoria automática por ID del mensaje citado (funciona aunque ya diga "Abierto")
      if (quotedId && viewOnceCache.has(quotedId)) {
        targetData = viewOnceCache.get(quotedId);
      }

      // 2. Si no estaba en memoria, intentar extraer directo de la cita (funciona si aún no se ha abierto)
      if (!targetData && quotedMsg) {
        const fromQuote = extractFromQuoted(quotedMsg);
        if (fromQuote) {
          targetData = {
            type: fromQuote.type,
            mimetype: fromQuote.mimetype,
            caption: fromQuote.caption,
            media: fromQuote.media,
            buffer: null
          };
        }
      }

      // 3. Si puso .ver sin citar nada, revelar la última foto de 1 vez de ese chat
      if (!targetData && !quotedMsg) {
        const lastId = lastInChat.get(remoteJid);
        if (lastId && viewOnceCache.has(lastId)) {
          targetData = viewOnceCache.get(lastId);
        }
      }

      if (!targetData) {
        return reply('❌ Responde a una foto, video o audio de *"Ver una sola vez"* con *.ver*.');
      }

      // 🎟️ Verificar ticket si lo usa otra persona que no seas tú (Owner)
      const dbInv = getInv();
      const invKey = findUserInvKey(dbInv, sender);
      if (!isOwner) {
        const uses = Number(dbInv[invKey]?.verUses || 0);
        if (uses <= 0) {
          return reply('🎟️ No tienes tickets de *.ver* en tu inventario.\n🛒 Cómpralo con: *.comprar ver*');
        }
      }

      let finalBuffer = targetData.buffer;
      if (!finalBuffer) {
        try {
          finalBuffer = await downloadToBuffer(targetData.media, targetData.type);
        } catch (err) {
          if (err.message === 'EMPTY_MEDIA_KEY' || String(err.message).includes('empty media key')) {
            return reply('⚠️ Esta foto ya había sido abierta (*Abierto*) antes de que el bot pudiera guardarla en memoria. Con las nuevas que te envíen ya podrás usar *.ver* incluso después de abrirlas.');
          }
          throw err;
        }
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
      return reply('❌ No se pudo recuperar el archivo.');
    }
  }
};
