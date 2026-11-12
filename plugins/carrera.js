'use strict';

const carreras = new Map();
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ANIMALES = ['🐎', '🐢', '🐖', '🐕', '🐅', '🐉', '🦖', '🦘', '🦏', '🦍', '🐆', '🐏'];

const NARRADOR_IDLE = [
  '👀 El público observa con muchísima tensión...',
  '🔥 La pista está que arde, nadie quiere ceder.',
  '👟 Los corredores mantienen un ritmo constante...',
  '💨 ¡Qué velocidad la de estas bestias!',
  '📸 Se preparan para un final de fotografía...'
];

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function getAnimalAleatorio(usados) {
  let disponibles = ANIMALES.filter(a => !usados.includes(a));
  if (disponibles.length === 0) disponibles = ANIMALES;
  return disponibles[Math.floor(Math.random() * disponibles.length)];
}

function renderTrack(animal, pos, maxPos = 16) {
  const p = Math.max(0, Math.min(pos, maxPos));
  const trail = '═'.repeat(p);
  const ahead = '═'.repeat(maxPos - p);
  return `║ 🏁 ${ahead}${animal}${trail} ║`;
}

module.exports = {
  name: 'carrera',
  aliases: ['unirse', 'arrancar'],
  category: 'juegos',
  desc: 'Organiza una carrera de animales con apuestas',

  execute: async ({ sock, msg, remoteJid, sender, args, commandName, db, fromGroup, reply }) => {
    if (!fromGroup) return reply('❌ Las carreras solo se organizan en grupos.');

    const action = commandName.toLowerCase();
    const userKey = cleanJid(sender);

    if (action === 'carrera') {
      if (carreras.has(remoteJid)) {
        return reply('⚠️ Ya hay una carrera activa en este grupo. ¡Usa *.unirse*!');
      }

      const apuesta = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 0;
      const userData = await db.getUser(userKey);

      if (apuesta > 0) {
        if ((userData.xp || 0) < apuesta) {
          return reply(`❌ No tienes XP suficiente. Intentas apostar *${apuesta}* pero tienes *${userData.xp || 0}*.`);
        }
        userData.xp -= apuesta;
        await userData.save();
      }

      const miAnimal = getAnimalAleatorio([]);
      const nuevaCarrera = {
        estado: 'esperando',
        creador: userKey,
        apuesta,
        animalesUsados: [miAnimal],
        participantes: [{ id: userKey, animal: miAnimal, posicion: 0 }],
        longitudPista: 16,
        timeoutId: null
      };

      carreras.set(remoteJid, nuevaCarrera);

      let msgInicial = `🏁 *¡SE ABRE LA PISTA!* 🏁\n\n`;
      msgInicial += apuesta > 0 ? `💰 Pozo Inicial: *${apuesta} XP*\n\n` : `🎮 *Carrera amistosa* (Sin apuestas)\n\n`;
      msgInicial += `Tu corredor será el: ${miAnimal} (@${cleanNumber(userKey)})\n\n`;
      msgInicial += `👉 Escriban *.unirse* para entrar.\n_(El creador puede escribir *.arrancar* para iniciar ya)_`;

      await sock.sendMessage(remoteJid, { text: msgInicial, mentions: [userKey] }, { quoted: msg });

      nuevaCarrera.timeoutId = setTimeout(() => {
        if (carreras.has(remoteJid) && carreras.get(remoteJid).estado === 'esperando') {
          iniciarCarrera(sock, remoteJid, db);
        }
      }, 60000);
      return;
    }

    if (action === 'unirse') {
      const carrera = carreras.get(remoteJid);
      if (!carrera || carrera.estado !== 'esperando') {
        return reply('⚠️ No hay ninguna carrera en fase de inscripción ahora mismo.');
      }
      if (carrera.participantes.find(p => p.id === userKey)) {
        return reply('⚠️ Ya estás inscrito en esta carrera.');
      }
      if (carrera.participantes.length >= 6) {
        return reply('⚠️ La pista está llena (Máximo 6 corredores).');
      }

      const userData = await db.getUser(userKey);
      if (carrera.apuesta > 0) {
        if ((userData.xp || 0) < carrera.apuesta) {
          return reply(`❌ Necesitas *${carrera.apuesta} XP* para igualar la apuesta de esta carrera.`);
        }
        userData.xp -= carrera.apuesta;
        await userData.save();
      }

      const nuevoAnimal = getAnimalAleatorio(carrera.animalesUsados);
      carrera.animalesUsados.push(nuevoAnimal);
      carrera.participantes.push({ id: userKey, animal: nuevoAnimal, posicion: 0 });

      return sock.sendMessage(remoteJid, {
        text: `🎟️ ¡El ${nuevoAnimal} de @${cleanNumber(userKey)} ha entrado a la pista!`,
        mentions: [userKey]
      }, { quoted: msg });
    }

    if (action === 'arrancar') {
      const carrera = carreras.get(remoteJid);
      if (!carrera || carrera.estado !== 'esperando') {
        return reply('⚠️ No hay carreras pendientes de inicio.');
      }
      if (carrera.creador !== userKey) {
        return reply('❌ Solo el creador de la carrera puede arrancarla antes de tiempo.');
      }

      clearTimeout(carrera.timeoutId);
      await iniciarCarrera(sock, remoteJid, db);
    }
  }
};

