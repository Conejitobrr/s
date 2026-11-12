'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getContextInfo } = require('../lib/utils');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// 🗄️ RUTAS LOCALES
const MEDIA_DIR = path.join(process.cwd(), 'media');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const CUSTOM_DB = path.join(process.cwd(), 'lib', 'custom_audios.json');

const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.aac', '.flac', '.webm', '.mp4', '.mpeg'];

const cooldowns = new Map();
const COOLDOWN_TIME = 6000; // 6 segundos anti-spam

// 🎵 AUDIOS BASE
const BASE_AUDIOS = [
  { triggers: ['hola'], file: 'hola' },
  { triggers: ['autoestima'], file: 'Autoestima' },
  { triggers: ['tetas'], file: 'ATetas' },
  { triggers: ['añanin'], file: 'Añañin' },
  { triggers: ['chaoo'], file: 'Chaoo' },
  { triggers: ['coge'], file: 'Coger' },
  { triggers: ['siu', 'siuu', 'siuuu', 'siuuuu'], file: 'siu' },
  { triggers: ['noche de paz'], file: 'Noche' },
  { triggers: ['sexo'], file: 'S3x0g' },
  { triggers: ['mff'], file: 'Mff' },
  { triggers: ['linda'], file: 'Linda' },
  { triggers: ['chamba'], file: 'Chamba' },
  { triggers: ['uwu'], file: 'UwU' },
  { triggers: ['ag'], file: 'Asco' },
  { triggers: ['tu no mete'], file: 'Tu no mete' },
  { triggers: ['telepatia', 'telepatía'], file: 'Telepatía' },
  { triggers: ['un pato'], file: 'pato' },
  { triggers: ['duermete alv', 'duérmete alv'], file: 'Duerme' },
  { triggers: ['bendicion', 'bendición'], file: 'Bendicion' },
  { triggers: ['compartan'], file: 'Compartan' },
  { triggers: ['brr'], file: 'Brr' },
  { triggers: ['llamaba charly'], file: 'Llamaba charly' },
  { triggers: ['mis ojos'], file: 'Mis ojos' },
  { triggers: ['pipipi'], file: 'Pipipi' },
  { triggers: ['epico', 'épico'], file: 'Épico' },
  { triggers: ['me voy'], file: 'Me voy' },
  { triggers: ['una basura'], file: 'Basura' },
  { triggers: ['cancer', 'cáncer'], file: 'Cáncer' },
  { triggers: ['doxean', 'me doxean'], file: 'Me doxean' },
  { triggers: ['no es jueves'], file: 'No es jueves' },
  { triggers: ['jejeje'], file: 'Jejeje' }
];

function ensureSetup() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
  const libDir = path.dirname(CUSTOM_DB);
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  if (!fs.existsSync(CUSTOM_DB)) fs.writeFileSync(CUSTOM_DB, '[]');
}

function normalize(text = '') {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeFileName(name = '') {
  return normalize(name).trim().replace(/\s+/g, ' ');
}

// 🔍 Busca el archivo en ./media sin importar mayúsculas, tildes o extensión
function resolveAudioFile(file = '') {
  if (!file) return null;
  const directPath = path.resolve(MEDIA_DIR, file);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) return directPath;

  const wantedExt = path.extname(file).toLowerCase();
  const wantedBase = normalizeFileName(wantedExt ? path.basename(file, wantedExt) : path.basename(file));

  if (!fs.existsSync(MEDIA_DIR)) return null;
  const files = fs.readdirSync(MEDIA_DIR);

  for (const item of files) {
    const full = path.join(MEDIA_DIR, item);
    try { if (!fs.statSync(full).isFile()) continue; } catch { continue; }
    const ext = path.extname(item).toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext)) continue;
    if (normalizeFileName(path.basename(item, ext)) === wantedBase) return full;
  }
  return null;
}

