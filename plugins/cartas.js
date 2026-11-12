'use strict';

const fs = require('fs');
const path = require('path');

let canvasLib = null;
function getCanvasLib() {
  if (canvasLib) return canvasLib;
  try { canvasLib = require('@napi-rs/canvas'); return canvasLib; } catch {}
  try { canvasLib = require('canvas'); return canvasLib; } catch {}
  return null;
}

const INV_PATH = path.join(process.cwd(), 'lib', 'inventario.json');
const CARTAS_PATH = path.join(process.cwd(), 'lib', 'cartas.json');
if (!fs.existsSync(path.dirname(CARTAS_PATH))) fs.mkdirSync(path.dirname(CARTAS_PATH), { recursive: true });

function getInv() { try { return JSON.parse(fs.readFileSync(INV_PATH, 'utf8')); } catch { return {}; } }
function saveInv(data) { fs.writeFileSync(INV_PATH, JSON.stringify(data, null, 2)); }
function getCartas() { try { return JSON.parse(fs.readFileSync(CARTAS_PATH, 'utf8')); } catch { return {}; } }
function saveCartas(data) { fs.writeFileSync(CARTAS_PATH, JSON.stringify(data, null, 2)); }

global.tradeRequests = global.tradeRequests || {};

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function getPlayerKey(db, targetJid) {
  const targetNum = cleanNumber(targetJid);
  for (const key in db) {
    if (cleanNumber(key) === targetNum) return key;
  }
  return targetJid;
}

const TIPOS = [
  { nombre: 'Fuego', bg: '#E53935', emoji: '🔥' },
  { nombre: 'Agua', bg: '#1E88E5', emoji: '💧' },
  { nombre: 'Planta', bg: '#43A047', emoji: '🌿' },
  { nombre: 'Rayo', bg: '#FDD835', emoji: '⚡' },
  { nombre: 'Oscuro', bg: '#424242', emoji: '🌑' },
  { nombre: 'Psíquico', bg: '#8E24AA', emoji: '👁️' }
];

function generarCarta() {
  const rand = Math.random() * 100;
  const tipo = TIPOS[Math.floor(Math.random() * TIPOS.length)];
  let rareza, atk, hp, valor, isFullArt = false;

  if (rand < 0.5) {
    rareza = 'MÍTICA ex'; hp = Math.floor(Math.random() * 50) + 250; atk = Math.floor(Math.random() * 100) + 200; valor = 50000; isFullArt = true;
  } else if (rand < 4) {
    rareza = 'LEGENDARIA V'; hp = Math.floor(Math.random() * 50) + 180; atk = Math.floor(Math.random() * 50) + 120; valor = 15000; isFullArt = true;
  } else if (rand < 15) {
    rareza = 'ÉPICA'; hp = Math.floor(Math.random() * 40) + 120; atk = Math.floor(Math.random() * 40) + 80; valor = 3500;
  } else if (rand < 40) {
    rareza = 'RARA'; hp = Math.floor(Math.random() * 30) + 80; atk = Math.floor(Math.random() * 30) + 50; valor = 800;
  } else {
    rareza = 'COMÚN'; hp = Math.floor(Math.random() * 20) + 40; atk = Math.floor(Math.random() * 20) + 20; valor = 300;
  }
  return { rareza, tipo, atk, hp, valor, isFullArt };
}