async function iniciarCarrera(sock, remoteJid, db) {
  const carrera = carreras.get(remoteJid);
  if (!carrera || carrera.estado !== 'esperando') return;
  carrera.estado = 'corriendo';

  if (carrera.participantes.length === 1) {
    const frasesToxicas = [
      '🤖 ¿En serio nadie más se unió? Supongo que tendré que bajar de mi nube para humillarte yo mismo. ¡Prepárate para llorar! 💅',
      '🤖 Al parecer a nadie le sobra el valor aquí. Me toca ensuciarme las manos... 🏎️💨',
      '🤖 Pff, te dejaron más solo que al admin. Ni modo, yo mismo te voy a dar una paliza en la pista. 💸'
    ];
    const fraseElegida = frasesToxicas[Math.floor(Math.random() * frasesToxicas.length)];
    await sock.sendMessage(remoteJid, { text: `*SiriusBot:* ${fraseElegida}` });

    const animalBot = getAnimalAleatorio(carrera.animalesUsados);
    carrera.participantes.push({ id: 'bot', animal: animalBot, posicion: 0 });
    await esperar(2500);
  } else {
    await sock.sendMessage(remoteJid, { text: '🏁 *¡CERRANDO INSCRIPCIONES!* Que empiece el caos...' });
    await esperar(1500);
  }

  await animarCarrera(sock, remoteJid, db);
}

async function animarCarrera(sock, remoteJid, db) {
  const carrera = carreras.get(remoteJid);
  if (!carrera) return;

  let hayGanador = false;
  let mensajeId = null;
  const pozoTotal = carrera.apuesta * carrera.participantes.length;
  const arrayMenciones = carrera.participantes.filter(p => p.id !== 'bot').map(p => p.id);

  while (!hayGanador) {
    let textoFrame = `🏁 *CARRERA EXTREMA* 🏁\n\n`;
    textoFrame += carrera.apuesta > 0 ? `💰 Pozo: *${pozoTotal} XP*\n\n` : `🎮 Amistosa\n\n`;

    const bordeTop = `╔${'═'.repeat(carrera.longitudPista + 6)}╗\n`;
    const bordeBot = `╚${'═'.repeat(carrera.longitudPista + 6)}╝\n\n`;
    textoFrame += bordeTop;

    const eventosTexto = [];
    const maxPosicionActual = Math.max(...carrera.participantes.map(c => c.posicion));

    for (const corredor of carrera.participantes) {
      let avance = Math.floor(Math.random() * 2) + 1;
      let chance = Math.random();
      const atrasado = (maxPosicionActual - corredor.posicion) >= 3;
      if (atrasado) chance -= 0.15;

      if (chance < 0.12) {
        avance += 3;
        eventosTexto.push(`🚀 ¡El ${corredor.animal} tomó un atajo!`);
      } else if (chance < 0.25) {
        avance += 2;
        eventosTexto.push(`⚡ ¡El ${corredor.animal} pisó el acelerador!`);
      } else if (chance > 0.88 && corredor.posicion > 0 && !atrasado) {
        avance = Math.max(0, avance - 2);
        eventosTexto.push(`💥 ¡Oh no! El ${corredor.animal} tropezó.`);
      }

      corredor.posicion += avance;
      if (corredor.posicion >= carrera.longitudPista) hayGanador = true;
      textoFrame += renderTrack(corredor.animal, corredor.posicion, carrera.longitudPista) + '\n';
    }

    textoFrame += bordeBot;

    for (const corredor of carrera.participantes) {
      const tagNombre = corredor.id === 'bot' ? '*SiriusBot*' : `@${cleanNumber(corredor.id)}`;
      textoFrame += `↳ ${corredor.animal} ${tagNombre}\n`;
    }

    if (eventosTexto.length === 0) {
      eventosTexto.push(NARRADOR_IDLE[Math.floor(Math.random() * NARRADOR_IDLE.length)]);
    }

    textoFrame += `\n📢 *Narrador:*\n_${eventosTexto.join('\n')}_`;

    if (!mensajeId) {
      const sent = await sock.sendMessage(remoteJid, { text: textoFrame, mentions: arrayMenciones });
      mensajeId = sent.key;
    } else {
      try {
        await sock.sendMessage(remoteJid, { text: textoFrame, edit: mensajeId, mentions: arrayMenciones });
      } catch {}
    }

    await esperar(3000);
  }

  const maxPosicion = Math.max(...carrera.participantes.map(c => c.posicion));
  let ganadores = carrera.participantes.filter(c => c.posicion >= carrera.longitudPista);
  if (ganadores.length > 1) {
    ganadores = ganadores.filter(c => c.posicion === maxPosicion);
  }

  let textoFinal = '🏆 *¡CRUZARON LA META!*\n\n';

  if (carrera.apuesta > 0) {
    const premioPorGanador = Math.floor(pozoTotal / ganadores.length);

    if (ganadores.some(g => g.id === 'bot')) {
      textoFinal += `🤖 *SiriusBot:* ¡Se los dije! Me llevo los *${pozoTotal} XP*. El casino siempre gana, novatos. 💅✨`;
    } else {
      const tagsGanadores = ganadores.map(g => `@${cleanNumber(g.id)}`).join(', ');
      textoFinal += `🎉 ¡Victoria para ${tagsGanadores}!\n💰 Has ganado *${premioPorGanador} XP*.`;

      for (const g of ganadores) {
        if (g.id !== 'bot') {
          await db.addXP(g.id, premioPorGanador);
        }
      }
    }
  } else {
    if (ganadores.some(g => g.id === 'bot')) {
      textoFinal += `🤖 *SiriusBot:* ¿En serio pensaron que me iban a ganar? ¡Soy imparable! 😎`;
    } else {
      const tagsGanadores = ganadores.map(g => `@${cleanNumber(g.id)}`).join(', ');
      textoFinal += `🎉 ¡La gloria es para ${tagsGanadores}!`;
    }
  }

  const mencionesGanadores = ganadores.filter(g => g.id !== 'bot').map(g => g.id);
  await sock.sendMessage(remoteJid, { text: textoFinal, mentions: mencionesGanadores });
  carreras.delete(remoteJid);
}
