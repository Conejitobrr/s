'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { unwrapMessage, getContextInfo } = require('../lib/utils');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function safeText(text = '') {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

function safeFileName(text = '') {
  return String(text || 'Galaxia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 35) || 'Galaxia';
}

function parseInput(args = [], pushName = '') {
  const raw = args.join(' ').replace(/@\d+/g, '').trim();
  if (!raw) return null;

  const parts = raw.split('|').map(v => v.trim());

  return {
    nombre: safeText(parts[0] || 'Mi Amor'),
    autor: safeText(parts[1] || pushName || 'Alguien que te ama'),
    frase: safeText(parts[2] || 'En un universo de millones de estrellas, tú eres mi favorita ✨'),
    apodo: safeText(parts[3] || '💛 Mi Persona Favorita 💛'),
    cancionQuery: (parts[4] || '').trim()
  };
}

// 🎵 Busca canciones desde WhatsApp para pre-cargarlas en la página 3D
async function searchSongFromWhatsApp(query = '') {
  if (!query) return null;
  if (/^https?:\/\//i.test(query)) {
    return {
      title: 'Canción Dedicada 💖',
      artist: 'Audio Especial',
      url: query,
      cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&q=80'
    };
  }
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`);
    const json = await res.json();
    const item = json?.results?.[0];
    if (!item || !item.previewUrl) return null;
    return {
      title: item.trackName || query,
      artist: item.artistName || 'Artista',
      url: item.previewUrl,
      cover: String(item.artworkUrl100 || '').replace('100x100bb', '400x400bb')
    };
  } catch {
    return null;
  }
}

// 🎙️ Si el usuario responde a un audio/video/foto en WhatsApp, lo incrusta en el HTML
async function extractQuotedCustomAssets(msg, quoted) {
  const result = { audioDataUri: null, imageDataUri: null };
  const ctx = getContextInfo(msg);
  const qMsg = unwrapMessage(quoted?.message || ctx?.quotedMessage || {});
  if (!qMsg || Object.keys(qMsg).length === 0) return result;

  try {
    // 1. Si citó una imagen, la convertimos a Base64 para la carta romántica
    if (qMsg.imageMessage) {
      const stream = await downloadContentFromMessage(qMsg.imageMessage, 'image');
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      const buf = Buffer.concat(chunks);
      if (buf.length > 0 && buf.length < 8 * 1024 * 1024) {
        result.imageDataUri = `data:${qMsg.imageMessage.mimetype || 'image/jpeg'};base64,${buf.toString('base64')}`;
      }
    }

    // 2. Si citó un audio, nota de voz o video, lo comprimimos a MP3 ligero y lo incrustamos
    const mediaMsg = qMsg.audioMessage || qMsg.videoMessage || qMsg.documentMessage;
    const mediaType = qMsg.audioMessage ? 'audio' : (qMsg.videoMessage ? 'video' : (qMsg.documentMessage ? 'document' : null));

    if (mediaMsg && mediaType) {
      ensureTemp();
      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;
      const rawIn = path.join(TEMP_DIR, `gal_in_${id}.tmp`);
      const mp3Out = path.join(TEMP_DIR, `gal_out_${id}.mp3`);

      const stream = await downloadContentFromMessage(mediaMsg, mediaType);
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      fs.writeFileSync(rawIn, Buffer.concat(chunks));

      // Comprimimos a 64k (máx 90 seg) para que el HTML no pese demasiado y abra rápido en cualquier celular
      await execFileAsync('ffmpeg', [
        '-y', '-i', rawIn,
        '-vn', '-t', '90',
        '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '44100', '-ac', '1',
        mp3Out
      ], { timeout: 45000 });

      if (fs.existsSync(mp3Out)) {
        const mp3Buf = fs.readFileSync(mp3Out);
        result.audioDataUri = `data:audio/mpeg;base64,${mp3Buf.toString('base64')}`;
      }

      try { if (fs.existsSync(rawIn)) fs.unlinkSync(rawIn); } catch {}
      try { if (fs.existsSync(mp3Out)) fs.unlinkSync(mp3Out); } catch {}
    }
  } catch (e) {
    console.log('⚠️ Aviso procesando multimedia para galaxia:', e?.message);
  }

  return result;
}

function buildHtml({ nombre, autor, frase, apodo, customTrack, customPhoto }) {
  const initialTrackJson = JSON.stringify(customTrack || null);
  const customPhotoHtml = customPhoto
    ? `<img src="${customPhoto}" alt="Foto especial" class="letter-photo" />`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Universo de ${nombre} ✨</title>

  <link href="https://fonts.googleapis.com/css2?family=Pacifico&family=Quicksand:wght@400;600;700&display=swap" rel="stylesheet">

  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
      }
    }
  </script>

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }

    html, body {
      overflow: hidden;
      height: 100%;
      width: 100%;
      background: #020108;
      font-family: 'Quicksand', sans-serif;
      color: #fff;
    }

    .webgl {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      outline: none;
      z-index: 1;
    }

    /* ✨ PANTALLA DE BIENVENIDA INTERACTIVA */
    .welcome-screen {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle at center, #1f0733 0%, #03010a 100%);
      z-index: 100;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 25px;
      text-align: center;
      transition: opacity 1s ease, visibility 1s ease;
    }

    .welcome-screen.hidden {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }

    .welcome-card {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 105, 180, 0.4);
      backdrop-filter: blur(18px);
      padding: 36px 28px;
      border-radius: 30px;
      max-width: 410px;
      width: 100%;
      box-shadow: 0 0 50px rgba(255, 20, 147, 0.3);
      animation: floatCard 4s ease-in-out infinite;
    }

    @keyframes floatCard {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    .welcome-icon {
      font-size: 54px;
      margin-bottom: 12px;
      display: inline-block;
      animation: pulseHeart 1.3s infinite;
    }

    @keyframes pulseHeart {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.18); }
    }

    .welcome-title {
      font-family: 'Pacifico', cursive;
      color: #fff;
      font-size: 32px;
      margin-bottom: 10px;
      text-shadow: 0 0 14px #ff2a85;
    }

    .welcome-sub {
      color: rgba(255, 255, 255, 0.88);
      font-size: 15px;
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .start-btn {
      background: linear-gradient(135deg, #ff1e74, #ff7b00);
      color: white;
      border: none;
      padding: 14px 32px;
      font-size: 16px;
      font-weight: 700;
      border-radius: 50px;
      cursor: pointer;
      box-shadow: 0 0 24px rgba(255, 30, 116, 0.65);
      transition: transform 0.2s, box-shadow 0.2s;
      font-family: 'Quicksand', sans-serif;
    }

    .start-btn:active { transform: scale(0.95); }

    /* 🌸 EMOJIS FLOTANTES */
    .heart {
      position: absolute;
      font-size: 22px;
      animation: floatEmoji 14s infinite ease-in-out;
      z-index: 2;
      pointer-events: none;
      opacity: 0.25;
    }

    @keyframes floatEmoji {
      0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.2; }
      50% { transform: translateY(-30px) rotate(12deg); opacity: 0.55; }
    }

    /* 💬 BARRA SUPERIOR Y MINI REPRODUCTOR */
    .top-banner {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      background: rgba(15, 10, 30, 0.65);
      border: 1px solid rgba(255, 105, 180, 0.35);
      padding: 9px 20px;
      border-radius: 30px;
      backdrop-filter: blur(10px);
      z-index: 10;
      max-width: 78%;
      box-shadow: 0 4px 20px rgba(0,0,0,0.45);
      pointer-events: none;
    }

    .now-playing-pill {
      position: fixed;
      top: 66px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(255, 30, 116, 0.2);
      border: 1px solid rgba(255, 105, 180, 0.4);
      padding: 5px 14px;
      border-radius: 20px;
      font-size: 12px;
      color: #ffd6e7;
      z-index: 10;
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 85%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
    }

    .eq-bars {
      display: inline-flex;
      align-items: flex-end;
      gap: 2px;
      height: 12px;
    }

    .eq-bars span {
      width: 3px;
      background: #ff69b4;
      border-radius: 2px;
      animation: eqBounce 0.8s infinite ease-in-out;
    }
    .eq-bars span:nth-child(2) { animation-delay: 0.2s; }
    .eq-bars span:nth-child(3) { animation-delay: 0.4s; }
    .eq-bars.paused span { animation: none; height: 3px !important; }

    @keyframes eqBounce {
      0%, 100% { height: 3px; }
      50% { height: 12px; }
    }

    .credits {
      position: fixed;
      bottom: 84px;
      left: 50%;
      transform: translateX(-50%);
      color: #fff;
      font-family: 'Pacifico', cursive;
      font-size: 22px;
      text-align: center;
      text-shadow: 0 0 6px #fff, 0 0 14px #ff1e74, 0 0 24px #ff1e74;
      z-index: 10;
      pointer-events: none;
      width: 92%;
    }

    /* 🎛️ BOTONES INFERIORES */
    .bottom-controls {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      z-index: 20;
      flex-wrap: nowrap;
    }

    .action-btn {
      background: rgba(20, 15, 35, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.28);
      color: white;
      padding: 10px 15px;
      border-radius: 25px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.25s;
      font-family: 'Quicksand', sans-serif;
      white-space: nowrap;
    }

    .action-btn:hover, .action-btn.active {
      background: rgba(255, 30, 116, 0.5);
      border-color: #ff69b4;
      box-shadow: 0 0 16px rgba(255, 30, 116, 0.45);
    }

    /* 💌 MODAL DE CARTA ROMÁNTICA Y REPRODUCTOR */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(10px);
      z-index: 60;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 18px;
      opacity: 0;
      visibility: hidden;
      transition: all 0.35s ease;
    }

    .modal-backdrop.open {
      opacity: 1;
      visibility: visible;
    }

    .modal-box {
      background: linear-gradient(145deg, rgba(35, 14, 52, 0.96), rgba(12, 6, 22, 0.98));
      border: 1px solid rgba(255, 105, 180, 0.5);
      border-radius: 26px;
      padding: 26px 22px;
      max-width: 430px;
      width: 100%;
      max-height: 86vh;
      overflow-y: auto;
      text-align: center;
      color: white;
      box-shadow: 0 0 40px rgba(255, 30, 116, 0.4);
      position: relative;
    }

    .modal-box h2 {
      font-family: 'Pacifico', cursive;
      color: #ff69b4;
      font-size: 27px;
      margin-bottom: 12px;
    }

    .letter-photo {
      width: 130px;
      height: 130px;
      object-fit: cover;
      border-radius: 50%;
      border: 3px solid #ff69b4;
      box-shadow: 0 0 20px rgba(255, 105, 180, 0.6);
      margin: 8px auto 14px auto;
      display: block;
    }

    .modal-box p {
      font-size: 15.5px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.93);
      margin-bottom: 16px;
    }

    .letter-sign {
      font-family: 'Pacifico', cursive;
      font-size: 21px;
      color: #ffd700;
    }

    /* 🎧 ESTILOS DEL BUSCADOR Y REPRODUCTOR DE CANCIONES */
    .music-search-row {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }

    .music-input {
      flex: 1;
      background: rgba(255, 255, 255, 0.09);
      border: 1px solid rgba(255, 105, 180, 0.4);
      color: #fff;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 13.5px;
      font-family: 'Quicksand', sans-serif;
      outline: none;
      user-select: text;
      -webkit-user-select: text;
    }

    .music-input::placeholder { color: rgba(255, 255, 255, 0.5); }

    .mini-btn {
      background: linear-gradient(135deg, #ff1e74, #ff7b00);
      border: none;
      color: white;
      padding: 10px 15px;
      border-radius: 18px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'Quicksand', sans-serif;
      font-size: 13px;
    }

    .upload-label {
      display: inline-block;
      width: 100%;
      background: rgba(255, 255, 255, 0.08);
      border: 1px dashed rgba(255, 105, 180, 0.55);
      color: #ffd6e7;
      padding: 10px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 14px;
      transition: background 0.2s;
    }

    .upload-label:hover { background: rgba(255, 30, 116, 0.25); }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 230px;
      overflow-y: auto;
      text-align: left;
      margin-bottom: 16px;
      padding-right: 4px;
    }

    .track-item {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 8px 10px;
      border-radius: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .track-item:hover, .track-item.active {
      background: rgba(255, 30, 116, 0.35);
      border-color: #ff69b4;
    }

    .track-cover {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      object-fit: cover;
      background: #2b103b;
      flex-shrink: 0;
    }

    .track-info {
      flex: 1;
      overflow: hidden;
    }

    .track-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-artist {
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ⚙️ BOTÓN Y PANEL DE CONFIGURACIÓN */
    .menu-button {
      position: fixed;
      top: 15px;
      left: 15px;
      width: 42px;
      height: 42px;
      background: rgba(20, 15, 35, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      z-index: 25;
      backdrop-filter: blur(6px);
    }

    .menu-button span {
      display: block;
      width: 20px;
      height: 2px;
      background: white;
      margin: 2px 0;
      border-radius: 2px;
    }

    .config-panel {
      position: fixed;
      top: 0;
      left: -320px;
      width: 300px;
      height: 100%;
      background: rgba(12, 8, 22, 0.95);
      backdrop-filter: blur(12px);
      z-index: 30;
      padding: 20px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      transition: left 0.3s ease;
      border-right: 1px solid rgba(255, 30, 116, 0.35);
    }

    .config-panel.open { left: 0; }

    .config-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }

    .config-title {
      color: white;
      font-family: 'Pacifico', cursive;
      font-size: 24px;
    }

    .close-button {
      background: none;
      border: none;
      color: white;
      font-size: 22px;
      cursor: pointer;
    }

    .config-section {
      margin-bottom: 18px;
      padding: 14px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 15px;
    }

    .config-section h3 {
      color: #ff69b4;
      margin-bottom: 12px;
      font-family: 'Pacifico', cursive;
      font-size: 19px;
    }

    .config-option { margin-bottom: 12px; }
    .config-option label {
      display: block;
      color: white;
      margin-bottom: 6px;
      font-size: 13px;
    }

    .config-option input[type="range"] {
      width: 100%;
      accent-color: #ff1e74;
    }

    .color-options {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .color-option {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      border: 2px solid transparent;
      transition: transform 0.2s;
    }

    .color-option.active {
      border-color: white;
      transform: scale(1.18);
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 28;
      display: none;
    }

    .overlay.active { display: block; }
  </style>
</head>

<body>
  <!-- ✨ PANTALLA DE BIENVENIDA -->
  <div class="welcome-screen" id="welcomeScreen">
    <div class="welcome-card">
      <div class="welcome-icon">💖</div>
      <div class="welcome-title">Para: ${nombre}</div>
      <p class="welcome-sub">
        <b>${autor}</b> ha creado un universo entero en 3D con música dedicado especialmente para ti.
      </p>
      <button class="start-btn" id="startBtn">✨ Entrar a nuestro Universo ✨</button>
    </div>
  </div>

  <canvas class="webgl"></canvas>

  <div class="top-banner">✨ ${frase} ✨</div>

  <!-- 🎶 PÍLDORA DE CANCIÓN ACTUAL -->
  <div class="now-playing-pill" id="nowPlayingPill" title="Toca para cambiar de canción">
    <div class="eq-bars" id="eqBars"><span></span><span></span><span></span></div>
    <span id="currentSongLabel">🎶 Cargando música...</span>
  </div>

  <div class="credits">Con amor: ${autor}</div>

  <!-- 🎛️ CONTROLES RÁPIDOS INFERIORES -->
  <div class="bottom-controls">
    <button class="action-btn" id="letterBtn">💌 Carta</button>
    <button class="action-btn" id="jukeboxBtn">🎧 Cambiar Canción</button>
    <button class="action-btn active" id="musicBtn">⏸️ Pausa</button>
  </div>

  <!-- 💌 MODAL DE CARTA EMERGENTE -->
  <div class="modal-backdrop" id="letterModal">
    <div class="modal-box">
      <h2>Para ${nombre} 👑</h2>
      ${customPhotoHtml}
      <p id="typewriterText"></p>
      <p style="font-size: 14px; opacity: 0.85;">${apodo}</p>
      <div class="letter-sign">— ${autor} 💖</div>
      <br>
      <button class="start-btn" id="closeLetterBtn" style="padding: 10px 26px; font-size: 14px;">Cerrar 💞</button>
    </div>
  </div>

  <!-- 🎧 MODAL SELECTOR Y BUSCADOR DE CANCIONES -->
  <div class="modal-backdrop" id="jukeboxModal">
    <div class="modal-box">
      <h2>🎶 Música del Universo</h2>
      <p style="font-size: 13px; margin-bottom: 12px; opacity: 0.85;">
        Busca cualquier canción en internet o sube un MP3 de tu celular:
      </p>

      <div class="music-search-row">
        <input type="text" id="songSearchInput" class="music-input" placeholder="Ej: Morat, Coldplay, Bad Bunny..." />
        <button class="mini-btn" id="songSearchBtn">🔍 Buscar</button>
      </div>

      <label class="upload-label">
        📂 Elegir archivo MP3 / Audio de mi celular
        <input type="file" id="localAudioInput" accept="audio/*" style="display: none;" />
      </label>

      <div class="track-list" id="trackList"></div>

      <button class="start-btn" id="closeJukeboxBtn" style="padding: 10px 26px; font-size: 14px;">Listo ✨</button>
    </div>
  </div>

  <div class="menu-button" id="menuButton">
    <span></span>
    <span></span>
    <span></span>
  </div>

  <div class="overlay" id="overlay"></div>

  <div class="config-panel" id="configPanel">
    <div class="config-header">
      <div class="config-title">Ajustes ✨</div>
      <button class="close-button" id="closeButton">✕</button>
    </div>

    <div class="config-section">
      <h3>Galaxia y Corazones</h3>
      <div class="config-option">
        <label for="heartSize">Tamaño Orbital</label>
        <input type="range" id="heartSize" min="0.4" max="1.3" step="0.1" value="0.8">
      </div>
      <div class="config-option">
        <label for="centerHeartSize">Corazón Central</label>
        <input type="range" id="centerHeartSize" min="2.0" max="5.0" step="0.2" value="3.3">
      </div>
      <div class="config-option">
        <label for="heartSpeed">Velocidad de Giro</label>
        <input type="range" id="heartSpeed" min="0" max="1.5" step="0.05" value="0.35">
      </div>
      <div class="config-option">
        <label>Tema de Color</label>
        <div class="color-options">
          <div class="color-option active" style="background: #ff1e74;" data-in="#ff0055" data-out="#ff69b4"></div>
          <div class="color-option" style="background: #FFD700;" data-in="#ff9900" data-out="#ffee55"></div>
          <div class="color-option" style="background: #9d4edd;" data-in="#7b2cbf" data-out="#e0aaff"></div>
          <div class="color-option" style="background: #00b4d8;" data-in="#0077b6" data-out="#90e0ef"></div>
          <div class="color-option" style="background: #ff2a2a;" data-in="#a30000" data-out="#ff5c5c"></div>
          <div class="color-option" style="background: #00f5d4;" data-in="#00bbf9" data-out="#00f5d4"></div>
        </div>
      </div>
    </div>

    <div class="config-section">
      <h3>Estrellas</h3>
      <div class="config-option">
        <label for="starBrightness">Brillo Estelar</label>
        <input type="range" id="starBrightness" min="0.2" max="1.0" step="0.1" value="0.9">
      </div>
    </div>
  </div>

  <audio id="bg-music" loop preload="auto" crossorigin="anonymous"></audio>

  <script type="module">
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";

    const CENTER_NAME = "👑 ${nombre} 👑";
    const SMALL_TEXT = "${apodo}";
    const FULL_QUOTE = "${frase}";
    const CUSTOM_WHATSAPP_TRACK = ${initialTrackJson};

    // 🎵 PLAYLIST BASE + CANCIÓN ENVIADA DESDE WHATSAPP
    const defaultTracks = [
      {
        title: "Golden Hour (Romantic Piano)",
        artist: "Universo Sirius ✨",
        url: "https://raw.githubusercontent.com/Conejitobrr/sbot/main/media/Golden.mp3",
        cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&q=80"
      },
      {
        title: "Melodía Estelar",
        artist: "Noche de Estrellas",
        url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",
        cover: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=200&q=80"
      },
      {
        title: "Piano Bajo la Luna",
        artist: "Amor Eterno",
        url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
        cover: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=200&q=80"
      }
    ];

    let playlist = CUSTOM_WHATSAPP_TRACK ? [CUSTOM_WHATSAPP_TRACK, ...defaultTracks] : [...defaultTracks];
    let currentTrackIndex = 0;

    // Emojis flotantes
    const heartSymbols = ['💖', '✨', '🌹', '💫', '👑', '🌷', '💝'];
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'heart';
      el.textContent = heartSymbols[Math.floor(Math.random() * heartSymbols.length)];
      el.style.left = \`\${Math.random() * 100}%\`;
      el.style.top = \`\${Math.random() * 100}%\`;
      el.style.fontSize = \`\${14 + Math.random() * 18}px\`;
      el.style.animationDelay = \`\${Math.random() * 10}s\`;
      document.body.appendChild(el);
    }

    const canvas = document.querySelector('canvas.webgl');
    const scene = new THREE.Scene();

    const romanticPhrases = [
      "💖 Te amo 💖", "🌹 Mi amor 🌹", "👑 Mi reina 👑", "✨ Eres magia ✨",
      "🌌 Eres mi todo 🌌", "💫 Para siempre 💫", "🌟 Mi vida 🌟", "☀️ Mi cielo ☀️",
      "🌷 Preciosa 🌷", "💝 Amor mío 💝", "👸 Mi princesa 👸", "⭐ Mi estrella ⭐",
      "🌍 Mi mundo 🌍", "💎 Eres única 💎", "😍 Te adoro 😍", "♾️ Por siempre ♾️",
      "💍 Amor de mi vida 💍", "🥰 Mi felicidad 🥰", "🔥 Me encantas 🔥"
    ];

    const parameters = {
      heartCount: 14,
      particlesPerHeart: 950,
      heartSize: 0.8,
      heartSizeVariation: 0.18,
      insideColor: '#ff0055',
      outsideColor: '#ff69b4',
      centerHeartSize: 3.3,
      centerHeartParticles: 3200,
      nucleusParticles: 950,
      autoRotateSpeed: 0.35,
      starOpacity: 0.9
    };

    let textSprites = [];
    let heartStructures = [];
    let centerHeart = null;
    let nucleusParticles = null;
    let starfield = null;
    let heartTexts = [];

    const createTextSprite = (text) => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      c.width = 360;
      c.height = 90;

      ctx.font = 'Bold 30px Quicksand, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const gradient = ctx.createLinearGradient(0, 0, c.width, 0);
      gradient.addColorStop(0, parameters.insideColor);
      gradient.addColorStop(0.5, '#ffffff');
      gradient.addColorStop(1, parameters.outsideColor);

      ctx.fillStyle = gradient;
      ctx.shadowColor = parameters.outsideColor;
      ctx.shadowBlur = 14;
      ctx.fillText(text, c.width / 2, c.height / 2);

      const texture = new THREE.CanvasTexture(c);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.92
      });

      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.65, 0.16, 1);
      return sprite;
    };

    const createCenterHeartText = () => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      c.width = 768;
      c.height = 180;

      ctx.font = 'Bold 56px Pacifico, cursive';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const gradient = ctx.createLinearGradient(0, 0, c.width, 0);
      gradient.addColorStop(0, '#ffd700');
      gradient.addColorStop(0.5, '#ffffff');
      gradient.addColorStop(1, '#ff69b4');

      ctx.fillStyle = gradient;
      ctx.shadowColor = '#ff1e74';
      ctx.shadowBlur = 24;
      ctx.fillText(CENTER_NAME, c.width / 2, c.height / 2);

      const texture = new THREE.CanvasTexture(c);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const sprite = new THREE.Sprite(material);
      sprite.scale.set(2.4, 0.56, 1);
      return sprite;
    };

    const createHeartText = () => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      c.width = 360;
      c.height = 80;

      ctx.font = 'Bold 24px Pacifico, cursive';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = parameters.insideColor;
      ctx.shadowBlur = 12;
      ctx.fillText(SMALL_TEXT, c.width / 2, c.height / 2);

      const texture = new THREE.CanvasTexture(c);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.8, 0.18, 1);
      return sprite;
    };

    const createHeartGeometry = (size = 1.0, particleCount = 1500) => {
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);

      const colorInside = new THREE.Color(parameters.insideColor);
      const colorOutside = new THREE.Color(parameters.outsideColor);

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const t = Math.random() * Math.PI * 2;

        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        const z = (Math.random() - 0.5) * 3.2;

        positions[i3] = (x * size * 0.04) + (Math.random() - 0.5) * size * 0.08;
        positions[i3 + 1] = (y * size * 0.04) + (Math.random() - 0.5) * size * 0.08;
        positions[i3 + 2] = z * size * 0.08;

        const radius = Math.sqrt(x * x + y * y);
        const mixedColor = colorInside.clone().lerp(colorOutside, Math.min(radius / 18, 1));

        colors[i3] = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    };

    const createStarfield = () => {
      const starCount = 5800;
      const positions = new Float32Array(starCount * 3);
      const colors = new Float32Array(starCount * 3);

      for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        const radius = 35 + Math.random() * 140;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        colors[i3] = 0.85 + Math.random() * 0.15;
        colors[i3 + 1] = 0.85 + Math.random() * 0.15;
        colors[i3 + 2] = 1;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.65,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: parameters.starOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      return new THREE.Points(geometry, material);
    };

    const createNucleusParticles = () => {
      const particleCount = parameters.nucleusParticles;
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);

      const color1 = new THREE.Color(parameters.insideColor);
      const color2 = new THREE.Color('#ffd700');

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const radius = Math.random() * 0.95;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        const mixedColor = color1.clone().lerp(color2, Math.random());
        colors[i3] = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.032,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      return new THREE.Points(geometry, material);
    };

    const generateHearts = () => {
      textSprites.forEach(s => scene.remove(s));
      textSprites = [];

      heartTexts.forEach(t => scene.remove(t));
      heartTexts = [];

      heartStructures.forEach(h => {
        h.geometry.dispose();
        h.material.dispose();
        scene.remove(h);
      });
      heartStructures = [];

      if (centerHeart) {
        centerHeart.geometry.dispose();
        centerHeart.material.dispose();
        scene.remove(centerHeart);
      }

      if (nucleusParticles) {
        nucleusParticles.geometry.dispose();
        nucleusParticles.material.dispose();
        scene.remove(nucleusParticles);
      }

      for (let i = 0; i < parameters.heartCount; i++) {
        const heartSize = parameters.heartSize + Math.random() * parameters.heartSizeVariation;
        const heartGeometry = createHeartGeometry(heartSize, parameters.particlesPerHeart);

        const heartMaterial = new THREE.PointsMaterial({
          size: 0.026,
          sizeAttenuation: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexColors: true,
          transparent: true,
          opacity: 0.95
        });

        const heart = new THREE.Points(heartGeometry, heartMaterial);
        const radius = 3.9;
        const angle = (i / parameters.heartCount) * Math.PI * 2;

        heart.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 2) * 0.35,
          Math.sin(angle) * radius
        );

        scene.add(heart);
        heartStructures.push(heart);

        const heartText = createHeartText();
        heartText.position.copy(heart.position);
        scene.add(heartText);
        heartTexts.push(heartText);
      }

      const centerHeartGeometry = createHeartGeometry(parameters.centerHeartSize, parameters.centerHeartParticles);
      const centerHeartMaterial = new THREE.PointsMaterial({
        size: 0.034,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        transparent: true,
        opacity: 0.99
      });

      centerHeart = new THREE.Points(centerHeartGeometry, centerHeartMaterial);
      scene.add(centerHeart);

      nucleusParticles = createNucleusParticles();
      scene.add(nucleusParticles);

      const centerText = createCenterHeartText();
      centerText.position.set(0, 0.25, 0);
      scene.add(centerText);
      textSprites.push(centerText);

      for (let i = 0; i < 130; i++) {
        const phrase = romanticPhrases[i % romanticPhrases.length];
        const radius = 1.8 + Math.random() * 4.5;
        const angle = Math.random() * Math.PI * 2;
        const height = (Math.random() - 0.5) * 3.8;

        const sprite = createTextSprite(phrase);
        sprite.position.set(
          Math.cos(angle) * radius,
          height,
          Math.sin(angle) * radius
        );

        scene.add(sprite);
        textSprites.push(sprite);
      }
    };

    starfield = createStarfield();
    scene.add(starfield);
    generateHearts();

    const sizes = { width: window.innerWidth, height: window.innerHeight };
    const camera = new THREE.PerspectiveCamera(70, sizes.width / sizes.height, 0.1, 200);
    camera.position.set(16, 9, 16); // Empieza lejos para hacer efecto Warp al entrar
    scene.add(camera);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = parameters.autoRotateSpeed;
    controls.enablePan = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 24;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x020108, 1);

    window.addEventListener('resize', () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
    });

    // ==========================================
    // 🎧 SISTEMA DE MÚSICA Y BUSCADOR EN VIVO
    // ==========================================
    const audio = document.getElementById('bg-music');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const startBtn = document.getElementById('startBtn');
    const musicBtn = document.getElementById('musicBtn');
    const jukeboxBtn = document.getElementById('jukeboxBtn');
    const nowPlayingPill = document.getElementById('nowPlayingPill');
    const currentSongLabel = document.getElementById('currentSongLabel');
    const eqBars = document.getElementById('eqBars');
    const jukeboxModal = document.getElementById('jukeboxModal');
    const closeJukeboxBtn = document.getElementById('closeJukeboxBtn');
    const trackListEl = document.getElementById('trackList');
    const songSearchInput = document.getElementById('songSearchInput');
    const songSearchBtn = document.getElementById('songSearchBtn');
    const localAudioInput = document.getElementById('localAudioInput');

    audio.volume = 0.65;

    function updateNowPlayingUI(isPlaying) {
      const track = playlist[currentTrackIndex];
      if (track) {
        currentSongLabel.textContent = \`\${track.title} — \${track.artist}\`;
      }
      if (isPlaying) {
        musicBtn.classList.add('active');
        musicBtn.textContent = '⏸️ Pausa';
        eqBars.classList.remove('paused');
      } else {
        musicBtn.classList.remove('active');
        musicBtn.textContent = '▶️ Play';
        eqBars.classList.add('paused');
      }
    }

    function renderPlaylist() {
      trackListEl.innerHTML = '';
      playlist.forEach((t, idx) => {
        const div = document.createElement('div');
        div.className = 'track-item' + (idx === currentTrackIndex ? ' active' : '');
        div.innerHTML = \`
          <img class="track-cover" src="\${t.cover || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=100&q=80'}" alt="cover" />
          <div class="track-info">
            <div class="track-title">\${t.title}</div>
            <div class="track-artist">\${t.artist}</div>
          </div>
          <span>\${idx === currentTrackIndex ? '🔊' : '▶️'}</span>
        \`;
        div.addEventListener('click', () => {
          loadAndPlayTrack(idx, true);
        });
        trackListEl.appendChild(div);
      });
    }

    function loadAndPlayTrack(index, autoPlay = true) {
      if (!playlist[index]) return;
      currentTrackIndex = index;
      audio.src = playlist[index].url;
      renderPlaylist();
      if (autoPlay) {
        audio.play().then(() => updateNowPlayingUI(true)).catch(() => updateNowPlayingUI(false));
      } else {
        updateNowPlayingUI(false);
      }
    }

    // Inicializar primera canción
    loadAndPlayTrack(0, false);

    // Zoom suave al entrar al Universo
    let introZoomActive = false;
    startBtn.addEventListener('click', () => {
      welcomeScreen.classList.add('hidden');
      introZoomActive = true;
      audio.play().then(() => updateNowPlayingUI(true)).catch(() => updateNowPlayingUI(false));
    });

    musicBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play().then(() => updateNowPlayingUI(true)).catch(() => {});
      } else {
        audio.pause();
        updateNowPlayingUI(false);
      }
    });

    // Abrir selector de canciones desde el botón o desde la píldora superior
    [jukeboxBtn, nowPlayingPill].forEach(btn => {
      btn.addEventListener('click', () => {
        renderPlaylist();
        jukeboxModal.classList.add('open');
      });
    });

    closeJukeboxBtn.addEventListener('click', () => jukeboxModal.classList.remove('open'));

    // 🔍 Buscador de canciones en vivo dentro de la página (iTunes API)
    async function searchSongsOnline() {
      const q = songSearchInput.value.trim();
      if (!q) return;
      songSearchBtn.textContent = '⏳...';
      try {
        const res = await fetch(\`https://itunes.apple.com/search?term=\${encodeURIComponent(q)}&media=music&entity=song&limit=8\`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const found = data.results.filter(r => r.previewUrl).map(r => ({
            title: r.trackName,
            artist: r.artistName,
            url: r.previewUrl,
            cover: (r.artworkUrl100 || '').replace('100x100bb', '200x200bb')
          }));
          if (found.length > 0) {
            playlist = [...found, ...defaultTracks];
            loadAndPlayTrack(0, true);
          }
        }
      } catch (e) {
        alert('No se pudo conectar al buscador musical. Revisa tu conexión a internet.');
      } finally {
        songSearchBtn.textContent = '🔍 Buscar';
      }
    }

    songSearchBtn.addEventListener('click', searchSongsOnline);
    songSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchSongsOnline();
    });

    // 📂 Subir archivo MP3 propio desde el celular
    localAudioInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fileUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\\.[^/.]+$/, '');
      playlist.unshift({
        title: cleanName,
        artist: 'Mi Música Local 📱',
        url: fileUrl,
        cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80'
      });
      loadAndPlayTrack(0, true);
      jukeboxModal.classList.remove('open');
    });

    // 💌 MODAL DE CARTA CON EFECTO MÁQUINA DE ESCRIBIR
    const letterBtn = document.getElementById('letterBtn');
    const letterModal = document.getElementById('letterModal');
    const closeLetterBtn = document.getElementById('closeLetterBtn');
    const typewriterText = document.getElementById('typewriterText');
    let typingTimer = null;

    letterBtn.addEventListener('click', () => {
      letterModal.classList.add('open');
      typewriterText.textContent = '';
      if (typingTimer) clearInterval(typingTimer);
      let i = 0;
      const fullStr = \`"\${FULL_QUOTE}"\`;
      typingTimer = setInterval(() => {
        typewriterText.textContent += fullStr.charAt(i);
        i++;
        if (i >= fullStr.length) clearInterval(typingTimer);
      }, 38);
    });

    closeLetterBtn.addEventListener('click', () => letterModal.classList.remove('open'));

    // ⚙️ PANEL LATERAL
    const menuButton = document.getElementById('menuButton');
    const configPanel = document.getElementById('configPanel');
    const closeButton = document.getElementById('closeButton');
    const overlay = document.getElementById('overlay');

    menuButton.addEventListener('click', () => {
      configPanel.classList.add('open');
      overlay.classList.add('active');
    });

    [closeButton, overlay].forEach(el => {
      el.addEventListener('click', () => {
        configPanel.classList.remove('open');
        overlay.classList.remove('active');
      });
    });

    document.getElementById('heartSize').addEventListener('input', (e) => {
      parameters.heartSize = parseFloat(e.target.value);
      generateHearts();
    });

    document.getElementById('centerHeartSize').addEventListener('input', (e) => {
      parameters.centerHeartSize = parseFloat(e.target.value);
      generateHearts();
    });

    document.getElementById('heartSpeed').addEventListener('input', (e) => {
      parameters.autoRotateSpeed = parseFloat(e.target.value);
      controls.autoRotateSpeed = parameters.autoRotateSpeed;
    });

    document.getElementById('starBrightness').addEventListener('input', (e) => {
      parameters.starOpacity = parseFloat(e.target.value);
      starfield.material.opacity = parameters.starOpacity;
    });

    document.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        parameters.insideColor = option.dataset.in;
        parameters.outsideColor = option.dataset.out;
        generateHearts();
      });
    });

    const clock = new THREE.Clock();

    const tick = () => {
      const elapsedTime = clock.getElapsedTime();

      // Animación inicial de acercamiento (Warp Zoom)
      if (introZoomActive) {
        camera.position.lerp(new THREE.Vector3(8.5, 4.2, 8.5), 0.04);
        if (camera.position.distanceTo(new THREE.Vector3(8.5, 4.2, 8.5)) < 0.25) {
          introZoomActive = false;
        }
      }

      controls.update();

      // 💓 Latido rítmico del corazón central
      if (centerHeart) {
        const beatSpeed = audio.paused ? 2.4 : 4.2;
        const pulse = 1 + Math.sin(elapsedTime * beatSpeed) * 0.075;
        centerHeart.scale.set(pulse, pulse, pulse);
        centerHeart.lookAt(camera.position);
      }

      if (nucleusParticles) {
        nucleusParticles.rotation.y = elapsedTime * 0.45;
      }

      heartStructures.forEach((heart, idx) => {
        heart.lookAt(camera.position);
        if (heartTexts[idx]) {
          heartTexts[idx].position.copy(heart.position);
          heartTexts[idx].lookAt(camera.position);
        }
      });

      renderer.render(scene, camera);
      window.requestAnimationFrame(tick);
    };

    tick();
  </script>
</body>
</html>`;
}

module.exports = {
  name: 'galaxia',
  aliases: ['lovehtml', 'amorhtml', 'universo', 'regalo3d'],
  category: 'roleplay & social',
  desc: 'Crea un universo 3D interactivo con buscador de canciones y música personalizada',

  execute: async ({ sock, msg, remoteJid, args, pushName, mentionedJid, quoted, reply }) => {
    let filePath = null;

    try {
      const data = parseInput(args, pushName);

      if (!data) {
        return reply(
`🌌 *CREADOR DE GALAXIA 3D PRO* 💖

Crea un universo interactivo en 3D con reproductor de música, buscador de canciones en vivo y carta dedicada.

📌 *Formas de uso:*
▪️ *.galaxia [Nombre]*
▪️ *.galaxia [Nombre] | [Tu Nombre] | [Frase] | [Apodo]*
▪️ *.galaxia [Nombre] | [Tu Nombre] | [Frase] | [Apodo] | [Canción]*

🎵 *¿Cómo poner tu propia canción desde WhatsApp?*
1️⃣ Escribe el nombre de la canción al final:
*.galaxia Marjorie | Jose | Te amo | Mi Reina | Morat Aprender a quererte*
2️⃣ O **responde a cualquier Audio / Nota de voz / Video** en WhatsApp con el comando *.galaxia ...* y el bot meterá ese audio dentro de la página 3D.
3️⃣ También puedes **responder a una Foto** para que aparezca dentro de la carta romántica.`
        );
      }

      ensureTemp();
      await sock.sendMessage(remoteJid, { react: { text: '🌌', key: msg.key } }).catch(() => {});

      // 1. Revisar si respondió a un audio/video o foto en WhatsApp
      const quotedAssets = await extractQuotedCustomAssets(msg, quoted);

      // 2. Preparar la canción inicial (Prioridad: Audio citado en WhatsApp > 5to parámetro de canción > Default)
      let customTrack = null;
      if (quotedAssets.audioDataUri) {
        customTrack = {
          title: `Audio de ${data.autor} 💖`,
          artist: 'Dedicado desde WhatsApp',
          url: quotedAssets.audioDataUri,
          cover: quotedAssets.imageDataUri || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&q=80'
        };
      } else if (data.cancionQuery) {
        customTrack = await searchSongFromWhatsApp(data.cancionQuery);
      }

      const fileName = `Universo_Para_${safeFileName(data.nombre)}.html`;
      filePath = path.join(TEMP_DIR, fileName);

      fs.writeFileSync(filePath, buildHtml({
        ...data,
        customTrack,
        customPhoto: quotedAssets.imageDataUri
      }), 'utf8');

      const targetUser = mentionedJid?.[0] || quoted?.sender || null;
      const ctxInfo = getContextInfo(msg);

      let targetQuote = msg;
      if (ctxInfo && ctxInfo.stanzaId && ctxInfo.participant) {
        targetQuote = {
          key: {
            remoteJid: msg.key.remoteJid,
            id: ctxInfo.stanzaId,
            participant: ctxInfo.participant
          },
          message: ctxInfo.quotedMessage || {}
        };
      }

      const mentions = targetUser ? [cleanJid(targetUser)] : [];
      const tagText = targetUser ? `\n🎯 *Dedicado a:* @${cleanNumber(targetUser)}` : '';
      const songText = customTrack ? `\n🎵 *Canción inicial:* ${customTrack.title} (${customTrack.artist})` : '\n🎵 *Música:* Incluye buscador de canciones dentro de la página';

      await sock.sendMessage(remoteJid, {
        document: fs.readFileSync(filePath),
        mimetype: 'text/html',
        fileName,
        caption:
`🌌 *GALAXIA DEL AMOR 3D* 💖

👑 *Para:* ${data.nombre}
✍️ *De:* ${data.autor}${tagText}${songText}
💌 *Mensaje:* _"${data.frase}"_

📲 _Descarga este archivo, ábrelo en tu navegador y toca "🎧 Cambiar Canción" adentro para buscar cualquier música._`,
        mentions
      }, { quoted: targetQuote });

    } catch (err) {
      console.log('❌ Error en galaxia.js:', err?.message || err);
      return reply('❌ Ocurrió un error al construir la galaxia 3D.');
    } finally {
      try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
  }
};
