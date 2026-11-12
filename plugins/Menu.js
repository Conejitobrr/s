'use strict';

const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

module.exports = {
  name: 'menu',
  aliases: ['ayuda', 'comandos', 'help'],
  category: 'utilidad & búsqueda',
  desc: 'Muestra el menú principal interactivo de SiriusBot',

  execute: async ({ sock, msg, remoteJid, sender, pushName, db, reply }) => {
    const userNum = cleanNumber(sender);
    const userData = await db.getUser(sender);
    const { commands } = require('../handler');
    const totalCmds = commands?.size || 105;

    try {
      const interactiveButtons = [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: '📂 Abrir Menú de Categorías',
            sections: [
              {
                title: '💰 ECONOMÍA & RPG',
                highlight_label: 'Popular',
                rows: [
                  { header: '🎁 Recompensa Diaria', title: 'Reclamar tu XP', description: 'Obtén tu bono diario', id: '.claim' },
                  { header: '🏦 Banco Central', title: 'Ver tu bóveda de XP', description: 'Protege tu dinero de robos', id: '.banco' },
                  { header: '🛒 Tienda Oficial', title: 'Comprar escudos e ítems', description: 'Usa .tienda', id: '.tienda' },
                  { header: '🎒 Tu Mochila', title: 'Ver inventario de objetos', description: 'Usa .inventario', id: '.inventario' }
                ]
              },
              {
                title: '🎮 JUEGOS Y RETOS',
                rows: [
                  { header: '🪢 Juego del Ahorcado', title: 'Adivina palabras y gana XP', description: 'Usa .ahorcado', id: '.ahorcado' },
                  { header: '🪂 Battle Royale', title: 'Juegos del hambre grupal', description: 'Usa .royale', id: '.royale' },
                  { header: '🃏 Blackjack 21', title: 'Apuesta XP contra el bot', description: 'Usa .bj 500', id: '.bj 500' },
                  { header: '🧩 Trivia', title: 'Adivina las preguntas', description: 'Usa .trivia', id: '.trivia' }
                ]
              },
              {
                title: '⚙️ UTILIDAD Y OTROS',
                rows: [
                  { header: '📜 Menú de Texto Completo', title: 'Ver todos los plugins', description: 'Muestra la lista detallada en texto', id: '.menu2' },
                  { header: '🎵 Lista de Audios', title: 'Ver audios automáticos', description: 'Usa .audios', id: '.audios' },
                  { header: '📊 Estado del Bot', title: 'Rendimiento y servidores', description: 'Usa .estado', id: '.estado' }
                ]
              }
            ]
          })
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '🎁 Reclamar', id: '.claim' })
        },
        {
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: '👤 Ver Mi Perfil', id: '.perfil' })
        },
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({ display_text: '📋 Copiar Mi ID', id: 'copy_id', copy_code: userNum })
        }
      ];

      const messageContent = generateWAMessageFromContent(remoteJid, {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              body: proto.Message.InteractiveMessage.Body.create({
                text: `🌌 *SIRIUS BOT PRO* 🌌\n\n👤 Hola *${pushName}* ✨\n📦 Plugins Activos: *${totalCmds}*\n💳 *Tu XP actual:* ${(userData?.xp || 0).toLocaleString()} XP\n\nSelecciona una opción tocando los botones de abajo o abre la lista desplegable:`
              }),
              footer: proto.Message.InteractiveMessage.Footer.create({
                text: '⚡ Sirius Bot Pro • Panel Interactivo'
              }),
              header: proto.Message.InteractiveMessage.Header.create({
                title: '🌌 *MENÚ PRINCIPAL*',
                subtitle: 'SiriusBot',
                hasMediaAttachment: false
              }),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: interactiveButtons
              })
            })
          }
        }
      }, { userJid: sock.user.id, quoted: msg });

      await sock.relayMessage(remoteJid, messageContent.message, {
        messageId: messageContent.key.id,
        additionalNodes: [
          {
            tag: 'biz',
            attrs: {},
            content: [
              {
                tag: 'interactive',
                attrs: { type: 'native_flow', v: '1' },
                content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
              }
            ]
          }
        ]
      });

    } catch (err) {
      console.log('⚠️ Fallback menú texto:', err?.message || err);
      return reply(
        `🌌 *SIRIUS BOT PRO* 🌌\n\n` +
        `👤 Hola *${pushName}*\n` +
        `💳 *Tu XP:* ${(userData?.xp || 0).toLocaleString()} XP\n\n` +
        `🔹 *.perfil* / *.rank*\n` +
        `🔹 *.ahorcado* / *.trivia* / *.royale* / *.bj*\n` +
        `🔹 *.audios* / *.addaudio*\n` +
        `🔹 *.ai* / *.acento* / *.transcribir*\n` +
        `🔹 *.attp* / *.sbg* / *.recortar* / *.volumen*\n` +
        `🔹 *.estado* / *.update*`
      );
    }
  }
};
