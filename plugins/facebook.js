'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function isFacebookUrl(url = '') {
  return /(facebook\.com|fb\.watch|fb\.gg)/i.test(url);
}

async function downloadFacebook(url, output) {
  await execFileAsync('yt-dlp', [
    '-f', 'mp4/best',
    '--no-playlist',
    '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-o', output,
    url
  ], { timeout: 120000 });
}

async function convertVideo(input, output) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', input,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-movflags', '+faststart',
    output
  ], { timeout: 120000 });
}

module.exports = {
  name: 'facebook',
  aliases: ['fb', 'fbdl'],
  category: 'descargas',
  desc: 'Descarga videos de Facebook a partir de un link',

  execute: async ({ sock, remoteJid, args, sender, msg, quoted, db, reply }) => {
    let rawFile = null;
    let finalFile = null;

    try {
      const url = (args[0] || quoted?.text || '').trim().split(/\s+/)[0];

      if (!url) {
        return reply('❌ Envía o responde a un link de Facebook.\n\n📌 Ejemplo:\n*.fb https://www.facebook.com/...*');
      }

      if (!isFacebookUrl(url)) {
        return reply('❌ Link inválido. Asegúrate de que sea un enlace válido de Facebook.');
      }

      ensureTemp();
      await reply('⏳ Descargando video de Facebook, un momento...');

      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      rawFile = path.join(TEMP_DIR, `fb_raw_${id}.mp4`);
      finalFile = path.join(TEMP_DIR, `fb_final_${id}.mp4`);

      await downloadFacebook(url, rawFile);
      await convertVideo(rawFile, finalFile);

      if (!fs.existsSync(finalFile)) {
        return reply('❌ No se pudo procesar el video. Es posible que sea privado.');
      }

      const sizeMB = fs.statSync(finalFile).size / 1024 / 1024;
      if (sizeMB > 50) {
        return reply(`⚠️ El video pesa demasiado (${sizeMB.toFixed(1)} MB). El límite de envío es de 50 MB.`);
      }

      await sock.sendMessage(remoteJid, {
        video: fs.readFileSync(finalFile),
        mimetype: 'video/mp4',
        caption: '📘 *SIRIUS BOT | Descarga Completa*'
      }, { quoted: msg });

      if (db && typeof db.addXP === 'function') {
        await db.addXP(sender, Math.floor(Math.random() * 15) + 5);
      }
    } catch (err) {
      console.log('❌ Error en plugin facebook:', err?.message || err);
      return reply('❌ Ocurrió un error al descargar el video. Verifica que el enlace sea público y que tengas `yt-dlp` instalado en Termux.');
    } finally {
      for (const file of [rawFile, finalFile]) {
        try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch {}
      }
    }
  }
};
