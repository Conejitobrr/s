'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const STICKER_PACK_NAME = '𝑺𝒊𝒓𝒊𝒖𝒔𝑩𝒐𝒕';
const STICKER_AUTHOR = '';

function createExif(packName = STICKER_PACK_NAME, author = STICKER_AUTHOR) {
  const json = { 'sticker-pack-id': 'com.siriusbot.sticker', 'sticker-pack-name': packName, 'sticker-pack-publisher': author, emojis: ['🤖'] };
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exifHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  exifHeader.writeUIntLE(jsonBuffer.length, 14, 4);
  return Buffer.concat([exifHeader, jsonBuffer]);
}

module.exports = {
  name: 'attp',
  aliases: ['ttp', 'texto', 'letras'],
  category: 'multimedia',
  desc: 'Crea un sticker de texto estilizado de forma directa',

  execute: async ({ sock, msg, remoteJid, args, quoted, reply }) => {
    let img = null, webp = null, exif = null, finalOutput = null;

    try {
      const text = (args.join(' ').trim() || quoted?.text || '').trim();
      if (!text) {
        return reply('❌ Escribe el texto que quieres convertir a sticker.\n\n📌 Ejemplo: *.attp Hola mundo*');
      }

      const length = text.length;
      let fontSize = 50;
      if (length <= 3) fontSize = 260;
      else if (length <= 5) fontSize = 230;
      else if (length <= 8) fontSize = 200;
      else if (length <= 12) fontSize = 170;
      else if (length <= 18) fontSize = 140;
      else if (length <= 30) fontSize = 110;
      else if (length <= 50) fontSize = 85;
      else if (length <= 80) fontSize = 65;

      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      img = path.join(TEMP_DIR, `attp_img_${id}.png`);
      webp = path.join(TEMP_DIR, `attp_raw_${id}.webp`);
      exif = path.join(TEMP_DIR, `attp_exif_${id}.exif`);
      finalOutput = path.join(TEMP_DIR, `attp_final_${id}.webp`);

      const imArgs = [
        '-background', 'none',
        '-fill', 'white',
        '-stroke', 'black',
        '-strokewidth', '6',
        '-font', 'DejaVu-Sans-Bold',
        '-size', '1200x1200',
        '-gravity', 'center',
        '-pointsize', fontSize.toString(),
        '-interline-spacing', '8',
        `caption:${text}`,
        '-trim', '+repage',
        '-resize', '100%x118%!',
        '-resize', '450x450>',
        '-gravity', 'center',
        '-background', 'none',
        '-extent', '512x512',
        img
      ];

      try {
        await execFileAsync('convert', imArgs);
      } catch {
        return reply('❌ *Falta ImageMagick en Termux*\n\n👉 Ejecuta en Termux:\n`pkg install imagemagick libwebp -y`');
      }

      await execFileAsync('ffmpeg', [
        '-y', '-i', img,
        '-c:v', 'libwebp',
        '-vf', 'scale=512:512:flags=lanczos,format=rgba',
        '-q:v', '90',
        '-compression_level', '6',
        '-preset', 'picture',
        '-loop', '0',
        webp
      ]);

      let stickerToSend = webp;
      try {
        fs.writeFileSync(exif, createExif());
        await execFileAsync('webpmux', ['-set', 'exif', exif, webp, '-o', finalOutput]);
        if (fs.existsSync(finalOutput)) stickerToSend = finalOutput;
      } catch {}

      await sock.sendMessage(remoteJid, { sticker: fs.readFileSync(stickerToSend) }, { quoted: msg });

    } catch (err) {
      console.log('❌ Error en plugin attp:', err?.message || err);
      return reply('❌ Ocurrió un error al crear el sticker.');
    } finally {
      [img, webp, exif, finalOutput].forEach(file => {
        try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
      });
    }
  }
};
