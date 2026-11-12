'use strict';

module.exports = {
  name: 'darxp',
  aliases: ['dar', 'transferir', 'donar'],
  category: 'economía',
  desc: 'Regala tu XP a otro usuario',

  execute: async ({ sock, msg, remoteJid, sender, args, mentionedJid, quoted, reply, db }) => {
    try {
      if (!db) return reply('❌ Error: Base de datos no disponible.');

      const target = mentionedJid?.[0] || quoted?.sender;
      if (!target) {
        return reply('❌ Tienes que mencionar o responder al mensaje del usuario.\n\n📌 *Ejemplo:*\n.dar @usuario 500');
      }

      if (target === sender) {
        return reply('❌ No te puedes donar XP a ti mismo 🤡.');
      }

      const amount = parseInt(args.find(a => /^\d+$/.test(a)), 10);
      if (!amount || amount <= 0) {
        return reply('❌ Ingresa una cantidad válida.\n\n📌 *Ejemplo:*\n.dar @usuario 500');
      }

      const senderData = await db.getUser(sender);
      const targetData = await db.getUser(target);

      if (!senderData || (senderData.xp || 0) < amount) {
        return reply(`❌ ¡Estás aguja, mano! No tienes *${amount} XP* para regalar 💀.`);
      }

      senderData.xp -= amount;
      targetData.xp = (targetData.xp || 0) + amount;

      await senderData.save();
      await targetData.save();

      const number = target.split('@')[0];
      await sock.sendMessage(remoteJid, {
        text: `💸 *TRANSFERENCIA EXITOSA* 💸\n\nHas transferido *${amount} XP* a @${number}.\n\n_Tu nuevo saldo: ${senderData.xp} XP_ 📉`,
        mentions: [target]
      }, { quoted: msg });
    } catch (error) {
      console.log('❌ Error en comando darxp:', error);
      return reply('❌ Ocurrió un error al intentar hacer la transferencia.');
    }
  }
};
