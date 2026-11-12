'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getContextInfo, unwrapMessage } = require('../lib/utils');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function getMediaInfo(message = {}) {
  if (message.audioMessage) return { type: 'audio', downloadType: 'audio', media: message.audioMessage };
  if (message.videoMessage) return { type: 'video', downloadType: 'video', media: message.videoMessage };
  if (message.documentMessage) {
    const mime = message.documentMessage.mimetype || '';
    if (mime.startsWith('audio/')) return { type: 'audio', downloadType: 'document', media: message.documentMessage };
    if (mime.startsWith('video/')) return { type: 'video', downloadType: 'document', media: message.documentMessage };
  }
  return null;
}

module.exports = {
  name: 'recortar',
  aliases: ['cortar', 'trim', 'cut'],
  category: 'multimedia',
  desc: 'Recorta un audio o video indicando el inicio y fin',

  execute: async ({ sock, msg, remoteJid, args, reply }) => {
    let input = null;
    let output = null;

    try {
      if (!args.length) {
        return reply(`✂️ *RECORTADOR MULTIMEDIA* ✂️\n\nResponde a un *Audio* o *Video* usando:\n*.recortar [inicio] [fin]*\n\n📌 *Ejemplos:*\n.recortar 5 10 _(Del seg 5 al 10)_\n.recortar 0.5 2.5 _(Precisión de milisegundos)_\n.recortar 10 _(Desde el seg 10 hasta el final)_`);
      }

      const startStr = args[0].replace(',', '.');
      const endStr = args[1] ? args[1].replace(',', '.') : null;

      const contextInfo = getContextInfo(msg);
      const quotedMsg = contextInfo?.quotedMessage ? unwrapMessage(contextInfo.quotedMessage) : null;
      if (!quotedMsg) return reply('❌ Debes responder al mensaje del *Audio*, *Nota de Voz* o *Video* que quieres recortar.');

      const info = getMediaInfo(quotedMsg);
      if (!info) return reply('❌ El mensaje que citaste no es compatible. Usa un video o un audio.');

      let targetQuote = msg;
      if (contextInfo && contextInfo.stanzaId && contextInfo.participant) {
        targetQuote = {
          key: {
            remoteJid: msg.key.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
          },
          message: contextInfo.quotedMessage || {}
        };
      }

      ensureTemp();
      const waitMsg = await sock.sendMessage(remoteJid, { text: `✂️ Recortando archivo...` }, { quoted: msg });

      const stream = await downloadContentFromMessage(info.media, info.downloadType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      let outExt = info.type === 'video' ? 'mp4' : 'ogg';
      input = path.join(TEMP_DIR, `cut_in_${id}.${outExt}`);
      output = path.join(TEMP_DIR, `cut_out_${id}.${outExt}`);

      fs.writeFileSync(input, buffer);

      let ffmpegArgs = ['-y', '-ss', startStr];
      if (endStr) ffmpegArgs.push('-to', endStr);
      ffmpegArgs.push('-i', input);

      if (info.type === 'video') {
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac');
      } else {
        ffmpegArgs.push('-vn', '-c:a', 'libopus', '-application', 'voip', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-frame_duration', '20', '-f', 'ogg');
      }
      ffmpegArgs.push(output);

      await execFileAsync('ffmpeg', ffmpegArgs);

      const resultBuffer = fs.readFileSync(output);
      const sendOptions = info.type === 'video'
        ? { video: resultBuffer, mimetype: 'video/mp4', caption: `✂️ *Video recortado*` }
        : { audio: resultBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true };

      await sock.sendMessage(remoteJid, sendOptions, { quoted: targetQuote });
      try { await sock.sendMessage(remoteJid, { delete: waitMsg.key }); } catch {}

    } catch (error) {
      console.log('❌ Error al recortar:', error?.message || error);
      return reply('❌ Ocurrió un error al recortar. Asegúrate de poner bien los números (ej. *.recortar 2 5*).');
    } finally {
      for (const file of [input, output]) {
        try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
      }
    }
  }
};
