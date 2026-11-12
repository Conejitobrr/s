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
  desc: 'Reenvía cualquier mensaje o multimedia de "Ver una sola vez"',

  execute: async ({ sock, msg, remoteJid, sender, isOwner, quoted, reply }) => {
    try {
      const ctx = getContextInfo(msg);
      const quotedId = ctx?.stanzaId || quoted?.key?.id || null;
      let targetMessageObject = null;

      // 1. Buscamos el mensaje completo en el store global del bot que se creó en main.js
      if (quotedId && sock.store && sock.store.messages) {
        const stored = sock.store.messages.get(quotedId);
        if (stored) {
          targetMessageObject = stored;
        }
      }

      // 2. Si no está en el store, intentamos usar la cita directa del mensaje
      if (!targetMessageObject && (quoted?.message || ctx?.quotedMessage)) {
        targetMessageObject = {
          key: {
            remoteJid,
            fromMe: false,
            id: quotedId,
            participant: ctx?.participant || quoted?.key?.participant
          },
          message: quoted?.message || ctx?.quotedMessage
        };
      }

      if (!targetMessageObject) {
        return reply('❌ Responde a la foto, video, audio o sticker de *"Ver una sola vez"* con *.ver*.');
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

      // 🚀 Reenvío nativo absoluto de Baileys (Reenvía cualquier tipo de archivo o sticker sin alterar nada)
      await sock.sendMessage(remoteJid, {
        forward: targetMessageObject
      }, { quoted: msg });

    } catch (err) {
      console.log('❌ Error en comando .ver (Reenvío):', err?.message || err);
      return reply('❌ Ocurrió un error al intentar reenviar el mensaje.');
    }
  }
};
