'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getContextInfo, unwrapMessage } = require('../lib/utils');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const STICKER_PACK_NAME = '𝑺𝒊𝒓𝒊𝒖𝒔𝑩𝒐𝒕';
const STICKER_AUTHOR = '';

function getMediaInfo(message) {
  if (!message) return null;
  const unwrapped = unwrapMessage(message);
  const type = Object.keys(unwrapped).find(k => ['imageMessage', 'videoMessage', 'documentMessage'].includes(k));
  if (!type) return null;

  const media = unwrapped[type];
  const isImage = type === 'imageMessage' || (type === 'documentMessage' && media.mimetype?.startsWith('image/'));
  const isVideo = type === 'videoMessage' || (type === 'documentMessage' && media.mimetype?.startsWith('video/'));

  if (!isImage && !isVideo) return null;
  return { type, media, isImage, isVideo, downloadType: type === 'documentMessage' ? 'document' : isVideo ? 'video' : 'image' };
}

async function downloadMedia(media, downloadType) {
  const stream = await downloadContentFromMessage(media, downloadType);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

function createExif(packName = STICKER_PACK_NAME, author = STICKER_AUTHOR) {
  const json = { 'sticker-pack-id': 'com.siriusbot.sticker', 'sticker-pack-name': packName, 'sticker-pack-publisher': author, emojis: ['🤖'] };
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exifHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  exifHeader.writeUIntLE(jsonBuffer.length, 14, 4);
  return Buffer.concat([exifHeader, jsonBuffer]);
}

const COLORS = {
  verde:  { hex: '0x00FF00', sim: '0.30', blend: '0.05' },
  azul:   { hex: '0x0000FF', sim: '0.30', blend: '0.05' },
  rojo:   { hex: '0xFF0000', sim: '0.30', blend: '0.05' },
  negro:  { hex: '0x000000', sim: '0.08', blend: '0.04' },
  blanco: { hex: '0xFFFFFF', sim: '0.08', blend: '0.04' }
};

module.exports = {
  name: 'sbg',
  aliases: ['schroma', 'chroma', 'sinfondo'],
  category: 'multimedia',
  desc: 'Crea un sticker borrando el fondo con fuerza y suavizado ajustables',

  execute: async ({ sock, msg, remoteJid, args, reply }) => {
    let input = null, output = null, exif = null, finalOutput = null;
    let loadMsg = null;

    try {
      const colorName = (args[0] || 'verde').toLowerCase();
      const colorCfg = COLORS[colorName];

      if (!colorCfg) {
        return reply(`❌ Color no soportado.\n*Colores:* ${Object.keys(COLORS).join(', ')}\n\n📌 *Ejemplo:* .sbg negro\n⚙️ *Ajuste Pro:* .sbg negro [fuerza] [suavizado]`);
      }

      let sim = colorCfg.sim;
      let blend = colorCfg.blend;

      if (args[1] && !isNaN(args[1])) {
        const intensidad = parseInt(args[1], 10);
        if (intensidad >= 1 && intensidad <= 100) sim = (intensidad / 100).toFixed(2);
      }

      if (args[2] && !isNaN(args[2])) {
        const suavizado = parseInt(args[2], 10);
        if (suavizado >= 0 && suavizado <= 100) blend = (suavizado / 100).toFixed(2);
      }

      const ctxInfo = getContextInfo(msg);
      const targetMessage = ctxInfo?.quotedMessage || msg.message;
      const info = getMediaInfo(targetMessage);

      if (!info || (!info.media.url && !info.media.mediaKey)) {
        return reply('❌ Responde a una imagen o video con un fondo sólido.\n\n📌 *Ejemplo:* .sbg negro');
      }

      const buffer = await downloadMedia(info.media, info.downloadType);
      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      const ext = info.isImage ? 'jpg' : 'mp4';

      input = path.join(TEMP_DIR, `sbg_in_${id}.${ext}`);
      output = path.join(TEMP_DIR, `sbg_out_${id}.webp`);
      exif = path.join(TEMP_DIR, `sbg_exif_${id}.exif`);
      finalOutput = path.join(TEMP_DIR, `sbg_final_${id}.webp`);

      fs.writeFileSync(input, buffer);

      loadMsg = await sock.sendMessage(remoteJid, {
        text: `⏳ Procesando croma *${colorName}* (Fuerza: ${Math.round(sim * 100)}% | Suavizado: ${Math.round(blend * 100)}%)...`
      }, { quoted: msg });

      const chromaFilter = `format=rgba,colorkey=${colorCfg.hex}:${sim}:${blend}`;
      const baseScale = 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';

      const ffmpegArgs = info.isImage
        ? ['-y', '-i', input, '-vf', `${chromaFilter},${baseScale}`, '-vcodec', 'libwebp', '-q:v', '70', '-preset', 'picture', '-loop', '0', output]
        : ['-y', '-i', input, '-t', '5', '-vf', `${chromaFilter},fps=10,${baseScale}`, '-vcodec', 'libwebp', '-fs', '700k', '-loop', '0', '-an', output];

      await execFileAsync('ffmpeg', ffmpegArgs);

      let stickerToSend = output;
      try {
        fs.writeFileSync(exif, createExif());
        await execFileAsync('webpmux', ['-set', 'exif', exif, output, '-o', finalOutput]);
        if (fs.existsSync(finalOutput)) stickerToSend = finalOutput;
      } catch {}

      if (loadMsg) {
        try { await sock.sendMessage(remoteJid, { delete: loadMsg.key }); } catch {}
      }

      await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerToSend) }, { quoted: msg });

    } catch (err) {
      if (loadMsg) {
        try { await sock.sendMessage(remoteJid, { delete: loadMsg.key }); } catch {}
      }
      console.log('❌ Error en sbg:', err?.message || err);
      await reply('❌ Ocurrió un error. Verifica que el archivo sea compatible.');
    } finally {
      [input, output, exif, finalOutput].forEach(file => {
        try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
      });
    }
  }
};