function drawSilverFoil(ctx, x, y, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = 'color-dodge';

  const holo = ctx.createLinearGradient(x, y, x + w, y + h);
  holo.addColorStop(0, 'rgba(255, 150, 150, 0.4)');
  holo.addColorStop(0.3, 'rgba(255, 255, 150, 0.6)');
  holo.addColorStop(0.5, 'rgba(150, 255, 255, 0.7)');
  holo.addColorStop(0.7, 'rgba(200, 150, 255, 0.5)');
  holo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = holo;
  ctx.fillRect(x, y, w, h);

  ctx.globalAlpha = 0.4;
  for (let i = 0; i < w + h; i += 30) {
    ctx.beginPath();
    ctx.moveTo(x + i, y);
    ctx.lineTo(x, y + i);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  ctx.globalAlpha = 0.9;
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 12;
  for (let i = 0; i < 25; i++) {
    const sx = x + Math.random() * w;
    const sy = y + Math.random() * h;
    const size = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
  ctx.restore();
}

async function dibujarCartaPokemon(pfpUrl, renderName, stats) {
  const lib = getCanvasLib();
  if (!lib) return null;

  const { createCanvas, loadImage } = lib;
  const width = 740;
  const height = 1040;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (renderName.length > 15) renderName = renderName.substring(0, 15) + '...';

  let avatar;
  try {
    if (pfpUrl) avatar = await loadImage(pfpUrl);
    else throw new Error('No URL');
  } catch {
    const fallback = createCanvas(400, 400);
    const fbCtx = fallback.getContext('2d');
    fbCtx.fillStyle = '#2b2b2b';
    fbCtx.fillRect(0, 0, 400, 400);
    fbCtx.fillStyle = '#FFFFFF';
    fbCtx.font = 'bold 150px sans-serif';
    fbCtx.textAlign = 'center';
    fbCtx.fillText('?', 200, 250);
    avatar = fallback;
  }

  if (stats.isFullArt) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(avatar, 20, 20, width - 40, height - 40);
    drawSilverFoil(ctx, 20, 20, width - 40, height - 40);

    const topShadow = ctx.createLinearGradient(0, 0, 0, 250);
    topShadow.addColorStop(0, 'rgba(0,0,0,0.85)');
    topShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(20, 20, width - 40, 250);

    const bottomShadow = ctx.createLinearGradient(0, height - 400, 0, height);
    bottomShadow.addColorStop(0, 'rgba(0,0,0,0)');
    bottomShadow.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = bottomShadow;
    ctx.fillRect(20, height - 400, width - 40, 400);

    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'italic 900 65px sans-serif';
    ctx.fillText(renderName, 40, 100);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText(`HP ${stats.hp}`, width - 100, 100);
    ctx.fillText(stats.tipo.emoji, width - 40, 100);

    ctx.textAlign = 'left';
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(40, height - 320, width - 80, 200);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.strokeRect(40, height - 320, width - 80, 200);

    ctx.shadowColor = '#000';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText(`${stats.tipo.emoji} Golpe Cataclísmico`, 60, height - 250);

    ctx.textAlign = 'right';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(`${stats.atk}`, width - 60, height - 250);

    ctx.textAlign = 'left';
    ctx.font = '24px sans-serif';
    ctx.fillText(`Rareza: ${stats.rareza} | Valor: ${stats.valor} XP`, 60, height - 170);
  } else {
    let borderColor = '#F5D63D';
    if (stats.rareza === 'COMÚN') borderColor = '#B0BEC5';
    if (stats.rareza === 'ÉPICA') borderColor = '#9C27B0';

    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, width, height);

    const bgElement = ctx.createLinearGradient(0, 0, 0, height);
    bgElement.addColorStop(0, stats.tipo.bg);
    bgElement.addColorStop(1, '#111');
    ctx.fillStyle = bgElement;
    ctx.fillRect(25, 25, width - 50, height - 50);

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.font = 'bold 50px sans-serif';
    ctx.fillText(renderName, 50, 95);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FF3B30';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(`${stats.hp} HP`, width - 90, 95);
    ctx.fillText(stats.tipo.emoji, width - 40, 95);

    ctx.fillStyle = '#B0B0B0';
    ctx.fillRect(55, 135, 630, 420);
    ctx.drawImage(avatar, 60, 140, 620, 410);

    if (stats.rareza === 'ÉPICA') drawSilverFoil(ctx, 60, 140, 620, 410);

    ctx.lineWidth = 8;
    ctx.strokeStyle = (stats.rareza === 'ÉPICA') ? '#FFD700' : '#444444';
    ctx.strokeRect(60, 140, 620, 410);

    ctx.fillStyle = (stats.rareza === 'ÉPICA') ? '#D4AF37' : '#9E9E9E';
    ctx.fillRect(60, 565, 620, 30);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.font = 'bold italic 18px sans-serif';
    ctx.fillText(`BÁSICO • Tipo ${stats.tipo.nombre} • SiriusBot TCG`, width / 2, 587);

    ctx.fillStyle = '#F8F8F8';
    ctx.fillRect(45, 615, 650, 290);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.font = 'bold 45px sans-serif';
    ctx.fillText(`${stats.tipo.emoji} Golpe Base`, 65, 695);

    ctx.textAlign = 'right';
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(`${stats.atk}`, width - 65, 695);

    ctx.textAlign = 'left';
    ctx.font = '26px sans-serif';
    ctx.fillStyle = '#444';
    ctx.fillText(`Este ataque causa ${stats.atk} puntos de daño al rival.`, 65, 755);
    ctx.fillText(`Rareza: ${stats.rareza} | Valor: ${stats.valor} XP`, 65, 810);

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('DEBILIDAD', 90, 950);
    ctx.textAlign = 'center';
    ctx.fillText('RESISTENCIA', width / 2, 950);
    ctx.textAlign = 'right';
    ctx.fillText('RETIRADA', width - 90, 950);

    ctx.font = '26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('💧 x2', 90, 985);
    ctx.textAlign = 'right';
    ctx.fillText('⚪ ⚪', width - 90, 985);
  }

  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

module.exports = {
  name: 'cartas',
  aliases: ['abrirsobre', 'miscartas', 'vercarta', 'vendercarta', 'vendertodas', 'duelocarta', 'intercambiar', 'aceptar'],
  category: 'juegos',
  desc: 'Colección de cartas TCG, peleas y mercado',

  execute: async ({ sock, msg, remoteJid, sender, pushName, args, commandName, mentionedJid, quoted, store, db, reply }) => {
    const cmd = commandName.toLowerCase();
    const dbCartas = getCartas();

    const miKey = getPlayerKey(dbCartas, sender);
    if (!dbCartas[miKey]) dbCartas[miKey] = [];
    let misCartas = dbCartas[miKey];

    if (cmd === 'abrirsobre') {
      const dbInv = getInv();
      if (!dbInv[sender] || (dbInv[sender].sobre || 0) <= 0) {
        return reply('❌ No tienes Sobres Gacha. Cómpralos con *.tienda sobre 1*');
      }

      dbInv[sender].sobre -= 1;
      saveInv(dbInv);

      const loadMsg = await sock.sendMessage(remoteJid, { text: '✨ _Abriendo sobre mágico..._' }, { quoted: msg });

      try {
        const groupMetadata = sock.getCachedGroupMetadata
          ? await sock.getCachedGroupMetadata(remoteJid)
          : await sock.groupMetadata(remoteJid);
        const participants = groupMetadata?.participants || [{ id: sender }];
        const randomParticipant = participants[Math.floor(Math.random() * participants.length)];
        const jidElegido = randomParticipant.id;

        let nombreElegido = cleanNumber(jidElegido);
        if (jidElegido === sender && pushName) {
          nombreElegido = pushName;
        } else if (store?.contacts?.[jidElegido]?.name) {
          nombreElegido = store.contacts[jidElegido].name;
        }
        if (/^\d+$/.test(nombreElegido)) nombreElegido = `User ${nombreElegido.slice(-4)}`;

        let pfpUrl = null;
        try { pfpUrl = await sock.profilePictureUrl(jidElegido, 'image'); } catch {}

        const stats = generarCarta();
        const nuevaCarta = {
          nombreReal: nombreElegido,
          jid: jidElegido,
          rareza: stats.rareza,
          tipo: stats.tipo.nombre,
          atk: stats.atk,
          hp: stats.hp,
          valor: stats.valor
        };
        misCartas.push(nuevaCarta);
        saveCartas(dbCartas);

        const buffer = await dibujarCartaPokemon(pfpUrl, nombreElegido, stats);
        try { await sock.sendMessage(remoteJid, { delete: loadMsg.key }); } catch {}

        const estaEnElGrupo = participants.some(p => p.id === jidElegido);
        const textoMencion = estaEnElGrupo ? `@${cleanNumber(jidElegido)}` : `👤 ${nombreElegido}`;
        const arrayMenciones = estaEnElGrupo ? [jidElegido] : [];
        const caption = `🎉 ¡Felicidades! Has obtenido la carta de ${textoMencion}\n🌟 Rareza: *${stats.rareza}*\n⚔️ ATK: ${stats.atk} | 💖 HP: ${stats.hp}\n\n🎒 Usa *.miscartas* para ver tu álbum.`;

        if (buffer) {
          await sock.sendMessage(remoteJid, { image: buffer, caption, mentions: arrayMenciones }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: caption, mentions: arrayMenciones }, { quoted: msg });
        }
      } catch (err) {
        return reply('❌ Error al generar la carta.');
      }
    }

    if (cmd === 'vercarta') {
      const index = parseInt(args[0], 10) - 1;
      if (isNaN(index) || index < 0 || index >= misCartas.length) return reply('❌ Indica el número correcto de tu carta (Ej: *.vercarta 1*)');

      const carta = misCartas[index];
      const loadMsg = await sock.sendMessage(remoteJid, { text: '🔍 _Desempolvando la carta..._' }, { quoted: msg });

      let pfpUrl = null;
      try { pfpUrl = await sock.profilePictureUrl(carta.jid, 'image'); } catch {}

      const tipoObj = TIPOS.find(t => t.nombre === carta.tipo) || TIPOS[0];
      const isFullArt = (carta.rareza === 'MÍTICA ex' || carta.rareza === 'LEGENDARIA V');
      const statsToDraw = { rareza: carta.rareza, tipo: tipoObj, atk: carta.atk, hp: carta.hp, valor: carta.valor, isFullArt };

      const buffer = await dibujarCartaPokemon(pfpUrl, carta.nombreReal, statsToDraw);
      try { await sock.sendMessage(remoteJid, { delete: loadMsg.key }); } catch {}

      const caption = `🎴 *CARTA #${index + 1}* | ${carta.rareza}\n👤 *Pertenece a:* ${carta.nombreReal}\n⚔️ ATK: ${carta.atk} | 💖 HP: ${carta.hp}`;
      if (buffer) {
        return sock.sendMessage(remoteJid, { image: buffer, caption }, { quoted: msg });
      }
      return reply(caption);
    }

    if (cmd === 'miscartas') {
      if (misCartas.length === 0) return reply('🎒 Tu álbum está vacío. Compra sobres con *.tienda sobre 1*');

      let txt = `🎒 *TU ÁLBUM POKÉMON* 🎒\n\n`;
      let arrayDeMenciones = [];
      let participants = [];

      try {
        const groupMetadata = sock.getCachedGroupMetadata
          ? await sock.getCachedGroupMetadata(remoteJid)
          : await sock.groupMetadata(remoteJid);
        participants = groupMetadata?.participants || [];
      } catch {}

      misCartas.forEach((carta, index) => {
        const estaEnElGrupo = participants.some(p => p.id === carta.jid);
        if (estaEnElGrupo) {
          txt += `*[ ${index + 1} ]* ✦ ${carta.rareza} | *@${cleanNumber(carta.jid)}*\n⚔️ ATK: ${carta.atk} | 💖 HP: ${carta.hp} | 💎 ${carta.valor} XP\n\n`;
          arrayDeMenciones.push(carta.jid);
        } else {
          txt += `*[ ${index + 1} ]* ✦ ${carta.rareza} | 👤 ${carta.nombreReal}\n⚔️ ATK: ${carta.atk} | 💖 HP: ${carta.hp} | 💎 ${carta.valor} XP\n\n`;
        }
      });

      txt += `🖼️ *Ver Carta:* .vercarta [número]\n💸 *Vender:* .vendercarta [número] | .vendertodas\n⚔️ *Pelear:* .duelocarta [número] @usuario\n🤝 *Cambio:* .intercambiar @usuario [tu_num] [su_num]`;

      return sock.sendMessage(remoteJid, { text: txt, mentions: arrayDeMenciones }, { quoted: msg });
    }

    if (cmd === 'vendercarta') {
      const index = parseInt(args[0], 10) - 1;
      if (isNaN(index) || index < 0 || index >= misCartas.length) return reply('❌ Indica el número de la carta (Ej: .vendercarta 1)');

      const ganancia = misCartas[index].valor;
      misCartas.splice(index, 1);
      saveCartas(dbCartas);

      await db.addXP(sender, ganancia);
      return reply(`✅ Carta vendida a la tienda por *${ganancia} XP*.`);
    }

    if (cmd === 'vendertodas') {
      if (misCartas.length === 0) return reply('❌ No tienes cartas para vender.');
      let gananciaTotal = misCartas.reduce((acc, carta) => acc + carta.valor, 0);
      let cantidad = misCartas.length;

      dbCartas[miKey] = [];
      saveCartas(dbCartas);

      await db.addXP(sender, gananciaTotal);
      return reply(`✅ Has vaciado tu álbum.\nVendiste *${cantidad} cartas* por un total de *${gananciaTotal} XP*.`);
    }

    if (cmd === 'intercambiar') {
      const target = quoted?.sender || mentionedJid?.[0];
      const numsArgs = args.filter(a => /^\d+$/.test(a)).map(a => parseInt(a, 10) - 1);
      const miNum = numsArgs[0];
      const suNum = numsArgs[1];

      if (!target || isNaN(miNum) || isNaN(suNum)) return reply('❌ Uso correcto:\n*.intercambiar @usuario [Tu_Carta] [Su_Carta]*');
      if (cleanNumber(target) === cleanNumber(sender)) return reply('❌ No puedes intercambiar contigo mismo.');

      const targetKey = getPlayerKey(dbCartas, target);
      const rivalCartas = dbCartas[targetKey] || [];

      if (!misCartas[miNum]) return reply('❌ No posees la carta que ofreces.');
      if (!rivalCartas[suNum]) return reply('❌ El rival no posee esa carta.');

      const miCarta = misCartas[miNum];
      const suCarta = rivalCartas[suNum];
      global.tradeRequests[targetKey] = { fromKey: miKey, miNum, suNum };

      return sock.sendMessage(remoteJid, {
        text: `⚖️ *SOLICITUD DE INTERCAMBIO* ⚖️\n\n👤 *${pushName}* ofrece la carta de *${miCarta.nombreReal}* [${miCarta.rareza}]\nA cambio de la carta de *${suCarta.nombreReal}* [${suCarta.rareza}].\n\n@${cleanNumber(target)}, escribe *.aceptar* para confirmar.`,
        mentions: [target]
      });
    }

    if (cmd === 'aceptar') {
      const trade = global.tradeRequests[miKey];
      if (!trade) return reply('❌ No tienes ninguna solicitud pendiente.');

      const { fromKey, miNum, suNum } = trade;

      if (!dbCartas[fromKey] || !dbCartas[miKey] || !dbCartas[fromKey][miNum] || !dbCartas[miKey][suNum]) {
        delete global.tradeRequests[miKey];
        return reply('❌ El intercambio fue cancelado porque alguien vendió su carta antes de aceptar.');
      }

      const cartaDelIniciador = dbCartas[fromKey].splice(miNum, 1)[0];
      const cartaMia = dbCartas[miKey].splice(suNum, 1)[0];

      dbCartas[fromKey].push(cartaMia);
      dbCartas[miKey].push(cartaDelIniciador);
      saveCartas(dbCartas);
      delete global.tradeRequests[miKey];

      return sock.sendMessage(remoteJid, { text: `🤝 *¡INTERCAMBIO EXITOSO!*`, mentions: [miKey, fromKey] });
    }

    if (cmd === 'duelocarta') {
      const numsArgs = args.filter(a => /^\d+$/.test(a)).map(a => parseInt(a, 10) - 1);
      const index = numsArgs[0];
      const target = quoted?.sender || mentionedJid?.[0];

      if (isNaN(index) || !target) return reply('❌ Uso:\n*.duelocarta [tu_numero] @usuario*');
      if (cleanNumber(target) === cleanNumber(sender)) return reply('❌ No puedes pelear contigo mismo.');

      const targetKey = getPlayerKey(dbCartas, target);
      const rivalCartas = dbCartas[targetKey] || [];

      if (!misCartas[index]) return reply('❌ No posees la carta que intentas usar para atacar.');
      if (rivalCartas.length === 0) return reply('❌ Tu rival no tiene cartas para defenderse.');

      const miCarta = misCartas[index];
      const cartaRival = rivalCartas[Math.floor(Math.random() * rivalCartas.length)];

      const miPoder = miCarta.atk + Math.floor(Math.random() * 50);
      const poderEnemigo = cartaRival.hp + Math.floor(Math.random() * 50);

      let txt = `⚔️ *BATALLA POKÉMON* ⚔️\n\n🔥 👤 *${pushName}* ataca con *${miCarta.nombreReal}* (Daño: ${miPoder})\n🛡️ *@${cleanNumber(target)}* defiende con *${cartaRival.nombreReal}* (Defensa: ${poderEnemigo})\n\n`;

      if (miPoder > poderEnemigo) {
        const botin = Math.floor(Math.random() * 800) + 200;
        const myData = await db.getUser(sender);
        const targetData = await db.getUser(target);

        targetData.xp = Math.max(0, (targetData.xp || 0) - botin);
        myData.xp = (myData.xp || 0) + botin;

        await myData.save();
        await targetData.save();

        txt += `💥 *¡Un golpe crítico!* Le robaste *${botin} XP*.`;
      } else {
        txt += `🧱 *¡No es muy efectivo!* La defensa del rival resistió tu ataque.`;
      }
      return sock.sendMessage(remoteJid, { text: txt, mentions: [target] }, { quoted: msg });
    }
  }
};
