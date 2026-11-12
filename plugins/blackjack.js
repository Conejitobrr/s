'use strict';

const bjSessions = new Map();

const SUITS = ['♠️', '♥️', '♣️', '♦️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getDeck() {
  let deck = [];
  for (let suit of SUITS) {
    for (let value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function getCardValue(card) {
  if (['J', 'Q', 'K'].includes(card.value)) return 10;
  if (card.value === 'A') return 11;
  return parseInt(card.value, 10);
}

function calculateScore(cards) {
  let score = 0;
  let aces = 0;
  for (let card of cards) {
    score += getCardValue(card);
    if (card.value === 'A') aces += 1;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

function renderCards(cards, hideSecond = false) {
  if (hideSecond && cards.length > 1) {
    return `${cards[0].value}${cards[0].suit}  |  ❓`;
  }
  return cards.map(c => `${c.value}${c.suit}`).join('  |  ');
}

function cleanNumber(jid = '') { return String(jid).split('@')[0].split(':')[0].replace(/\D/g, ''); }

module.exports = {
  name: 'blackjack',
  aliases: ['bj', 'pedir', 'plantarse'],
  category: 'juegos',
  desc: 'Juega al 21 contra SiriusBot',

  execute: async ({ sock, msg, remoteJid, sender, args, commandName, db, reply }) => {
    const action = commandName.toLowerCase();
    const session = bjSessions.get(sender);

    if (['blackjack', 'bj'].includes(action)) {
      if (session) return reply('❌ Ya tienes una partida en curso. Usa *.pedir* o *.plantarse*.');

      const bet = parseInt(args.find(a => /^\d+$/.test(a)), 10) || 0;
      if (bet <= 0) return reply('❌ Debes apostar algo de XP. Ejemplo: *.bj 500*');

      const uData = await db.getUser(sender);
      if ((uData.xp || 0) < bet) return reply(`❌ No tienes XP suficiente. Intentas apostar *${bet}* pero tienes *${uData.xp || 0}*.`);

      uData.xp -= bet;
      await uData.save();

      const deck = getDeck();
      const playerHand = [deck.pop(), deck.pop()];
      const botHand = [deck.pop(), deck.pop()];

      const newSession = { bet, deck, playerHand, botHand, timeoutId: null };
      const playerScore = calculateScore(playerHand);
      const botScore = calculateScore(botHand);

      if (playerScore === 21) {
        const winAmount = Math.floor(bet * 2.5);
        uData.xp += winAmount;
        await uData.save();
        return sock.sendMessage(remoteJid, {
          text: `🎰 *SIRIUS CASINO - 21* 🎰\n\n🤖 *SiriusBot:*\n🃏 Cartas: ${renderCards(botHand)}\n📊 Total: ${botScore}\n\n👤 *Tu Mano:*\n🃏 Cartas: ${renderCards(playerHand)}\n📊 Total: *21*\n\n🎉 ¡BLACKJACK NATURAL! Ganaste *${winAmount} XP*.`,
          mentions: [sender]
        }, { quoted: msg });
      }

      bjSessions.set(sender, newSession);

      newSession.timeoutId = setTimeout(() => {
        bjSessions.delete(sender);
        sock.sendMessage(remoteJid, { text: `⏱️ @${cleanNumber(sender)}, tu partida expiró por inactividad. SiriusBot se quedó tu apuesta de *${bet} XP*.`, mentions: [sender] });
      }, 2 * 60 * 1000);

      let txt = `🎰 *SIRIUS CASINO - 21* 🎰\n\n`;
      txt += `🤖 *SiriusBot:*\n🃏 Cartas: ${renderCards(botHand, true)}\n📊 Total: ${getCardValue(botHand[0])} + ❓\n\n`;
      txt += `👤 *Tu Mano:*\n🃏 Cartas: ${renderCards(playerHand)}\n📊 Total: *${playerScore}*\n\n`;
      txt += `💰 *Apuesta:* ${bet} XP\n`;
      txt += `────────────────\n`;
      txt += `👇 *Escribe tu jugada:*\n🔹 *.pedir* (Sacar carta)\n🔹 *.plantarse* (Quedarse así)`;

      return sock.sendMessage(remoteJid, { text: txt, mentions: [sender] }, { quoted: msg });
    }

    if (action === 'pedir') {
      if (!session) return reply('❌ No estás jugando al Blackjack. Usa *.bj [apuesta]*');

      clearTimeout(session.timeoutId);
      session.playerHand.push(session.deck.pop());
      const playerScore = calculateScore(session.playerHand);

      if (playerScore > 21) {
        bjSessions.delete(sender);
        return sock.sendMessage(remoteJid, {
          text: `💥 *¡TE PASASTE! (BUST)* 💥\n\n🃏 Tus cartas: ${renderCards(session.playerHand)}\n📊 Total: *${playerScore}*\n\n💀 Has perdido tus *${session.bet} XP* apostados.`,
          mentions: [sender]
        }, { quoted: msg });
      }

      session.timeoutId = setTimeout(() => {
        bjSessions.delete(sender);
        sock.sendMessage(remoteJid, { text: `⏱️ @${cleanNumber(sender)}, partida expirada. Perdiste tus *${session.bet} XP*.`, mentions: [sender] });
      }, 2 * 60 * 1000);

      let txt = `🎰 *SIRIUS CASINO - 21* 🎰\n\n`;
      txt += `🤖 *SiriusBot:*\n🃏 Cartas: ${renderCards(session.botHand, true)}\n📊 Total: ${getCardValue(session.botHand[0])} + ❓\n\n`;
      txt += `👤 *Tu Mano:*\n🃏 Cartas: ${renderCards(session.playerHand)}\n📊 Total: *${playerScore}*\n\n`;
      txt += `────────────────\n`;

      if (playerScore === 21) {
        txt += `⚠️ *¡Llegaste a 21!* Escribe *.plantarse* para cederle el turno a SiriusBot.`;
      } else {
        txt += `👇 *¿Otra carta?*\n🔹 *.pedir*\n🔹 *.plantarse*`;
      }

      return sock.sendMessage(remoteJid, { text: txt, mentions: [sender] }, { quoted: msg });
    }

    if (action === 'plantarse') {
      if (!session) return reply('❌ No estás jugando al Blackjack.');
      clearTimeout(session.timeoutId);
      bjSessions.delete(sender);

      const playerScore = calculateScore(session.playerHand);
      let botScore = calculateScore(session.botHand);

      while (botScore < 17) {
        session.botHand.push(session.deck.pop());
        botScore = calculateScore(session.botHand);
      }

      let txt = `🎰 *RESULTADO DEL JUEGO* 🎰\n\n`;
      txt += `🤖 *SiriusBot:*\n🃏 Cartas: ${renderCards(session.botHand)}\n📊 Total: *${botScore}*\n\n`;
      txt += `👤 *Jugador:*\n🃏 Cartas: ${renderCards(session.playerHand)}\n📊 Total: *${playerScore}*\n\n`;
      txt += `────────────────\n`;

      const uData = await db.getUser(sender);

      if (botScore > 21) {
        uData.xp = (uData.xp || 0) + (session.bet * 2);
        txt += `🎉 ¡SiriusBot se pasó! Ganaste *${session.bet * 2} XP*.`;
      } else if (playerScore > botScore) {
        uData.xp = (uData.xp || 0) + (session.bet * 2);
        txt += `🏆 ¡Le ganaste a SiriusBot! Te llevas *${session.bet * 2} XP*.`;
      } else if (playerScore === botScore) {
        uData.xp = (uData.xp || 0) + session.bet;
        txt += `🤝 ¡Empate! Se te devuelve tu apuesta de *${session.bet} XP*.`;
      } else {
        txt += `💀 SiriusBot gana. Pierdes tu apuesta de *${session.bet} XP*.`;
      }

      await uData.save();
      return sock.sendMessage(remoteJid, { text: txt, mentions: [sender] }, { quoted: msg });
    }
  }
};