// 📂 Combina BASE_AUDIOS + custom_audios.json + todos los archivos sueltos en ./media
function getAllAvailableAudios() {
  let customAudios = [];
  try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

  const combined = [...BASE_AUDIOS, ...customAudios];
  const knownTriggers = new Set(combined.flatMap(a => a.triggers.map(t => normalize(t))));

  // Auto-detecta cualquier archivo en ./media que no esté en la lista
  if (fs.existsSync(MEDIA_DIR)) {
    const files = fs.readdirSync(MEDIA_DIR);
    for (const item of files) {
      const ext = path.extname(item).toLowerCase();
      if (!AUDIO_EXTENSIONS.includes(ext)) continue;
      const baseName = path.basename(item, ext).trim();
      const normTrigger = normalize(baseName);
      if (normTrigger && !knownTriggers.has(normTrigger)) {
        combined.push({ triggers: [baseName.toLowerCase()], file: item });
        knownTriggers.add(normTrigger);
      }
    }
  }

  return { combined, customAudios };
}

async function convertToVoice(input, output) {
  await execFileAsync('ffmpeg', [
    '-y', '-i', input,
    '-vn', '-c:a', 'libopus',
    '-b:a', '48k', '-ar', '48000', '-ac', '1',
    '-f', 'ogg', output
  ], { timeout: 45000 });
}

