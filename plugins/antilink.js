'use strict';

const fs = require('fs');
const path = require('path');
const { store } = require('../main');

const WARNS_PATH = path.join(process.cwd(), 'lib', 'warns.json');
if (!fs.existsSync(path.dirname(WARNS_PATH))) fs.mkdirSync(path.dirname(WARNS_PATH), { recursive: true });
if (!fs.existsSync(WARNS_PATH)) fs.writeFileSync(WARNS_PATH, '{}');

function getWarns() { try { return JSON.parse(fs.readFileSync(WARNS_PATH, 'utf8')); } catch { return {}; } }
function saveWarns(data) { fs.writeFileSync(WARNS_PATH, JSON.stringify(data, null, 2)); }

module.exports = {
  name: 'antilink',
  aliases: ['antienlace'],
  category: 'moderación',
  desc: 'Elimina enlaces de WhatsApp y advierte o expulsa a los infractores',

  execute: async ({ remoteJid, args, fromGroup, isAdmin, isOwner, db, groupData, reply }) => {
    if (!fromGroup) return reply('❌ Este comando solo funciona en grupos.');
    if (!isAdmin && !isOwner) return reply('❌ Solo los administradores pueden activar o desactivar el Antilink.');

    const opt = (args[0] || '').toLowerCase();
    const current = groupData?.antilink === true;

    if (!['on', 'off'].includes(opt)) {
      return reply(`🛡️ *SISTEMA ANTILINK*\n\nEstado actual: *${current ? 'Activado ✅' : 'Desactivado ❌'}*\n\nUso:\n*.antilink on*\n*.antilink off*`);
    }

    const newState = opt === 'on';
    await db.setGroup(remoteJid, { antilink: newState });
    return reply(newState ? '✅ *Antilink activado:* Eliminaré enlaces de otros grupos de WhatsApp.' : '🔓 *Antilink desactivado* en este grupo.');
  },

  onMessage: async ({ sock, msg, remoteJid, body, sender, isOwner, isAdmin, groupData }) => {
    if (!remoteJid || !remoteJid.endsWith('@g.us') || !body) return;
    if (!groupData || groupData.antilink !== true) return;

    const linkRegex = /chat\.whatsapp\.com\/[a-zA-Z0-9]+/i;
    if (!linkRegex.test(body)) return;
    if (isOwner || isAdmin) return;

    const senderJid = String(sender).split(':')[0];
    const senderNum = senderJid.split('@')[0].replace(/\D/g, '');

    try {
      await sock.sendMessage(remoteJid, { delete: msg.key });
    } catch {}

    const dbWarns = getWarns();
    if (!dbWarns[remoteJid]) dbWarns[remoteJid] = {};

    const currentWarns = (dbWarns[remoteJid][senderJid] || 0) + 1;
    dbWarns[remoteJid][senderJid] = currentWarns;

    if (currentWarns >= 3) {
      dbWarns[remoteJid][senderJid] = 0;
      saveWarns(dbWarns);

      await sock.sendMessage(remoteJid, {
        text: `🚫 *LÍMITE ALCANZADO*\n\n@${senderNum} ha sido expulsado por enviar enlaces de otros grupos (3/3 advertencias).`,
        mentions: [senderJid]
      });

      setTimeout(async () => {
        try {
          await sock.groupParticipantsUpdate(remoteJid, [senderJid], 'remove');
          store.groupMetadata.delete(remoteJid);
        } catch {}
      }, 800);
    } else {
      saveWarns(dbWarns);
      await sock.sendMessage(remoteJid, {
        text: `⚠️ *ANTILINK DETECTADO*\n\n@${senderNum}, no se permiten enlaces de otros grupos aquí.\n🚨 Advertencias: *${currentWarns}/3*`,
        mentions: [senderJid]
      });
    }
  }
};
