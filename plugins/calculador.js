'use strict';

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function getPercent(max = 500) {
  return Math.floor(Math.random() * (max + 1));
}

function upperText(text = '') {
  return String(text || '').toUpperCase();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function barra(percent = 0) {
  const total = 16;
  const filled = Math.round((percent / 100) * total);
  const empty = Math.max(0, total - filled);
  return `《${'█'.repeat(filled)}${'░'.repeat(empty)}》 ${percent}%`;
}

function loadingText(command, percent) {
  return `${barra(percent)}\n\n_Calculando porcentaje de ${command}..._`;
}

const RESPONSES = {
  gay: target => `_*${upperText(target)}* *ES 🏳️‍🌈* *${getPercent()}%* *GAY, QUE PUTAZOOO*_`,
  lesbiana: target => `_*${upperText(target)}* *ES 🏳️‍🌈* *${getPercent()}%* *DE ENERGÍA ARCOÍRIS, QUE LESBIANA*_`,
  pajero: target => `_*${upperText(target)}* *ES 😏💦* *${getPercent()}%* *PAJERO*_`,
  pajera: target => `_*${upperText(target)}* *ES 😏💦* *${getPercent()}%* *PAJERA*_`,
  puto: target => `_*${upperText(target)}* *ES 🔥* *${getPercent()}%* *PUTO, MÁS INFORMACIÓN A SU PRIVADO 🔥🥵 XD*_`,
  puta: target => `_*${upperText(target)}* *ES 🔥* *${getPercent()}%* *PUTA, MÁS INFORMACIÓN A SU PRIVADO 🔥🥵 XD*_`,
  manco: target => `_*${upperText(target)}* *ES* *${getPercent()}%* *MANCO 💩*_`,
  manca: target => `_*${upperText(target)}* *ES* *${getPercent()}%* *MANCA 💩*_`,
  rata: target => `_*${upperText(target)}* *ES* *${getPercent()}%* *RATA 🐁 COME QUESO 🧀*_`,
  prostituto: target => `_*${upperText(target)}* *ES 🫦* *${getPercent()}%* *🫦👅, QUIEN QUIERE DE SUS SERVICIOS? XD*_`,
  prostituta: target => `_*${upperText(target)}* *ES 🫦* *${getPercent()}%* *🫦👅, QUIEN QUIERE DE SUS SERVICIOS? XD*_`,
  migajero: target => `_*${upperText(target)}* *ES 🍞* *${getPercent()}%* *MIGAJERO, SIEMPRE RECOGIENDO LAS SOBRAS DE OTROS 🚮🤡*_`,
  migajera: target => `_*${upperText(target)}* *ES 🍞* *${getPercent()}%* *MIGAJERA, SIEMPRE RECOGIENDO LAS SOBRAS DE OTROS 🚮🤡*_`
};

module.exports = {
  name: 'gay',
  aliases: [
    'lesbiana', 'pajero', 'pajera', 'puto', 'puta',
    'manco', 'manca', 'rata', 'prostituta', 'prostituto',
    'migajero', 'migajera'
  ],
  category: 'diversión',
  desc: 'Calcula el porcentaje en diferentes categorías',

  execute: async ({ sock, remoteJid, msg, args, commandName, mentionedJid, quoted, reply }) => {
    try {
      const rawJid = quoted?.sender || mentionedJid?.[0];
      let targetInfo = null;

      if (rawJid) {
        const target = cleanJid(rawJid);
        targetInfo = { isMention: true, target, visualText: `@${cleanNumber(target)}` };
      } else if (args.length > 0) {
        targetInfo = { isMention: false, target: null, visualText: args.join(' ').trim() };
      }

      if (!targetInfo) {
        return reply(`❌ Menciona a alguien o escribe su nombre.\n\n📌 Ejemplo:\n.${commandName} @usuario`);
      }

      const cmdKey = RESPONSES[commandName] ? commandName : 'gay';
      const responseFn = RESPONSES[cmdKey];
      const mentionsArr = targetInfo.isMention ? [targetInfo.target] : [];

      const sent = await sock.sendMessage(remoteJid, {
        text: loadingText(cmdKey, 25),
        mentions: mentionsArr
      }, { quoted: msg });

      for (const pct of [50, 75]) {
        await sleep(900);
        await sock.sendMessage(remoteJid, {
          text: loadingText(cmdKey, pct),
          edit: sent.key,
          mentions: mentionsArr
        });
      }

      await sleep(900);
      await sock.sendMessage(remoteJid, {
        text: responseFn(targetInfo.visualText),
        edit: sent.key,
        mentions: mentionsArr
      });

    } catch (err) {
      console.log('❌ Error en calculador:', err?.message || err);
      return reply('❌ Ocurrió un error al ejecutar la animación.');
    }
  }
};
