'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getContextInfo, unwrapMessage } = require('../lib/utils');

const TEMP_DIR = path.join(process.cwd(), 'temp');

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

module.exports = {
  name: 'transcribir',
  aliases: ['leeraudio', 'whisper', 'atxt'],
  category: 'inteligencia artificial',
  desc: 'Convierte notas de voz o audios largos en texto escrito',

  execute: async ({ sock, msg, remoteJid, reply }) => {
    let tempFile = null;
    try {
      const apiKey = (process.env.GROQ_API_KEY || '').trim();
      if (!apiKey) return reply('❌ Falta configurar GROQ_API_KEY en el archivo .env de Termux.');

      const ctx = getContextInfo(msg);
      const quoted = ctx?.quotedMessage ? unwrapMessage(ctx.quotedMessage) : null;
      const unwrappedSelf = unwrapMessage(msg.message);
      const audioMsg = quoted?.audioMessage || unwrappedSelf?.audioMessage;

      if (!audioMsg) {
        return reply('❌ Responde a una *Nota de Voz* o *Audio* con *.transcribir* para pasarla a texto.');
      }

      ensureTemp();
      const waitMsg = await sock.sendMessage(remoteJid, { text: '🦻 Escuchando el audio...' }, { quoted: msg });

      const stream = await downloadContentFromMessage(audioMsg, 'audio');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      tempFile = path.join(TEMP_DIR, `whisper_${Date.now()}.ogg`);
      fs.writeFileSync(tempFile, buffer);

      const formData = new FormData();
      const blob = new Blob([fs.readFileSync(tempFile)], { type: 'audio/ogg' });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'es');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Error en Whisper');

      const texto = (data.text || '').trim();
      if (!texto) {
        return sock.sendMessage(remoteJid, { text: '❌ No se detectó ninguna voz clara en el audio.', edit: waitMsg.key });
      }

      const finalMsg = `📝 *TRANSCRIPCIÓN DE AUDIO:*\n\n"${texto}"`;

      try {
        await sock.sendMessage(remoteJid, { text: finalMsg, edit: waitMsg.key });
      } catch {
        await sock.sendMessage(remoteJid, { text: finalMsg }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en transcribir:', err?.message || err);
      return reply('❌ Ocurrió un error al transcribir el audio.');
    } finally {
      try { if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch {}
    }
  }
};
