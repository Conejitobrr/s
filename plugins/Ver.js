'use strict';

const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getContextInfo } = require('../lib/utils');

const INV_PATH = path.join(process.cwd(), 'lib', 'inventario.json');

// 🧠 Memoria RAM de alta velocidad para capturar View Once en tiempo real
const liveViewOnceCache = new Map();
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

// 🔍 Extractor universal de contenido "Ver una sola vez"
function extractViewOnceRaw(msgObj = {}) {
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

  if (img && isVO(img)) return { type: 'image', media: img, mimetype: img.mimetype || 'image/jpeg', caption: img.caption || '' };
  if (vid && isVO(vid)) return { type: 'video', media: vid, mimetype: vid.mimetype || 'video/mp4', caption: vid.caption || '' };
  if (aud && isVO(aud)) return { type: 'audio', media: aud, mimetype: aud.mimetype || 'audio/ogg; codecs=opus', caption: '' };

  return null;
}

async function downloadBuffer(media, type) {
  const stream = await downloadContentFromMessage(media, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = {
  name: 'ver',
  aliases: ['rvo', 'revelar', 'viewonce'],
  category: 'utilidad & búsqueda',
  desc: 'Revela mensajes de "Ver una sola vez" al instante',

  // 📡 Intercepta el archivo en el milisegundo exacto en que entra al chat (antes de abrirse)
  onMessage: async ({ msg, remoteJid }) => {
    try {
      if (!msg?.message || !msg?.key?.id) return;
      const extracted = extractViewOnceRaw(msg.message);
      if (!extracted || !extracted.media) return;

      const now = Date.now();
      for (const [id, item] of liveViewOnceCache.entries()) {
        if (now - item.time > CACHE_TTL) liveViewOnceCache.delete(id);
      }

      // Descargamos el buffer de inmediato a la RAM antes de que el usuario lo abra
      let buffer = null;
      try {
        buffer = await downloadBuffer(extracted.media, extracted.type);
      } catch {}

      if (buffer && buffer.length > 0) {
        liveViewOnceCache.set(msg.key.id, {
          type: extracted.type,
          mimetype: extracted.mimetype,
          caption: extracted.caption,
          buffer,
          time: now
        });
        lastInChat.set(remoteJid, msg.key.id);
      }
    } catch {}
  },

  execute: async ({ sock, msg, remoteJid, sender, isOwner, quoted, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedId = ctx?.stanzaId || quoted?.key?.id || null;

      let targetData = null;

      // 1. Buscar en la memoria RAM el archivo capturado en vivo
      if (quotedId && liveViewOnceCache.has(quotedId)) {
        targetData = liveViewOnceCache.get(quotedId);
      }

      // 2. Si no está en RAM pero el usuario puso .ver sin citar nada, usar el último del chat
      if (!targetData && !quotedId) {
        const lastId = lastInChat.get(remoteJid);
        if (lastId && liveViewOnceCache.has(lastId)) {
          targetData = liveViewOnceCache.get(lastId);
        }
      }

      if (!targetData || !targetData.buffer) {
        return reply('❌ Para revelar una foto/video de *"Ver una sola vez"*, debes responder directamente al mensaje *antes o después de que llegue* (el bot lo intercepta automáticamente al entrar al chat).');
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

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      const captionText = targetData.caption ? `📝 *Texto:* ${targetData.caption}` : '';

      // 🚀 Enviar el archivo recuperado al chat
      if (targetData.type === 'image') {
        await sock.sendMessage(remoteJid, { image: targetData.buffer, caption: captionText }, { quoted: msg });
      } else if (targetData.type === 'video') {
        await sock.sendMessage(remoteJid, { video: targetData.buffer, caption: captionText }, { quoted: msg });
      } else if (targetData.type === 'audio') {
        await sock.sendMessage(remoteJid, { audio: targetData.buffer, mimetype: targetData.mimetype, ptt: true }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en comando .ver:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar revelar el archivo.');
    }
  }
};