// ☁️ SINCRONIZADOR AUTOMÁTICO CON GITHUB
async function syncMediaToGitHub(filesToTrack = [], commitMsg = '🎵 Audio actualizado desde WhatsApp') {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const repo = process.env.GITHUB_REPO || '';

    await execAsync('git config user.name "SiriusBot" && git config user.email "siriusbot@users.noreply.github.com"').catch(() => {});
    const quotedFiles = filesToTrack.map(f => `"${f}"`).join(' ');
    await execAsync(`git add -f ${quotedFiles}`);
    await execAsync(`git commit -m "${commitMsg}"`);

    if (token && repo) {
      await execAsync(`git push https://${token}@github.com/${repo}.git HEAD:main`);
    } else {
      await execAsync('git push origin main');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

module.exports = {
  name: 'audios_pasivos',
  aliases: ['addaudio', 'añadiraudio', 'delaudio', 'borraraudio', 'audios', 'listaaudios'],
  category: 'multimedia',
  desc: 'Añade, elimina o mira la lista de audios automáticos',

  execute: async ({ sock, msg, remoteJid, args, commandName, isAdmin, isOwner, quoted, reply }) => {
    ensureSetup();

    // 📋 1. VER LISTA DE AUDIOS
    if (commandName === 'audios' || commandName === 'listaaudios' || commandName === 'audios_pasivos') {
      const { customAudios } = getAllAvailableAudios();

      let texto = `╔══════════════════════╗\n`;
      texto += `        🎵 *LISTA DE AUDIOS* 🎵\n`;
      texto += `╚══════════════════════╝\n\n`;

      texto += `📌 *Audios Predeterminados:*\n`;
      const baseTriggers = BASE_AUDIOS.map(a => a.triggers[0]).sort();
      texto += `_${baseTriggers.join(' • ')}_\n\n`;

      if (customAudios.length > 0) {
        texto += `💎 *Audios Añadidos:*\n`;
        const customTriggers = customAudios.map(a => a.triggers[0]).sort();
        texto += `_${customTriggers.join(' • ')}_\n`;
      } else {
        texto += `💎 *Audios Añadidos:*\n_Aún no hay audios personalizados._\n`;
      }

      texto += `\n💡 _Escribe cualquiera de estas palabras en el chat y el bot enviará la nota de voz._`;
      return reply(texto);
    }

    if (!isAdmin && !isOwner) {
      return reply('❌ Solo los Administradores o el Creador del bot pueden añadir o borrar audios.');
    }

    const triggerWord = args.join(' ').trim();
    const triggerLower = triggerWord.toLowerCase();

    // 🗑️ 2. ELIMINAR AUDIO (.delaudio)
    if (commandName.startsWith('del') || commandName.startsWith('borrar')) {
      if (!triggerLower) return reply('❌ Escribe la palabra clave del audio que quieres eliminar.\n\n📌 *Ejemplo:*\n.delaudio nooo');

      let customAudios = [];
      try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

      const index = customAudios.findIndex(a => a.triggers.map(t => t.toLowerCase()).includes(triggerLower));
      const directFile = resolveAudioFile(triggerLower);

      if (index === -1 && !directFile) {
        return reply(`❌ No encontré ningún audio guardado con la palabra "${triggerWord}".`);
      }

      let deletedFileName = `${triggerLower}.mp3`;
      if (index !== -1) {
        deletedFileName = customAudios[index].file;
        const fileToDelete = path.join(MEDIA_DIR, deletedFileName);
        try { if (fs.existsSync(fileToDelete)) fs.unlinkSync(fileToDelete); } catch {}
        customAudios.splice(index, 1);
        fs.writeFileSync(CUSTOM_DB, JSON.stringify(customAudios, null, 2));
      } else if (directFile) {
        deletedFileName = path.basename(directFile);
        try { fs.unlinkSync(directFile); } catch {}
      }

      syncMediaToGitHub([`media/${deletedFileName}`, 'lib/custom_audios.json'], `Eliminado audio: ${triggerLower}`).catch(() => {});

      return reply(`✅ *Audio eliminado con éxito.*\n\nYa no responderé cuando digan "${triggerLower}".`);
    }

    // ➕ 3. AGREGAR AUDIO CON EL NOMBRE EXACTO (.addaudio nooo -> media/nooo.mp3)
    if (commandName.startsWith('add') || commandName.startsWith('añadir')) {
      try {
        const ctxInfo = getContextInfo(msg);
        const qMsg = quoted?.message || ctxInfo?.quotedMessage;
        const isVideo = qMsg?.videoMessage;
        const isAudio = qMsg?.audioMessage;
        const isDocument = qMsg?.documentMessage;

        if (!isVideo && !isAudio && !isDocument) {
          return reply('❌ Debes responder a un *Audio* o *Video*.\n\n📌 *Ejemplo:* Responde al audio y escribe:\n*.addaudio nooo*');
        }

        if (!triggerLower) {
          return reply('❌ Escribe la palabra que activará el audio.\n\n📌 *Ejemplo:*\n.addaudio nooo');
        }

        // Limpia caracteres prohibidos en nombres de archivo, pero conserva el nombre exacto (ej: "nooo.mp3")
        const cleanFileBase = triggerWord.replace(/[\\/:*?"<>|]/g, '').trim();
        if (!cleanFileBase) {
          return reply('❌ El nombre contiene símbolos no válidos.');
        }

        const finalFileName = `${cleanFileBase}.mp3`;
        const outputMp3 = path.join(MEDIA_DIR, finalFileName);

        let customAudios = [];
        try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

        await sock.sendPresenceUpdate('composing', remoteJid);

        const id = `${Date.now()}`;
        const inputMedia = path.join(TEMP_DIR, `in_${id}.tmp`);

        let mediaType = 'video';
        let mediaContent = isVideo;
        if (isAudio) { mediaType = 'audio'; mediaContent = isAudio; }
        if (isDocument) { mediaType = 'document'; mediaContent = isDocument; }

        const stream = await downloadContentFromMessage(mediaContent, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        fs.writeFileSync(inputMedia, buffer);

        await execFileAsync('ffmpeg', [
          '-y', '-i', inputMedia,
          '-vn', '-c:a', 'libmp3lame', '-b:a', '128k',
          outputMp3
        ]);

        if (fs.existsSync(inputMedia)) fs.unlinkSync(inputMedia);

        // Si ya existía en customAudios lo actualiza, si no, lo agrega
        const existingIdx = customAudios.findIndex(a => a.triggers.includes(triggerLower));
        if (existingIdx !== -1) {
          customAudios[existingIdx].file = finalFileName;
        } else {
          customAudios.push({ triggers: [triggerLower], file: finalFileName });
        }
        fs.writeFileSync(CUSTOM_DB, JSON.stringify(customAudios, null, 2));

        // Subir a GitHub con el nombre limpio (ej: media/nooo.mp3)
        const gitSync = await syncMediaToGitHub([`media/${finalFileName}`, 'lib/custom_audios.json'], `Audio agregado: ${finalFileName}`);

        const gitMsg = gitSync.ok
          ? `☁️ Subido a GitHub como: *media/${finalFileName}*`
          : `💾 Guardado en: *media/${finalFileName}*`;

        await sock.sendMessage(remoteJid, {
          text: `✅ *¡Audio registrado con éxito!*\n\n🎙️ Palabra clave: *"${triggerLower}"*\n📂 Archivo: *${finalFileName}*\n${gitMsg}`
        }, { quoted: msg });

      } catch (err) {
        console.log('❌ Error en addaudio:', err?.message || err);
        return reply('❌ Ocurrió un error al intentar guardar el nuevo audio.');
      }
    }
  },

  // 2️⃣ SISTEMA AUTOMÁTICO DE ESCUCHA (Detecta todas las palabras sin fallar)
  onMessage: async ({ sock, remoteJid, body, fromGroup, msg, groupData, userData }) => {
    if (!body) return;
    const rawTrimmed = body.trim();
    if (rawTrimmed.startsWith('.') || rawTrimmed.startsWith('!') || rawTrimmed.startsWith('#') || rawTrimmed.startsWith('/')) return;

    if (fromGroup && groupData && groupData.audios === false) return;
    if (!fromGroup && userData && userData.audios === false) return;

    ensureSetup();
    const text = normalize(rawTrimmed);

    const { combined } = getAllAvailableAudios();
    let selected = null;

    for (const audio of combined) {
      for (const trigger of audio.triggers) {
        const t = normalize(trigger).trim();
        if (!t) continue;

        if (t.includes(' ')) {
          if (text.includes(t)) { selected = audio; break; }
        } else {
          // Detector exacto de palabra aislada (compatible con tildes, signos y emojis alrededor)
          const regex = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(t)}(?:$|[^a-z0-9])`, 'i');
          if (regex.test(text)) { selected = audio; break; }
        }
      }
      if (selected) break;
    }

    if (!selected) return;

    const lastUsed = cooldowns.get(remoteJid) || 0;
    if (Date.now() - lastUsed < COOLDOWN_TIME) return;

    const input = resolveAudioFile(selected.file);
    if (!input || !fs.existsSync(input)) return;

    const output = path.join(TEMP_DIR, `voice_${Date.now()}_${Math.floor(Math.random() * 9999)}.ogg`);

    try {
      cooldowns.set(remoteJid, Date.now());
      await sock.sendPresenceUpdate('recording', remoteJid);

      // Si el usuario citó a alguien al decir la palabra clave, responde al mensaje citado
      let targetQuote = msg;
      const contextInfo = getContextInfo(msg);
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

      try {
        await convertToVoice(input, output);
        if (fs.existsSync(output) && fs.statSync(output).size > 0) {
          await sock.sendMessage(
            remoteJid,
            { audio: fs.readFileSync(output), mimetype: 'audio/ogg; codecs=opus', ptt: true },
            { quoted: targetQuote }
          );
          return;
        }
      } catch {}

      // Respaldo directo en MP3 si FFmpeg opus llegara a fallar
      await sock.sendMessage(
        remoteJid,
        { audio: fs.readFileSync(input), mimetype: 'audio/mpeg', ptt: true },
        { quoted: targetQuote }
      );

    } catch (err) {
      console.log('❌ Error enviando audio pasivo:', err?.message || err);
    } finally {
      try { if (fs.existsSync(output)) fs.unlinkSync(output); } catch {}
    }
  }
};
