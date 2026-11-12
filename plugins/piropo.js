'use strict';

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

const emojis = ['💖', '✨', '💘', '🌹', '😍', '💫', '🥰', '🔥', '🌸', '💌', '😳', '💞', '😘', '🤭', '🤤'];

const piropos = [
  'me gustaría ser papel para poder envolver ese bombón 🍫✨',
  'eres como wifi sin contraseña, todo el mundo te busca 📱💘',
  'quién fuera bus para recorrer las curvas de tu corazón 💓🛣️',
  'quiero volar sin alas y perderme en tu universo 🌌✨',
  'quisiera ser mantequilla para derretirme en tu arepa 🫓🔥',
  'si la belleza fuera pecado, ya estarías en el infierno 😈🔥',
  'robar está mal, pero un beso tuyo sí me lo robaría 💋😳',
  'camina por la sombra que el sol derrite chocolates 🍫☀️',
  'pareces Google, tienes todo lo que busco 💻💖',
  'mi café favorito es el de tus ojos 👀✨',
  'si fueras estrella, el cielo te buscaría para no perderte 🌌💫',
  'no eres WiFi, pero igual me conectas el corazón 💓📶',
  'eres el bug más bonito que me pasó en la vida 💻💘',
  'tu sonrisa debería venir con advertencia de adicción 😍🚨',
  'si el amor tuviera forma, tendría tu nombre ✍️❤️',
  'si la perfección tuviera cara, estaría copiando la tuya 😳✨',
  'eres el tipo de problema que no quiero resolver nunca 💘🌀',
  'tu mirada tiene más magia que todos mis sueños juntos ✨👀',
  'eres el motivo por el que mi corazón se salta actualizaciones 💓📲',
  'si fueras canción, te pondría en loop infinito 🔁🎶',
  'eres como un algoritmo perfecto: imposible de ignorar 💻💖',
  'no sé si eres real o un render del universo en ultra HD 🌌✨',
  'tus ojos deberían venir con mapa porque me pierdo en ellos 👀💫',
  'eres ese “hola” que nunca quiero que termine 🥺💞',
  'si fueras app, nunca la desinstalaría 💖📲',
  'eres el error 404 que sí quiero encontrar 💻❤️',
  'el universo hizo zoom cuando te creó 🌌✨',
  'no eres casualidad, eres destino con buena estética 🎨💘',
  'eres como el sol… pero sin modo oscuro posible 😎🔥',
  'si mirarte fuera deporte, ya tendría medalla de oro 🥇👀',
  'eres el glitch más bonito del sistema 💻💖',
  'si el amor fuera ciencia, tú serías la fórmula prohibida 💘🧪',
  'eres como un lunes bonito… imposible pero real 📅💫',
  'contigo hasta el silencio suena bien 🤍🎧',
  'eres la notificación que nunca quiero silenciar 📱💖',
  'si la vida fuera juego, tú serías el nivel secreto 🕹️✨',
  'eres el brillo que le faltaba a este mundo en baja resolución 💫🖥️',
  'no eres un sueño… pero claramente te soñaron bien 🌙✨',
  'eres el tipo de casualidad que rompe estadísticas 📉💘',
  'si el tiempo se detuviera, lo haría mirándote 👀💓',
  'eres poesía sin necesidad de rimar 📖💖',
  'tienes más encanto que un atardecer inesperado 🌅✨',
  'eres el capítulo favorito que no quiero terminar 💘📖',
  'si el destino tuviera rostro, se parecería al tuyo 💫❤️',
  '¿crees en el amor a primera vista o vuelvo a pasar? 😏💘',
  'no soy donante de órganos, pero con gusto te doy mi corazón 🫀✨',
  'debes estar cansado/a, porque llevas todo el día dando vueltas en mi cabeza 🤕💞',
  'tantos planetas en el universo y tuve la suerte de coincidir en el tuyo 🪐💫',
  'eres la única persona con la que compartiría mi contraseña de Netflix 🍿❤️'
];

module.exports = {
  name: 'piropo',
  aliases: ['piropos', 'ligar', 'coquetear'],
  category: 'diversión',
  desc: 'Envía un piropo aleatorio a otro usuario',

  execute: async ({ sock, msg, remoteJid, sender, args, mentionedJid, quoted, db, reply }) => {
    try {
      let target = quoted?.sender || mentionedJid?.[0] || null;
      if (!target && args[0]) {
        const cleanArgs = args[0].replace(/\D/g, '');
        if (cleanArgs) target = `${cleanArgs}@s.whatsapp.net`;
      }

      if (!target) {
        return reply('❌ Debes mencionar o responder al mensaje de alguien.\n📌 Ejemplo: *.piropo @usuario*');
      }

      target = cleanJid(target);
      const me = cleanJid(sender);

      if (target === me) {
        return reply('😂 ¿Tirándote piropos a ti mismo? Eso es tener mucha autoestima.');
      }

      const botNum = cleanNumber(sock.user?.id || '');
      if (cleanNumber(target) === botNum) {
        return reply('😳 Soy un bot, pero gracias por el halago. Me haces sonrojar los circuitos.');
      }

      const randomPiropo = piropos[Math.floor(Math.random() * piropos.length)];
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const targetNum = cleanNumber(target);

      await sock.sendMessage(remoteJid, {
        text: `${emoji} @${targetNum}, ${randomPiropo}`,
        mentions: [target]
      }, { quoted: msg });

      if (db && typeof db.addXP === 'function') {
        await db.addXP(me, Math.floor(Math.random() * 21) + 10);
      }

    } catch (err) {
      console.log('❌ Error en plugin piropo:', err);
      return reply('❌ Ocurrió un error al intentar enviar el piropo.');
    }
  }
};
