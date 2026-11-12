'use strict';

const fs = require('fs');
const path = require('path');

const MUTED_FILE = path.join(process.cwd(), 'lib', 'muted.json');

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

async function tryDeleteMessage(sock, remoteJid, key) {
  const attempts = [key, { ...key, fromMe: true }, { ...key, fromMe: false }];
  for (const deleteKey of attempts) {
    try {
      await sock.sendMessage(remoteJid, { delete: deleteKey });
      return true;
    } catch {}
  }
  return false;
}

function loadMutes() {
  try {
    const dir = path.dirname(MUTED_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(MUTED_FILE)) fs.writeFileSync(MUTED_FILE, '{}');
    return JSON.parse(fs.readFileSync(MUTED_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveMutes(data) {
  try { fs.writeFileSync(MUTED_FILE, JSON.stringify(data, null, 2)); } catch {}
}

function isUserMuted(groupId, userJid) {
  const data = loadMutes();
  return !!data?.[groupId]?.[cleanJid(userJid)];
}

module.exports = {
  name: 'mutear',
  aliases: ['unmutear', 'silenciar', 'desilenciar'],
  category: 'moderación',
  desc: 'Silencia a un usuario eliminando sus mensajes al instante',

  async onMessage({ sock, msg, remoteJid, sender, fromGroup }) {
    if (!fromGroup || !sender || !msg?.key || !sock) return;
    const userJid = cleanJid(sender);

    if (isUserMuted(remoteJid, userJid)) {
      const targetKey = {
        remoteJid,
        id: msg.key.id,
        participant: msg.key.participant || sender,
        fromMe: false
      };
      await tryDeleteMessage(sock, remoteJid, targetKey);
    }
  },

  async execute({ sock, remoteJid, msg, sender, args, commandName, fromGroup, isOwner, isAdmin, mentionedJid, quoted, reply, config }) {
    if (!fromGroup) return reply('❌ Este comando solo se puede usar dentro de grupos.');
    if (!isAdmin && !isOwner) return reply('❌ Solo los administradores o el owner pueden usar este comando.');

    let target = quoted?.sender || mentionedJid?.[0];
    if (!target && args.length > 0) {
      const cleanArgs = args.join('').replace(/\D/g, '');
      if (cleanArgs) target = `${cleanArgs}@s.whatsapp.net`;
    }

    if (!target) {
      return reply('❌ Debes responder a un mensaje, mencionar a alguien o escribir su número.\n\n*Ejemplo:*\n.mutear @usuario');
    }

    target = cleanJid(target);
    const data = loadMutes();
    const cmd = String(commandName || '').toLowerCase();

    if (cmd === 'mutear' || cmd === 'silenciar') {
      const botJid = cleanJid(sock.user?.id || '');
      if (cleanNumber(target) === cleanNumber(botJid)) {
        return reply('🛡️ No puedes mutearme a mí. ¡Soy el bot!');
      }

      const ownerNumbers = Array.isArray(config?.owner) ? config.owner.map(n => String(n).replace(/\D/g, '')) : [];
      if (ownerNumbers.includes(cleanNumber(target))) {
        return sock.sendMessage(remoteJid, {
          text: `🛡️ Inmunidad de sistema. No se puede silenciar al Owner @${cleanNumber(target)}.`,
          mentions: [target]
        }, { quoted: msg });
      }

      if (!data[remoteJid]) data[remoteJid] = {};
      if (data[remoteJid][target]) {
        return sock.sendMessage(remoteJid, {
          text: `⚠️ @${cleanNumber(target)} ya se encuentra silenciado en este chat.`,
          mentions: [target]
        }, { quoted: msg });
      }

      data[remoteJid][target] = { mutedBy: cleanJid(sender), time: Date.now() };
      saveMutes(data);

      return sock.sendMessage(remoteJid, {
        text: `🤐 *¡USUARIO SILENCIADO!* 🤐\n\nEl usuario @${cleanNumber(target)} ha sido muteado.\n\n_Sus mensajes serán eliminados al instante._ 🚷`,
        mentions: [target]
      }, { quoted: msg });
    }

    if (cmd === 'unmutear' || cmd === 'desilenciar') {
      if (!data[remoteJid] || !data[remoteJid][target]) {
        return sock.sendMessage(remoteJid, {
          text: `⚠️ @${cleanNumber(target)} no está silenciado en este grupo.`,
          mentions: [target]
        }, { quoted: msg });
      }

      delete data[remoteJid][target];
      if (Object.keys(data[remoteJid]).length === 0) delete data[remoteJid];
      saveMutes(data);

      return sock.sendMessage(remoteJid, {
        text: `🔊 @${cleanNumber(target)} ha sido desilenciado. Ya puede volver a escribir normalmente.`,
        mentions: [target]
      }, { quoted: msg });
    }
  }
};
