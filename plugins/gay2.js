'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

module.exports = {
  name: 'gay2',
  aliases: ['filtrogay'],
  category: 'diversión',
  desc: 'Aplica un filtro arcoíris a la foto de perfil y envía un audio',

  execute: async ({ sock, msg, remoteJid, sender, mentionedJid, quoted, reply }) => {
    let outputAudio = null;
    let tempAvatar = null;
    let tempRainbow = null;

    try {
      const target = cleanJid(quoted?.sender || mentionedJid?.[0] || sender);
      const targetNum = cleanNumber(target);

      let avatarUrl;
      try {
        avatarUrl = await sock.profilePictureUrl(target, 'image');
      } catch {
        avatarUrl = 'https://telegra.ph/file/24fa902ead26340f3df2c.png';
      }

      const apiUrl = `https://some-random-api.com/canvas/gay?avatar=${encodeURIComponent(avatarUrl)}`;
      let finalImageBuffer = null;

      // 1. Intentar con la API rápida primero
      try {
        const res = await fetch(apiUrl);
        if (res.ok) {
          finalImageBuffer = Buffer.from(await res.arrayBuffer());
        }
      } catch {}

      // 2. Respaldo local con FFmpeg/ImageMagick si la API externa no responde
      if (!finalImageBuffer) {
        try {
          const id = `${Date.now()}`;
          tempAvatar = path.join(TEMP_DIR, `av_${id}.jpg`);
          tempRainbow = path.join(TEMP_DIR, `gay_${id}.jpg`);

          const avRes = await fetch(avatarUrl);
          fs.writeFileSync(tempAvatar, Buffer.from(await avRes.arrayBuffer()));

          await execFileAsync('convert', [
            tempAvatar,
            '-resize', '512x512!',
            '(',
            '-size', '512x512',
            'gradient:red-violet',
            '-alpha', 'set',
            '-channel', 'A',
            '-evaluate', 'set', '38%',
            ')',
            '-composite',
            tempRainbow
          ]);

          if (fs.existsSync(tempRainbow)) {
            finalImageBuffer = fs.readFileSync(tempRainbow);
          }
        } catch {}
      }

      if (finalImageBuffer) {
        await sock.sendMessage(remoteJid, {
          image: finalImageBuffer,
          caption: `🏳️‍🌈 *MIREN A @${targetNum}* 🏳️‍🌈`,
          mentions: [target]
        }, { quoted: msg });
      } else {
        await sock.sendMessage(remoteJid, {
          image: { url: avatarUrl },
          caption: `🏳️‍🌈 *MIREN A @${targetNum}* 🏳️‍🌈`,
          mentions: [target]
        }, { quoted: msg });
      }

      // 3. Procesar y enviar el audio gay2.mp3 si existe en ./media
      const inputAudio = path.join(process.cwd(), 'media', 'gay2.mp3');
      if (fs.existsSync(inputAudio)) {
        const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
        outputAudio = path.join(TEMP_DIR, `gay2_out_${id}.ogg`);

        await execFileAsync('ffmpeg', [
          '-y', '-i', inputAudio,
          '-vn', '-c:a', 'libopus',
          '-b:a', '48k',
          '-application', 'voip',
          '-ac', '1',
          '-ar', '48000',
          outputAudio
        ]);

        await sock.sendMessage(remoteJid, {
          audio: fs.readFileSync(outputAudio),
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        }, { quoted: msg });
      }

    } catch (err) {
      console.log('❌ Error en plugin gay2:', err?.message || err);
      return reply('❌ Ocurrió un error al procesar el filtro.');
    } finally {
      for (const f of [outputAudio, tempAvatar, tempRainbow]) {
        try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      }
    }
  }
};
