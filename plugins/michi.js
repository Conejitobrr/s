'use strict';

const groupSessions = new Map();
const botBetCooldowns = new Map();

const MAX_BET = 2000;
const BOT_COOLDOWN_MINS = 10;

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

const WIN_COMBOS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function checkWin(board, mark) {
  return WIN_COMBOS.some(combo => combo.every(idx => board[idx] === mark));
}

function renderBoard(board) {
  const numEmojis = {
    1: '1️⃣', 2: '2️⃣', 3: '3️⃣',
    4: '4️⃣', 5: '5️⃣', 6: '6️⃣',
    7: '7️⃣', 8: '8️⃣', 9: '9️⃣'
  };
  const b = board.map(val => {
    if (val === 'X') return '✖️';
    if (val === 'O') return '⭕';
    return numEmojis[val];
  });
  return `\n  ${b[0]} │ ${b[1]} │ ${b[2]} \n ───┼───┼─── \n  ${b[3]} │ ${b[4]} │ ${b[5]} \n ───┼───┼─── \n  ${b[6]} │ ${b[7]} │ ${b[8]} \n`;
}

function getBotMove(board) {
  for (let i = 0; i < 9; i++) {
    if (typeof board[i] === 'number') {
      const backup = board[i]; board[i] = 'O';
      if (checkWin(board, 'O')) { board[i] = backup; return i; }
      board[i] = backup;
    }
  }
  for (let i = 0; i < 9; i++) {
    if (typeof board[i] === 'number') {
      const backup = board[i]; board[i] = 'X';
      if (checkWin(board, 'X')) { board[i] = backup; return i; }
      board[i] = backup;
    }
  }
  if (typeof board[4] === 'number') return 4;
  const corners = [0, 2, 6, 8].filter(i => typeof board[i] === 'number');
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  const available = board.filter(i => typeof board[i] === 'number');
  if (available.length > 0) return board.indexOf(available[Math.floor(Math.random() * available.length)]);
  return -1;
}

function getUserGame(remoteJid, userJid) {
  const games = groupSessions.get(remoteJid) || [];
  return games.find(g => g.player1 === userJid || g.player2 === userJid);
}

function removeGame(remoteJid, session) {
  if (session.timeoutId) clearTimeout(session.timeoutId);
  let games = groupSessions.get(remoteJid) || [];
  games = games.filter(g => g !== session);
  if (games.length === 0) groupSessions.delete(remoteJid);
  else groupSessions.set(remoteJid, games);
}

function setGameTimeout(remoteJid, session, sock, db) {
  if (session.timeoutId) clearTimeout(session.timeoutId);
  session.timeoutId = setTimeout(async () => {
    if (session.bet > 0 && !session.accepted) {
      try {
        const p1Data = await db.getUser(session.player1);
        p1Data.xp = (p1Data.xp || 0) + session.bet;
        if (p1Data.save) await p1Data.save();
      } catch {}
    }
    removeGame(remoteJid, session);

    const mentions = [session.player1];
    if (session.player2 !== 'bot') mentions.push(session.player2);

    sock.sendMessage(remoteJid, { text: `⏱️ *Partida de Michi Cancelada*\n\nEl juego expiró por inactividad.`, mentions }).catch(() => {});
  }, 2 * 60 * 1000);
}

