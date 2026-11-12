'use strict';

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getContextInfo } = require('../lib/utils');

const INV_PATH = path.join(process.cwd(), 'lib', 'inventario.json');

// 🧠 Memoria RAM para guardar el mensaje completo en tiempo real
const viewOnceStore = new Map();
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

function hasViewOnce(msgObj = {}) {
  if (!msgObj) return false;
  const str = JSON.stringify(msgObj);
  return str.includes('viewOnceMessage') || str.includes('viewOnce');
}

module.exports = {
  name: 'ver',
  aliases: ['rvo', 'revelar', 'viewonce'],
  category: 'utilidad & búsqueda',
  desc: 'Revela mensajes de "Ver una sola vez" guardando el mensaje original en vivo',

  // 📡 Guarda el mensaje completo apenas entra al chat con sus llaves de cifrado intactas
  onMessage: async ({ msg, remoteJid }) => {
    try {
      if (!msg?.message || !msg?.key?.id) return;
      if (!hasViewOnce(msg.message)) return;

      const now = Date.now();
      for (const [id, item] of viewOnceStore.entries()) {
        if (now - item.time > CACHE_TTL) viewOnceStore.delete(id);
      }

      viewOnceStore.set(msg.key.id, { msg, time: now });
      lastInChat.set(remoteJid, msg.key.id);
    } catch {}
  },

  execute: async ({ sock, msg, remoteJid, sender, isOwner, quoted, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedId = ctx?.stanzaId || quoted?.key?.id || null;

      let targetMsgObj = null;

      // 1. Buscar en nuestra memoria en vivo
      if (quotedId && viewOnceStore.has(quotedId)) {
        targetMsgObj = viewOnceStore.get(quotedId).msg;
      }

      // 2. Buscar en el store global de Baileys
      if (!targetMsgObj && quotedId && sock.store && sock.store.messages) {
        const stored = sock.store.messages.get(quotedId);
        if (stored) targetMsgObj = stored;
      }

      // 3. Si no citó nada, usar el último View Once del chat
      if (!targetMsgObj && !quotedId) {
        const lastId = lastInChat.get(remoteJid);
        if (lastId && viewOnceStore.has(lastId)) {
          targetMsgObj = viewOnceStore.get(lastId).msg;
        }
      }

      if (!targetMsgObj) {
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

      // 🚀 Descargar usando el mensaje original completo con sus llaves intactas
      let mediaBuffer;
      try {
        mediaBuffer = await downloadMediaMessage(
          targetMsgObj,
          'buffer',
          {},
          { logger: { level: 'silent', child: () => ({ level: 'silent' }) } }
        );
      } catch (err) {
        return reply('⚠️ No se pudo descargar el archivo. Asegúrate de responder al mensaje justo después de que llegue.');
      }

      if (!mediaBuffer || !mediaBuffer.length) {
        return reply('❌ El archivo multimedia está vacío.');
      }

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      const unwrapped = targetMsgObj.message?.viewOnceMessage?.message || 
                        targetMsgObj.message?.viewOnceMessageV2?.message || 
                        targetMsgObj.message || {};
      const img = unwrapped.imageMessage;
      const vid = unwrapped.videoMessage;
      const aud = unwrapped.audioMessage;
      const caption = img?.caption || vid?.caption || '';
      const captionText = caption ? `📝 *Texto:* ${caption}` : '';

      if (img) {
        await sock.sendMessage(remoteJid, { image: mediaBuffer, caption: captionText }, { quoted: msg });
      } else if (vid) {
        await sock.sendMessage(remoteJid, { video: mediaBuffer, caption: captionText }, { quoted: msg });
      } else if (aud) {
        await sock.sendMessage(remoteJid, { audio: mediaBuffer, mimetype: aud.mimetype || 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
      } else {
        await sock.sendMessage(remoteJid, { document: mediaBuffer, mimetype: 'application/octet-stream', fileName: 'revelado.bin', caption: captionText }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en comando .ver:', err?.message || err);
      return reply('❌ Ocurrió un error al intentar revelar el archivo.');
    }
  }
};
