'use strict';

const fs = require('fs');
const path = require('path');
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
  desc: 'Reenvía y revela mensajes de "Ver una sola vez" al instante',

  execute: async ({ sock, msg, remoteJid, sender, isOwner, quoted, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedId = ctx?.stanzaId || quoted?.key?.id || null;
      let quotedMsg = ctx?.quotedMessage || quoted?.message || null;

      // Si no citó nada pero hay store global, intentamos buscar el mensaje citado en el historial reciente
      if (!quotedMsg && quotedId && sock.store && sock.store.messages) {
        const storedMsg = sock.store.messages.get(quotedId);
        if (storedMsg && storedMsg.message) {
          quotedMsg = storedMsg.message;
        }
      }

      if (!quotedMsg) {
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

      // 🔄 Extraer el contenido interno del View Once para re-enviarlo como normal
      const viewOnceInner =
        quotedMsg.viewOnceMessage?.message ||
        quotedMsg.viewOnceMessageV2?.message ||
        quotedMsg.viewOnceMessageV2Extension?.message ||
        quotedMsg.ephemeralMessage?.message?.viewOnceMessage?.message ||
        quotedMsg.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
        quotedMsg.ephemeralMessage?.message?.viewOnceMessageV2Extension?.message ||
        quotedMsg.ephemeralMessage?.message ||
        quotedMsg;

      const mediaPayload = viewOnceInner.imageMessage || viewOnceInner.videoMessage || viewOnceInner.audioMessage || 
                           quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage;

      if (!mediaPayload) {
        return reply('❌ El mensaje citado no parece ser un archivo multimedia de "Ver una sola vez".');
      }

      if (!isOwner) {
        dbInv[invKey].verUses -= 1;
        saveInv(dbInv);
      }

      // 🚀 Reenvío directo nativo de WhatsApp (Sin guardar buffers ni caché)
      await sock.sendMessage(remoteJid, {
        forward: {
          key: {
            remoteJid,
            fromMe: false,
            id: quotedId,
            participant: ctx?.participant || quoted?.key?.participant
          },
          message: quotedMsg
        }
      }, { quoted: msg });

    } catch (err) {
      console.log('❌ Error al reenviar media en .ver:', err?.message || err);
      return reply('❌ No se pudo reenviar el archivo. Es posible que el mensaje ya haya expirado completamente.');
    }
  }
};
