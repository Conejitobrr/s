'use strict';

// ⏳ Control de Spam (En memoria RAM para que sea ultra rápido)
const cooldowns = new Map();

// 🧹 Limpieza de JID para que funcione perfecto con WhatsApp
function cleanJid(jid = '') {
  return String(jid).split(':')[0];
}

// 🧮 Fórmula de Nivel por defecto (Si tu DB no tiene una)
function calculateLevel(xp) {
  return Math.floor(0.1 * Math.sqrt(xp)) || 0; 
}

module.exports = {
  name: 'topxp',
  aliases: ['topxp', 'topglobal', 'leaderboard'],
  category: 'rpg',
  desc: 'Muestra el ranking de XP del grupo o a nivel global',

  // ===============================
  // 🔥 SISTEMA DE XP PASIVA 
  // ===============================
  onMessage: async ({ sender, remoteJid, db }) => {
    // 🔥 CORRECCIÓN: Validación directa del ID para saber si es un grupo
    if (!remoteJid.endsWith('@g.us') || !db) return;

    const key = `${remoteJid}:${sender}`;
    const now = Date.now();

    // ⏳ Cooldown de 8 segundos (evita farmeo por spam)
    if (cooldowns.has(key) && (now - cooldowns.get(key) < 8000)) return;
    cooldowns.set(key, now);

    try {
      if (typeof db.getUser === 'function') {
        const user = await db.getUser(sender);
        if (user) {
          const randomXP = Math.floor(Math.random() * 10) + 5; // Gana entre 5 y 14 XP
          user.xp = (user.xp || 0) + randomXP;
          if (typeof user.save === 'function') await user.save();
        }
      }
    } catch (err) {
      // Silencioso para no hacer spam en la consola
    }
  },

  // ===============================
  // 🏆 COMANDOS (topxp / topglobal)
  // ===============================
  execute: async ({ sock, msg, remoteJid, commandName, sender, db, reply }) => {
    try {
      if (!db) return reply('❌ Error: Base de datos no conectada.');

      await sock.sendPresenceUpdate('composing', remoteJid);

      // 1️⃣ LECTURA INTELIGENTE DE TODOS LOS USUARIOS EN LA DB
      let allUsers = [];
      if (typeof db.getAllUsers === 'function') {
        allUsers = await db.getAllUsers();
      } else if (typeof db.getAll === 'function') {
        const data = await db.getAll();
        const usersObj = data.users || data || {};
        allUsers = Object.entries(usersObj).map(([id, u]) => ({ id, ...u }));
      } else if (db.User && typeof db.User.find === 'function') { 
        allUsers = await db.User.find({}); 
      } else {
        return reply('❌ Error: No se encontró el método para leer la lista de usuarios en la base de datos.');
      }

      // 2️⃣ FILTRADO Y MAPEO
      const list = allUsers.map(u => ({
        id: cleanJid(u.id || u._id || u.jid),
        xp: u.xp || 0,
        level: (typeof db.calculateLevel === 'function') ? db.calculateLevel(u.xp || 0) : calculateLevel(u.xp || 0)
      })).filter(u => u.id && u.xp > 0);

      const isGlobal = ['topglobal'].includes(commandName.toLowerCase());

      // ===============================
      // 🏆 TOP GRUPO REAL
      // ===============================
      if (!isGlobal) {
        // 🔥 CORRECCIÓN APLICADA AQUÍ TAMBIÉN
        if (!remoteJid.endsWith('@g.us')) {
          return reply('❌ El comando *.topxp* solo funciona en grupos. Para ver el global usa *.topglobal*');
        }

        const metadata = await sock.groupMetadata(remoteJid);
        const participants = metadata.participants.map(p => cleanJid(p.id));

        // Filtramos para que solo aparezcan los que están en el grupo ACTUALMENTE
        const groupUsers = list.filter(u => participants.includes(u.id));

        if (!groupUsers.length) {
          return reply('❌ Nadie en este grupo tiene XP aún. ¡Empiecen a chatear o usar la ruleta!');
        }

        const top = groupUsers.sort((a, b) => b.xp - a.xp).slice(0, 10);
        
        let text = `🏆 *TOP 10 XP DEL GRUPO* 🏆\n\n`;
        let mentions = [];

        top.forEach((u, i) => {
          mentions.push(u.id);
          const medal = ['🥇', '🥈', '🥉'][i] || `*${i + 1}.*`;
          text += `${medal} @${u.id.split('@')[0]}\n⭐ *Nivel:* ${u.level} | ⚡ *XP:* ${u.xp}\n\n`;
        });

        return sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
      }

      // ===============================
      // 🌍 TOP GLOBAL REAL
      // ===============================
      if (isGlobal) {
        if (!list.length) return reply('❌ Nadie tiene XP en la base de datos global aún.');

        const top = list.sort((a, b) => b.xp - a.xp).slice(0, 10);
        
        let text = `🌍 *TOP 10 GLOBAL XP* 🌍\n_Los más viciosos de SiriusBot_\n\n`;
        let mentions = [];

        top.forEach((u, i) => {
          mentions.push(u.id);
          const medal = ['🥇', '🥈', '🥉'][i] || `*${i + 1}.*`;
          text += `${medal} @${u.id.split('@')[0]}\n⭐ *Nivel:* ${u.level} | ⚡ *XP:* ${u.xp}\n\n`;
        });

        return sock.sendMessage(remoteJid, { text, mentions }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en plugin top:', err?.message || err);
      return reply('❌ Ocurrió un error interno al generar el ranking.');
    }
  }
};
