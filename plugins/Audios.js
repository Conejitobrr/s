'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// 🗄️ RUTAS LOCALES
const MEDIA_DIR = path.join(process.cwd(), 'media');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const VOICE_CACHE_DIR = path.join(TEMP_DIR, 'voice_cache');
const CUSTOM_DB = path.join(process.cwd(), 'lib', 'custom_audios.json');

const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.opus', '.wav', '.m4a', '.aac', '.flac', '.webm', '.mp4', '.mpeg'];

const cooldowns = new Map();
const COOLDOWN_TIME = 8000; // 8 segundos

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
  if (!fs.existsSync(VOICE_CACHE_DIR)) fs.mkdirSync(VOICE_CACHE_DIR, { recursive: true });
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

function resolveAudioFile(file = '') {
  if (!file) return null;
  const directPath = path.resolve(MEDIA_DIR, file);
  if (fs.existsSync(directPath)) return directPath;

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

// ⚡ Convierte una sola vez y guarda en caché para envío instantáneo
async function getOrConvertVoice(inputPath) {
  const stat = fs.statSync(inputPath);
  const cacheName = `${path.basename(inputPath)}_${stat.size}.ogg`;
  const cachedOgg = path.join(VOICE_CACHE_DIR, cacheName);

  if (fs.existsSync(cachedOgg) && fs.statSync(cachedOgg).size > 0) {
    return cachedOgg;
  }

  await execFileAsync('ffmpeg', [
    '-y', '-i', inputPath,
    '-vn', '-map', '0:a:0', '-af', 'aresample=async=1:first_pts=0',
    '-c:a', 'libopus', '-application', 'voip', '-b:a', '48k',
    '-ar', '48000', '-ac', '1', '-frame_duration', '20', '-f', 'ogg',
    cachedOgg
  ], { timeout: 60000 });

  return cachedOgg;
}

// ☁️ SINCRONIZADOR AUTOMÁTICO CON GITHUB DESDE WHATSAPP
async function syncMediaToGitHub(filesToTrack = [], commitMsg = '🎵 Audio actualizado desde WhatsApp') {
  try {
    const token = process.env.GITHUB_TOKEN || '';
    const repo = process.env.GITHUB_REPO || ''; // Ejemplo: Conejitobrr/siriusbot-v3

    // 1. Configurar identidad Git local por si Termux es nuevo
    await execAsync('git config user.name "SiriusBot" && git config user.email "siriusbot@users.noreply.github.com"').catch(() => {});

    // 2. Forzar agregado de archivos (-f ignora bloqueos de .gitignore para media/)
    const quotedFiles = filesToTrack.map(f => `"${f}"`).join(' ');
    await execAsync(`git add -f ${quotedFiles}`);

    // 3. Commit
    await execAsync(`git commit -m "${commitMsg}"`);

    // 4. Push (Usa GITHUB_TOKEN si está en .env, o el origin normal de Termux)
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
  aliases: ['addaudio', 'añadiraudio', 'delaudio', 'borraraudio', 'audios', 'listaaudios', 'subirmedia'],
  category: 'multimedia',
  desc: 'Añade, elimina, sube a GitHub o mira la lista de audios automáticos',

  execute: async ({ sock, msg, remoteJid, args, commandName, isAdmin, isOwner, quoted, reply }) => {
    ensureSetup();

    // 📋 1. VER LISTA DE AUDIOS
    if (commandName === 'audios' || commandName === 'listaaudios' || commandName === 'audios_pasivos') {
      let customAudios = [];
      try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

      let texto = `╔══════════════════════╗\n`;
      texto += `        🎵 *LISTA DE AUDIOS* 🎵\n`;
      texto += `╚══════════════════════╝\n\n`;

      texto += `📌 *Audios Predeterminados:*\n`;
      const baseTriggers = BASE_AUDIOS.map(a => a.triggers[0]).sort();
      texto += `_${baseTriggers.join(' • ')}_\n\n`;

      if (customAudios.length > 0) {
        texto += `💎 *Audios Personalizados:*\n`;
        const customTriggers = customAudios.map(a => a.triggers[0]).sort();
        texto += `_${customTriggers.join(' • ')}_\n`;
      } else {
        texto += `💎 *Audios Personalizados:*\n_Aún no hay audios añadidos._\n`;
      }

      texto += `\n💡 _Escribe cualquiera de estas palabras en el chat y enviaré la nota de voz._`;
      return reply(texto);
    }

    if (!isAdmin && !isOwner) {
      return reply('❌ Solo los Administradores o el Owner del bot pueden modificar los audios.');
    }

    const triggerWord = args.join(' ').trim();
    const triggerLower = triggerWord.toLowerCase();

    // ☁️ 2. SUBIR ARCHIVO DIRECTO A CARPETA MEDIA DE GITHUB (.subirmedia Nombre)
    if (commandName === 'subirmedia') {
      if (!isOwner) return reply('❌ Solo el Owner puede subir archivos base directamente a GitHub.');
      if (!triggerWord) return reply('❌ Escribe el nombre con el que se guardará en la carpeta *media/*.\n\n📌 *Ejemplo:* Responde a un audio y escribe:\n*.subirmedia Telepatía*');

      const qMsg = quoted?.message || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mediaContent = qMsg?.audioMessage || qMsg?.videoMessage || qMsg?.documentMessage;
      const mediaType = qMsg?.audioMessage ? 'audio' : (qMsg?.videoMessage ? 'video' : (qMsg?.documentMessage ? 'document' : null));

      if (!mediaContent || !mediaType) {
        return reply('❌ Responde a un *Audio*, *Video* o *Documento* para subirlo a la carpeta `media/`.');
      }

      await reply('⏳ _Procesando audio y subiendo a la carpeta media/ de GitHub..._');

      const tempInput = path.join(TEMP_DIR, `raw_${Date.now()}`);
      const cleanName = triggerWord.replace(/\.mp3$/i, '').replace(/[\\/:*?"<>|]/g, '');
      const finalFileName = `${cleanName}.mp3`;
      const outputMp3 = path.join(MEDIA_DIR, finalFileName);

      try {
        const stream = await downloadContentFromMessage(mediaContent, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        fs.writeFileSync(tempInput, buffer);

        await execFileAsync('ffmpeg', ['-y', '-i', tempInput, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', outputMp3]);
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);

        const gitRes = await syncMediaToGitHub([`media/${finalFileName}`], `Subido media/${finalFileName} desde WhatsApp`);

        if (gitRes.ok) {
          return reply(`✅ *¡Archivo guardado y subido a GitHub!*\n\n📂 Ruta: \`media/${finalFileName}\`\n☁️ Sincronizado en tu repositorio.`);
        } else {
          return reply(`✅ *Guardado localmente en:* \`media/${finalFileName}\`\n⚠️ *Nota GitHub:* No se pudo hacer push automático (Configura \`GITHUB_TOKEN\` y \`GITHUB_REPO\` en tu \`.env\`).`);
        }
      } catch (e) {
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        return reply(`❌ Error procesando el archivo: ${e.message}`);
      }
    }

    // 🗑️ 3. ELIMINAR AUDIO (.delaudio)
    if (commandName.startsWith('del') || commandName.startsWith('borrar')) {
      if (!triggerLower) return reply('❌ Escribe la palabra clave del audio que quieres eliminar.\n\n📌 *Ejemplo:*\n.delaudio ahhh');

      let customAudios = [];
      try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

      const index = customAudios.findIndex(a => a.triggers.includes(triggerLower));
      if (index === -1) {
        return reply(`❌ No encontré ningún audio personalizado con la palabra "${triggerLower}".`);
      }

      const fileName = customAudios[index].file;
      const fileToDelete = path.join(MEDIA_DIR, fileName);
      try { if (fs.existsSync(fileToDelete)) fs.unlinkSync(fileToDelete); } catch {}

      customAudios.splice(index, 1);
      fs.writeFileSync(CUSTOM_DB, JSON.stringify(customAudios, null, 2));

      syncMediaToGitHub([`media/${fileName}`, 'lib/custom_audios.json'], `Eliminado audio ${triggerLower}`).catch(() => {});

      return reply(`✅ *Audio eliminado con éxito.*\n\nYa no responderé cuando digan "${triggerLower}".`);
    }

    // ➕ 4. AGREGAR AUDIO PERSONALIZADO Y SUBIR A GITHUB (.addaudio)
    if (commandName.startsWith('add') || commandName.startsWith('añadir')) {
      try {
        const qMsg = quoted?.message || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isVideo = qMsg?.videoMessage;
        const isAudio = qMsg?.audioMessage;
        const isDocument = qMsg?.documentMessage;

        if (!isVideo && !isAudio && !isDocument) {
          return reply('❌ Debes responder a un *Video* o *Audio*.\n\n📌 *Ejemplo:* Responde al audio y escribe:\n*.addaudio wazaa*');
        }

        if (!triggerLower) {
          return reply('❌ Escribe la palabra que activará el audio.\n\n📌 *Ejemplo:*\n.addaudio wazaa');
        }

        let customAudios = [];
        try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

        if (customAudios.some(a => a.triggers.includes(triggerLower)) || BASE_AUDIOS.some(a => a.triggers.includes(triggerLower))) {
          return reply(`⚠️ La palabra "${triggerLower}" ya tiene un audio asignado. Usa *.delaudio ${triggerLower}* primero.`);
        }

        await sock.sendPresenceUpdate('composing', remoteJid);

        const id = `${Date.now()}`;
        const inputMedia = path.join(TEMP_DIR, `in_${id}.tmp`);
        const safeName = `custom_${triggerLower.replace(/[^a-z0-9]/gi, '')}_${id}.mp3`;
        const outputMp3 = path.join(MEDIA_DIR, safeName);

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

        customAudios.push({ triggers: [triggerLower], file: safeName });
        fs.writeFileSync(CUSTOM_DB, JSON.stringify(customAudios, null, 2));

        // Pre-cachear en .ogg para que esté listo al instante
        await getOrConvertVoice(outputMp3).catch(() => {});

        // Subir a GitHub en segundo plano
        const gitSync = await syncMediaToGitHub([`media/${safeName}`, 'lib/custom_audios.json'], `Nuevo audio: ${triggerLower}`);

        const githubStatus = gitSync.ok
          ? '☁️ _Respaldado automáticamente en tu GitHub._'
          : '💾 _Guardado en la memoria local de Termux._';

        await sock.sendMessage(remoteJid, {
          text: `✅ *¡Audio registrado con éxito!*\n\n🎙️ Palabra clave: *"${triggerLower}"*\n${githubStatus}`
        }, { quoted: msg });

      } catch (err) {
        console.log('❌ Error en addaudio:', err?.message || err);
        return reply('❌ Ocurrió un error al intentar guardar el nuevo audio.');
      }
    }
  },

  // 2️⃣ ESCUCHA PASIVA ULTRA RÁPIDA
  onMessage: async ({ sock, remoteJid, body, fromGroup, msg, quoted, groupData, userData }) => {
    if (!body || msg.key?.fromMe) return;
    if (body.trim().startsWith('.')) return;

    if (fromGroup && groupData && groupData.audios === false) return;
    if (!fromGroup && userData && userData.audios === false) return;

    ensureSetup();
    const text = normalize(body);

    let customAudios = [];
    try { customAudios = JSON.parse(fs.readFileSync(CUSTOM_DB, 'utf-8')); } catch {}

    const allAudios = [...BASE_AUDIOS, ...customAudios];
    let selected = null;

    for (const audio of allAudios) {
      for (const trigger of audio.triggers) {
        const t = normalize(trigger);
        if (t.includes(' ')) {
          if (text.includes(t)) { selected = audio; break; }
        } else {
          const regex = new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i');
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

    try {
      cooldowns.set(remoteJid, Date.now());
      await sock.sendPresenceUpdate('recording', remoteJid);

      const oggPath = await getOrConvertVoice(input);
      if (!fs.existsSync(oggPath)) return;

      // Si el usuario citó a alguien al decir la palabra clave, le responde al mensaje citado
      let targetQuote = msg;
      if (quoted && quoted.key?.id) {
        targetQuote = {
          key: quoted.key,
          message: quoted.message || {}
        };
      }

      await sock.sendMessage(
        remoteJid,
        { audio: fs.readFileSync(oggPath), mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: targetQuote }
      );
    } catch (err) {
      console.log('❌ Error enviando audio pasivo:', err?.message || err);
    }
  }
};