async function processMove({ sock, msg, remoteJid, p1, session, idx, db, reply }) {
  if (session.turn !== p1) {
    return sock.sendMessage(remoteJid, { text: `⏳ Espera tu turno. Le toca a @${cleanNumber(session.turn)}`, mentions: [session.turn] }, { quoted: msg });
  }

  if (isNaN(idx) || idx < 0 || idx > 8 || typeof session.board[idx] !== 'number') {
    return reply('❌ Casilla inválida o ya ocupada. Envía un número libre del 1 al 9.');
  }

  if (p1 === session.player2 && !session.accepted) {
    if (session.bet > 0) {
      const p2Data = await db.getUser(p1);
      if ((p2Data.xp || 0) < session.bet) {
        removeGame(remoteJid, session);
        const p1Data = await db.getUser(session.player1);
        p1Data.xp = (p1Data.xp || 0) + session.bet;
        if (p1Data.save) await p1Data.save();
        return sock.sendMessage(remoteJid, { text: `❌ @${cleanNumber(session.player2)} se quedó sin XP antes de aceptar.\nDuelo cancelado y XP devuelta a P1.`, mentions: [session.player2, session.player1] }, { quoted: msg });
      }
      p2Data.xp -= session.bet;
      if (p2Data.save) await p2Data.save();
    }
    session.accepted = true;
  }

  session.board[idx] = (session.turn === session.player1) ? 'X' : 'O';

  const endGame = async (result, winner, loser) => {
    removeGame(remoteJid, session);
    let txt = '';
    const mentions = [];

    if (result === 'win') {
      txt = `🏆 *¡HAY UN GANADOR!* 🏆\n\n🥇 Ganador: ${winner === 'bot' ? '🤖 SiriusBot' : `@${cleanNumber(winner)}`}\n`;
      if (winner !== 'bot') mentions.push(winner);
      if (loser !== 'bot') mentions.push(loser);

      txt += renderBoard(session.board);

      if (session.bet > 0) {
        if (winner !== 'bot') {
          await db.addXP(winner, session.bet * 2);
        }
        txt += `\n💰 Se lleva el pozo de *${session.bet * 2} XP*.`;
      } else if (winner !== 'bot') {
        await db.addXP(winner, 50);
        txt += `\n🎁 Se lleva *+50 XP* de recompensa.`;
      }
    } else {
      txt = `🤝 *¡EMPATE TÁCTICO!* 🤝\n` + renderBoard(session.board);
      mentions.push(session.player1);
      if (session.player2 !== 'bot') mentions.push(session.player2);

      if (session.bet > 0) {
        await db.addXP(session.player1, session.bet);
        if (session.player2 !== 'bot') await db.addXP(session.player2, session.bet);
        txt += `\n♻️ El pozo ha sido devuelto a ambos jugadores.`;
      } else {
        await db.addXP(session.player1, 10);
        if (session.player2 !== 'bot') await db.addXP(session.player2, 10);
        txt += `\n🎁 Recompensa por esfuerzo: *+10 XP* para cada uno.`;
      }
    }
    await sock.sendMessage(remoteJid, { text: txt, mentions }, { quoted: msg });
  };

  if (checkWin(session.board, session.board[idx])) {
    return endGame('win', p1, p1 === session.player1 ? session.player2 : session.player1);
  }
  if (session.board.every(val => typeof val === 'string')) {
    return endGame('tie');
  }

  session.turn = (session.turn === session.player1) ? session.player2 : session.player1;

  if (session.turn === 'bot') {
    session.board[getBotMove(session.board)] = 'O';
    if (checkWin(session.board, 'O')) return endGame('win', 'bot', p1);
    if (session.board.every(val => typeof val === 'string')) return endGame('tie');
    session.turn = p1;
  }

  setGameTimeout(remoteJid, session, sock, db);
  await sock.sendMessage(remoteJid, {
    text: `👉 Tu turno: @${cleanNumber(session.turn)}` + renderBoard(session.board) + `\n_(Escribe un número del 1 al 9 o .michi rendirse)_`,
    mentions: [session.turn]
  }, { quoted: msg });
}

