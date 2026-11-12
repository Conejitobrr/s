'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const TEMP_DIR = path.join(process.cwd(), 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const acciones = {
  abrazar:    { endpoint: 'hug',      emoji: '🫂', msg: 'le dio un fuerte abrazo a' },
  besar:      { endpoint: 'kiss',     emoji: '💋', msg: 'le dio un tierno beso a' },
  pegar:      { endpoint: 'slap',     emoji: '👊', msg: 'le dio una tremenda bofetada a' },
  matar:      { endpoint: 'shoot',    emoji: '🔫', msg: 'acaba de acribillar a' },
  acariciar:  { endpoint: 'pat',      emoji: '🥰', msg: 'está acariciando tiernamente a' },
  morder:     { endpoint: 'bite',     emoji: '🧛', msg: 'le dio una mordida a' },
  fastidiar:  { endpoint: 'poke',     emoji: '👉', msg: 'está fastidiando a' },
  llorar:     { endpoint: 'cry',      emoji: '😭', msg: 'está llorando a mares con' },
  bailar:     { endpoint: 'dance',    emoji: '🕺', msg: 'se puso a bailar épicamente con' },
  patear:     { endpoint: 'kick',     emoji: '🦵', msg: 'le metió una patada voladora a' },
  lanzar:     { endpoint: 'yeet',     emoji: '🚀', msg: 'mandó a volar por los aires a' },
  acurrucar:  { endpoint: 'cuddle',   emoji: '🛌', msg: 'se está acurrucando cómodamente con' },
  chocala:    { endpoint: 'highfive', emoji: '✋', msg: 'chocó los cinco con' },
  golpear:    { endpoint: 'punch',    emoji: '🥊', msg: 'le dio un tremendo puñetazo a' },
  cosquillas: { endpoint: 'tickle',   emoji: '🤣', msg: 'le está haciendo cosquillas a' }
};

function cleanJid(jid = '') {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

module.exports = {
  name: 'roleplay',
  aliases: Object.keys(acciones),
  category: 'diversión',
  desc: 'Interactúa con los miembros del grupo con stickers animados',

  execute: async ({ sock, msg, remoteJid, sender, args, commandName, mentionedJid, quoted, reply }) => {
    const cmd = commandName.toLowerCase();
    const accion = acciones[cmd];
    if (!accion) return;

    const targetId = mentionedJid?.[0] || quoted?.sender || null;
    let targetName = '';
    const mencionesParaEnviar = [sender];

    if (targetId) {
      targetName = `@${cleanJid(targetId)}`;
      mencionesParaEnviar.push(targetId);
    } else if (args.length > 0) {
      targetName = args.join(' ');
    } else {
      return reply(`❌ Tienes que mencionar o responder a alguien.\n📌 *Ejemplo:* .${cmd} @amigo`);
    }

    if (targetId === sender) {
      return reply(`😅 No puedes usar *.${cmd}* contigo mismo. Toca salir a socializar pe.`);
    }

    const loadMsg = await sock.sendMessage(remoteJid, { text: `${accion.emoji} _Generando sticker animado..._` }, { quoted: msg });

    const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const inputGif = path.join(TEMP_DIR, `in_${id}.gif`);
    const outputWebp = path.join(TEMP_DIR, `out_${id}.webp`);

    try {
      const apiRes = await fetch(`https://nekos.best/api/v2/${accion.endpoint}`);
      const data = await apiRes.json();
      const imageUrl = data?.results?.[0]?.url;
      if (!imageUrl) throw new Error('No se pudo obtener animación');

      const imgRes = await fetch(imageUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      fs.writeFileSync(inputGif, Buffer.from(arrayBuffer));

      await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputGif,
        '-vf', 'scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
        '-vcodec', 'libwebp',
        '-lossless', '0',
        '-qscale', '40',
        '-preset', 'default',
        '-loop', '0',
        '-an',
        '-vsync', '0',
        outputWebp
      ]);

      const textoFinal = `${accion.emoji} | *@${cleanJid(sender)}* ${accion.msg} *${targetName}*`;

      await sock.sendMessage(remoteJid, { delete: loadMsg.key }).catch(() => {});

      const stickerMsg = await sock.sendMessage(remoteJid, {
        sticker: fs.readFileSync(outputWebp)
      }, { quoted: msg });

      await sock.sendMessage(remoteJid, {
        text: textoFinal,
        mentions: [...new Set(mencionesParaEnviar)]
      }, { quoted: stickerMsg });

    } catch (err) {
      console.log(`❌ Error en Roleplay Sticker (${cmd}):`, err.message);
      return reply('❌ Ocurrió un error al generar el sticker. Intenta de nuevo.');
    } finally {
      try { if (fs.existsSync(inputGif)) fs.unlinkSync(inputGif); } catch {}
      try { if (fs.existsSync(outputWebp)) fs.unlinkSync(outputWebp); } catch {}
    }
  }
};
