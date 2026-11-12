'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PROFILE = path.join(process.cwd(), 'assets', 'Sinperfil.jpg');
const FALLBACK_URL = 'https://telegra.ph/file/24fa902ead26340f3df2c.png';

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('Status ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function getProfileBuffer(sock, userJid, groupJid) {
  try {
    const url = await sock.profilePictureUrl(userJid, 'image');
    return await fetchBuffer(url);
  } catch {}

  try {
    if (fs.existsSync(DEFAULT_PROFILE)) return fs.readFileSync(DEFAULT_PROFILE);
  } catch {}

  try {
    const groupUrl = await sock.profilePictureUrl(groupJid, 'image');
    return await fetchBuffer(groupUrl);
  } catch {}

  try {
    return await fetchBuffer(FALLBACK_URL);
  } catch {
    return null;
  }
}

module.exports = {
  name: 'welcome',
  aliases: ['bienvenida', 'testwelcome', 'welcometest', 'probarwelcome'],
  category: 'moderación & grupo',
  desc: 'Activa, desactiva o prueba el mensaje de bienvenida en el grupo',

  execute: async ({ sock, remoteJid, sender, args, commandName, fromGroup, isAdmin, isOwner, groupData, db, reply }) => {
    if (!fromGroup) return reply('❌ Este comando solo funciona en grupos.');
    if (!isAdmin && !isOwner) return reply('❌ Solo los administradores pueden configurar la bienvenida.');

    const cmd = commandName.toLowerCase();
    const opt = (args[0] || '').toLowerCase();

    if (cmd === 'welcome' || cmd === 'bienvenida') {
      if (opt === 'on' || opt === 'activar') {
        await db.setGroup(remoteJid, { welcome: true });
        return reply('✅ *Bienvenidas y despedidas ACTIVADAS* en este grupo.');
      }
      if (opt === 'off' || opt === 'desactivar') {
        await db.setGroup(remoteJid, { welcome: false });
        return reply('❌ *Bienvenidas y despedidas DESACTIVADAS* en este grupo.');
      }
      if (opt !== 'test') {
        const estado = groupData?.welcome ? '✅ ACTIVADO' : '❌ DESACTIVADO';
        return reply(`🎉 *SISTEMA DE BIENVENIDA*\n\n📌 Estado actual: ${estado}\n\n*Uso:*\n🔹 *.welcome on*\n🔹 *.welcome off*\n🔹 *.testwelcome*`);
      }
    }

    const estado = groupData?.welcome ? '✅ ACTIVADO' : '❌ DESACTIVADO (Usa *.welcome on* para activarlo)';
    await reply(`🧪 *Generando vista previa de bienvenida...*\n📌 Estado actual: ${estado}`);

    await module.exports.onGroupUpdate({
      sock,
      id: remoteJid,
      participants: [sender],
      action: 'add',
      db,
      forceTest: true
    });
  },

  onGroupUpdate: async ({ sock, id, participants, action, db, forceTest = false }) => {
    try {
      if (!id || !id.endsWith('@g.us')) return;

      if (!forceTest) {
        const groupData = await db.getGroup(id);
        if (!groupData || !groupData.welcome) return;
      }

      let groupName = 'el grupo';
      let memberCount = 'varios';
      let groupDesc = '';

      try {
        const metadata = sock.getCachedGroupMetadata
          ? await sock.getCachedGroupMetadata(id)
          : await sock.groupMetadata(id);
        groupName = metadata?.subject || 'el grupo';
        memberCount = metadata?.participants?.length || 'varios';
        groupDesc = metadata?.desc ? String(metadata.desc).trim() : '';
      } catch {}

      for (const p of participants) {
        const rawParticipant = typeof p === 'string' ? p : (p?.id || p?.jid || '');
        if (!rawParticipant) continue;

        const userJid = cleanJid(rawParticipant);
        const userNum = cleanNumber(userJid);
        if (!userNum) continue;

        const imgBuffer = await getProfileBuffer(sock, userJid, id);

        if (action === 'add') {
          let texto = `╔══════════════════════╗\n`;
          texto += `      🎉 *¡BIENVENIDO/A!* 🎉\n`;
          texto += `╚══════════════════════╝\n\n`;
          texto += `👋 Hola @${userNum}, bienvenido/a a *${groupName}* ✨\n\n`;
          texto += `👥 *Miembros ahora:* ${memberCount}\n`;
          if (groupDesc) {
            texto += `\n📜 *Reglas / Descripción:*\n${groupDesc.slice(0, 300)}\n`;
          }
          texto += `\n💡 _Usa *.menu* para ver todos los comandos de SiriusBot._`;

          if (imgBuffer) {
            await sock.sendMessage(id, { image: imgBuffer, caption: texto, mentions: [userJid] });
          } else {
            await sock.sendMessage(id, { text: texto, mentions: [userJid] });
          }
        } else if (action === 'remove') {
          let texto = `╭─❖「 😢 DESPEDIDA 」\n`;
          texto += `        👋 *¡ADIÓS!* 👋\n`;
          texto += `╰───────────────\n\n`;
          texto += `💨 @${userNum} ha salido de *${groupName}*.\n`;
          texto += `👥 *Quedamos:* ${memberCount} miembros.\n\n`;
          texto += `Te extrañaremos...\n│\n│ Ojalá te atropelle un carro\n│ pero con cariño 💔🚗`;

          if (imgBuffer) {
            await sock.sendMessage(id, { image: imgBuffer, caption: texto, mentions: [userJid] });
          } else {
            await sock.sendMessage(id, { text: texto, mentions: [userJid] });
          }
        }
      }
    } catch (err) {
      console.log('❌ Error en welcome.js:', err?.message || err);
    }
  }
};
