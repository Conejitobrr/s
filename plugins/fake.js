'use strict';

function cleanJid(jid = '') { return String(jid).split(':')[0]; }

function generateFakeId() {
  return 'BAE5' + Math.floor(Math.random() * 1000000000000000).toString(16).toUpperCase();
}

module.exports = {
  name: 'fake',
  aliases: ['falso'],
  category: 'diversión',
  desc: 'Crea una cita falsa de otro usuario',

  execute: async ({ sock, remoteJid, args, mentionedJid, quoted, reply }) => {
    try {
      const targetRaw = quoted?.sender || mentionedJid?.[0];
      const target = targetRaw ? cleanJid(targetRaw) : null;
      const fullText = args.join(' ');

      if (!target || !fullText.includes('|')) {
        return reply('❌ Uso correcto:\n\n*.fake @usuario texto falso | tu respuesta*\n_(También puedes responder al mensaje de alguien con: .fake texto falso | tu respuesta)_');
      }

      let [fakeText, replyText] = fullText.split('|').map(v => v.trim());

      // Limpia el @usuario del texto falso para que no salga el número escrito adentro
      fakeText = fakeText.replace(/@\d+/g, '').trim();

      if (!fakeText || !replyText) {
        return reply('❌ Formato incorrecto. Asegúrate de poner texto antes y después del separador "|".');
      }

      const fakeQuoted = {
        key: {
          fromMe: false,
          participant: target,
          remoteJid,
          id: generateFakeId()
        },
        message: {
          conversation: fakeText
        }
      };

      await sock.sendMessage(remoteJid, {
        text: replyText,
        mentions: [target]
      }, { quoted: fakeQuoted });

    } catch (e) {
      console.log('❌ ERROR fake:', e?.message || e);
      return reply('❌ Ocurrió un error al generar el mensaje falso.');
    }
  }
};