module.exports = {
  name: 'michi',
  aliases: ['tictactoe', 'tresenraya'],
  category: 'juegos',
  desc: 'Juega al tres en raya con apuestas',

  execute: async ({ sock, msg, remoteJid, sender, args, mentionedJid, quoted, db, fromGroup, reply }) => {
    if (!fromGroup) return reply('❌ Este minijuego solo está disponible en grupos.');

    const p1 = cleanJid(sender);
    const session = getUserGame(remoteJid, p1);
    const action = args[0] ? args[0].toLowerCase().trim() : '';

    if (['salir', 'cancelar', 'abandonar', 'rendirse'].includes(action)) {
      if (!session) return sock.sendMessage(remoteJid, { text: '❌ No estás en ninguna partida activa.', mentions: [p1] }, { quoted: msg });

      if (!session.accepted) {
        if (session.bet > 0) {
          await db.addXP(session.player1, session.bet);
          removeGame(remoteJid, session);
          return sock.sendMessage(remoteJid, { text: `🏳️ @${cleanNumber(p1)} canceló el duelo antes de empezar. Se le devolvieron sus *${session.bet} XP*.`, mentions: [p1] }, { quoted: msg });
        }
        removeGame(remoteJid, session);
        return sock.sendMessage(remoteJid, { text: `🏳️ Partida cancelada.`, mentions: [p1] }, { quoted: msg });
      }

      const winner = session.player1 === p1 ? session.player2 : session.player1;
      if (session.bet > 0 && winner !== 'bot') {
        await db.addXP(winner, session.bet * 2);
        await sock.sendMessage(remoteJid, { text: `🏳️ @${cleanNumber(p1)} se acobardó y abandonó.\n\n🏆 ¡Gana @${cleanNumber(winner)} y se lleva *${session.bet * 2} XP*!`, mentions: [p1, winner] }, { quoted: msg });
      } else {
        const winLabel = winner === 'bot' ? '🤖 SiriusBot' : `@${cleanNumber(winner)}`;
        const mentions = winner === 'bot' ? [p1] : [p1, winner];
        await sock.sendMessage(remoteJid, { text: `🏳️ @${cleanNumber(p1)} se rindió. ¡Gana ${winLabel}!`, mentions }, { quoted: msg });
      }
      removeGame(remoteJid, session);
      return;
    }

    if (!session) {
      const rawTarget = quoted?.sender || mentionedJid?.[0];
      const target = rawTarget ? cleanJid(rawTarget) : 'bot';
      const bet = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 0;

      if (bet > MAX_BET) return reply(`❌ El límite de apuestas para el Michi es de *${MAX_BET} XP*.`);
      if (target === p1) return reply('❌ No puedes jugar contigo mismo.');

      if (target === 'bot' && bet > 0) {
        const last = botBetCooldowns.get(p1) || 0;
        if (Date.now() - last < BOT_COOLDOWN_MINS * 60000) {
          const timeLeft = Math.ceil((BOT_COOLDOWN_MINS * 60000 - (Date.now() - last)) / 60000);
          return reply(`⏳ *¡CÁLMATE LUDÓPATA!*\n\nEspera *${timeLeft} minutos* para volver a apostar contra SiriusBot.`);
        }
      }

      if (bet > 0) {
        const p1Data = await db.getUser(p1);
        if ((p1Data.xp || 0) < bet) return reply(`❌ No tienes XP suficiente. Intentas apostar *${bet}* pero tienes *${p1Data.xp || 0}*.`);

        if (target !== 'bot') {
          const p2Data = await db.getUser(target);
          if ((p2Data.xp || 0) < bet) {
            return sock.sendMessage(remoteJid, { text: `❌ @${cleanNumber(target)} no tiene *${bet} XP* para igualar la apuesta.`, mentions: [target] }, { quoted: msg });
          }
        }

        p1Data.xp -= bet;
        await p1Data.save();
      }

      const startingPlayer = Math.random() < 0.5 ? p1 : target;
      const newSession = {
        player1: p1, player2: target, board: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        turn: startingPlayer, bet, accepted: target === 'bot', timeoutId: null
      };

      if (newSession.turn === 'bot') {
        newSession.board[getBotMove(newSession.board)] = 'O';
        newSession.turn = p1;
      }

      groupSessions.set(remoteJid, [...(groupSessions.get(remoteJid) || []), newSession]);
      if (target === 'bot' && bet > 0) botBetCooldowns.set(p1, Date.now());
      setGameTimeout(remoteJid, newSession, sock, db);

      const txt = `⚔️ *PARTIDA DE MICHI* ⚔️\n\n` +
                  (bet > 0 ? `💰 Pozo: *${bet * 2} XP*\n` : '') +
                  `✖️ P1: @${cleanNumber(p1)}\n⭕ P2: ${target === 'bot' ? '🤖 SiriusBot' : `@${cleanNumber(target)}`}\n` +
                  renderBoard(newSession.board) +
                  `\n🎲 Empieza: ${startingPlayer === 'bot' ? '🤖 SiriusBot' : `@${cleanNumber(startingPlayer)}`}\n` +
                  `_(Escribe un número del 1 al 9 directamente en el chat para jugar)_` +
                  (target !== 'bot' ? `\n\n📌 _Para aceptar el reto, @${cleanNumber(target)} debe hacer su primera jugada._` : '');

      const menciones = target === 'bot' ? [p1] : [p1, target];
      return sock.sendMessage(remoteJid, { text: txt, mentions: menciones }, { quoted: msg });
    }

    const idx = parseInt(action, 10) - 1;
    await processMove({ sock, msg, remoteJid, p1, session, idx, db, reply });
  },

  // 🎯 Permite responder solo con el número (1 al 9) sin escribir ".michi"
  onMessage: async ({ sock, msg, remoteJid, sender, body, fromGroup, db, reply }) => {
    if (!fromGroup || !body) return;
    const trimmed = body.trim();
    if (!/^[1-9]$/.test(trimmed)) return;

    const p1 = cleanJid(sender);
    const session = getUserGame(remoteJid, p1);
    if (!session || session.turn !== p1) return;

    const idx = parseInt(trimmed, 10) - 1;
    await processMove({ sock, msg, remoteJid, p1, session, idx, db, reply });
  }
};
