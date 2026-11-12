'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const STICKER_PACK_NAME = '𝑺𝒊𝒓𝒊𝒖𝒔𝑩𝒐𝒕';
const STICKER_AUTHOR = ''; // Dejado en blanco intencionalmente

function getQuotedMessage(msg) {
  const context = msg.message?.extendedTextMessage?.contextInfo ||
                  msg.message?.imageMessage?.contextInfo ||
                  msg.message?.videoMessage?.contextInfo ||
                  msg.message?.documentMessage?.contextInfo;
  return context?.quotedMessage || null;
}

function getMediaInfo(message) {
  if (!message) return null;
  const type = Object.keys(message).find(k => ['imageMessage', 'videoMessage', 'documentMessage'].includes(k));
  if (!type) return null;

  const media = message[type];
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

module.exports = {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  category: 'multimedia',
  desc: 'Convierte imagen o video a sticker (Uso Ilimitado y Directo)',

  execute: async ({ sock, msg, remoteJid, reply }) => {
    let input = null, output = null, exif = null, finalOutput = null;

    try {
      const message = getQuotedMessage(msg) || msg.message;
      const info = getMediaInfo(message);

      if (!info || (!info.media.url && !info.media.mediaKey)) {
        return reply('❌ Envía o responde a una imagen/video (máx 5 seg) para crear un sticker.');
      }

      const buffer = await downloadMedia(info.media, info.downloadType);
      
      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      const ext = info.isImage ? 'jpg' : 'mp4';
      
      input = path.join(TEMP_DIR, `stk_in_${id}.${ext}`);
      output = path.join(TEMP_DIR, `stk_out_${id}.webp`);
      exif = path.join(TEMP_DIR, `stk_exif_${id}.exif`);
      finalOutput = path.join(TEMP_DIR, `stk_final_${id}.webp`);

      fs.writeFileSync(input, buffer);

      const args = info.isImage
        ? ['-y', '-i', input, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-vcodec', 'libwebp', '-q:v', '60', '-preset', 'picture', '-loop', '0', output]
        : ['-y', '-i', input, '-t', '5', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,fps=10,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-vcodec', 'libwebp', '-fs', '700k', '-loop', '0', '-an', output];

      await execFileAsync('ffmpeg', args);
      fs.writeFileSync(exif, createExif());
      await execFileAsync('webpmux', ['-set', 'exif', exif, output, '-o', finalOutput]);

      // Envía el sticker de golpe sin avisos previos
      await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(finalOutput) }, { quoted: msg });

    } catch (err) {
      console.log('❌ Error en sticker:', err?.message || err);
      await reply('❌ Error al crear sticker. Verifica el peso del video.');
    } finally {
      [input, output, exif, finalOutput].forEach(file => {
        try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
      });
    }
  }
};
