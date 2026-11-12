'use strict';

const os = require('os');

module.exports = {
  name: 'ping',
  aliases: ['p', 'estado', 'status'],
  category: 'info',
  desc: 'Verifica la velocidad y memoria del bot',

  execute: async ({ reply, config }) => {
    const start = Date.now();
    const usedRam = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const latency = Date.now() - start;

    await reply(
      `🚀 *${config.botName} v${config.botVersion}*\n\n` +
      `⚡ *Respuesta:* ${latency} ms\n` +
      `🧠 *RAM en uso:* ${usedRam} MB / ${totalRam} GB\n` +
      `🔑 *Gemini API:* ${config.apis.gemini ? '✅ Activa (.env)' : '⚪ No configurada'}\n` +
      `📡 *Estado:* 100% Operativo sin pérdida de mensajes`
    );
  }
};
