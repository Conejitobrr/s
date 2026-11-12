'use strict';

const cooldowns = new Map();

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randXP(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const cazaLegendaria = [
  '🐉 ¡MÍTICO! Lograste abatir a un *Dragón Ancestral* que aterrorizaba la región.',
  '🦄 ¡Increíble! Encontraste un *Unicornio Mágico* y te regaló parte de su magia por dejarlo ir.',
  '🦖 Viajaste en el tiempo y cazaste a un mismísimo *T-Rex*.',
  '🦍 Te adentraste en la nieve y lograste capturar al *Yeti*.',
  '🦇 ¡Sobreviviste a la noche! Cazaste al temible *Chupacabras*.',
  '🦅 En lo alto de la montaña, lograste atrapar a un *Grifo Mitológico*.',
  '🐙 Viajaste a mar abierto y lograste arponear a las crías de un *Kraken*.',
  '🐍 Sobreviviste a la mirada de un *Basilisco* y lograste derrotarlo.',
  '🔥 Encontraste las plumas de un *Ave Fénix* recién renacido.',
  '🐺 Cazaste a un legendario *Hombre Lobo* durante la luna llena.'
];

const cazaEpica = [
  '🐻 Te enfrentaste cuerpo a cuerpo contra un enorme *Oso Pardo*.',
  '🐅 Tuviste una puntería perfecta y cazaste a un *Tigre de Bengala*.',
  '🦁 Te convertiste en el rey de la selva al cazar a un *León Africano*.',
  '🐊 Te metiste al pantano y cazaste a un *Cocodrilo del Nilo* gigante.',
  '🐆 Fuiste más rápido que un *Leopardo* y te quedaste con su piel.',
  '🦏 Lograste derribar a un pesado *Rinoceronte Negro*.',
  '🦍 Derrotaste en su territorio a un *Gorila Espalda Plateada*.',
  '🐍 Tuviste que luchar por horas para cazar una *Anaconda Gigante*.',
  '🐺 Rastreaste a la manada y lograste cazar al *Lobo Alfa*.',
  '🐘 Sobreviviste a la estampida y atrapaste a un *Elefante Salvaje*.'
];

const cazaNormal = [
  '🦌 Apuntaste con calma y cazaste un *Venado de Cola Blanca*.',
  '🐇 Fuiste silencioso y atrapaste a un par de *Conejos de Campo*.',
  '🐗 Te subiste a un árbol y cazaste a un *Jabalí Salvaje*.',
  '🦆 Te escondiste en los arbustos y cazaste un *Pato Silvestre*.',
  '🦃 Tuviste suerte y cazaste un *Pavo Gordo* para la cena.',
  '🦊 Viste un movimiento rápido y lograste cazar a un *Zorro Escurridizo*.',
  '🦡 Tuviste una pelea difícil, pero lograste cazar un *Tejón*.',
  '🐿️ Solo conseguiste cazar unas cuantas *Ardillas Gordas*.',
  '🦝 Cazaste a un *Mapache* que intentaba robarte la comida.',
  '🦎 Atrapaste a una gran *Iguana* escondida en las rocas.',
  '🦔 Atrapaste a un *Puercoespín*, pero te pinchaste un poco.',
  '🦔 Atrapaste un *Armadillo* rodando por el desierto.'
];

const cazaBasura = [
  '🌳 Viste una sombra gigante, disparaste... y era un *tronco de árbol*.',
  '🪨 Creíste ver a una tortuga gigante, pero le disparaste a una *roca redonda*.',
  '💨 Ibas a disparar, pero te dio alergia, *estornudaste*, y todos los animales huyeron.',
  '🔫 Tu presa estaba en la mira, pero tu *arma se atascó*.',
  '🏃‍♂️ Pisaste una rama seca, el animal te vio y *salió corriendo a toda velocidad*.',
  '📸 En lugar de disparar tu rifle, por error sacaste tu celular y le *tomaste una foto*.',
  '🐶 Apuntaste con fiereza pero resultó ser el *perro callejero* del vecindario.',
  '🎃 Disparaste a lo lejos y destruiste un *espantapájaros* de un granjero.',
  '🐿️ Te asustó una *ardilla* que te saltó a la cara y tiraste el arma.',
  '💩 Pisaste estiércol de oso, resbalaste y ahuyentaste a toda la fauna.'
];

const cazaCastigo = [
  '🐍 Caminabas distraído y pisaste una *Víbora Venenosa*. Pagaste antídotos carísimos.',
  '🐻 Le disparaste a un osito, pero apareció su mamá y *tuviste que huir tirando tu dinero*.',
  '🕳️ Ibas caminando hacia atrás y *caíste en una trampa de cazadores*.',
  '🦌 Un venado que creías muerto se levantó y *te dio una patada en la cara*.',
  '🐝 Te apoyaste en un árbol equivocado y *pateaste un panal de abejas asesinas*.',
  '🐗 Un jabalí te embistió por la espalda y *rompió todo tu equipo de caza*.',
  '🐒 Un mono bajó de un árbol, te golpeó y *se robó tu billetera*.',
  '🦨 Un zorrillo te roció. Apestabas tanto que *pagaste una fortuna en jabones especiales*.',
  '🕷️ Te picó una enorme *Viuda Negra*. Los gastos médicos te dejaron pobre.',
  '🚁 Te perdiste en medio del bosque y *tuviste que pagar un helicóptero de rescate*.'
];

module.exports = {
  name: 'cazar',
  aliases: ['hunt'],
  category: 'economía',
  desc: 'Sal de cacería para ganar experiencia',

  execute: async ({ sock, remoteJid, sender, reply, fromGroup, userData }) => {
    if (!fromGroup) return reply('❌ Este comando es más divertido en grupos.');

    const userJid = cleanJid(sender);
    const pureNumber = cleanNumber(userJid);

    const now = Date.now();
    const cooldown = 5 * 60 * 1000;
    const lastCazar = cooldowns.get(userJid) || 0;
    const remaining = cooldown - (now - lastCazar);

    if (remaining > 0) {
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      return reply(`⏳ Tus presas están escondidas. Debes esperar *${m}m ${s}s* para volver a cazar.`);
    }

    cooldowns.set(userJid, now);

    const multiplicador = (userData?.inventory?.arma_pro || 0) > 0 ? 1.5 : 1;
    const avisoPro = multiplicador > 1 ? '\n🏹 *¡Tu Arco de Cacería Pro te da un bono de XP!*' : '';

    const msgSent = await sock.sendMessage(remoteJid, {
      text: `🌳 @${pureNumber} se adentra en lo profundo del bosque con su rifle en mano...`,
      mentions: [userJid]
    });
    await esperar(3000);

    try {
      await sock.sendMessage(remoteJid, {
        text: `🐾 *¡CRACK!* Se escucha una rama romperse... @${pureNumber} contiene la respiración y apunta su arma 🎯`,
        edit: msgSent.key,
        mentions: [userJid]
      });
    } catch {}
    await esperar(3500);

    const rand = Math.random() * 100;
    let premio = 0;
    let resultadoTxt = '';

    if (rand < 5) {
      premio = Math.floor(randXP(4000, 6000) * multiplicador);
      resultadoTxt = `${pick(cazaLegendaria)}${avisoPro}\n💰 Recompensa: *+${premio} XP*.`;
    } else if (rand < 20) {
      premio = Math.floor(randXP(1500, 2500) * multiplicador);
      resultadoTxt = `${pick(cazaEpica)}${avisoPro}\n💰 Recompensa: *+${premio} XP*.`;
    } else if (rand < 70) {
      premio = Math.floor(randXP(400, 1000) * multiplicador);
      resultadoTxt = `${pick(cazaNormal)}${avisoPro}\n💰 Recompensa: *+${premio} XP*.`;
    } else if (rand < 90) {
      resultadoTxt = `${pick(cazaBasura)}\n💸 No ganas nada de XP.`;
    } else {
      let castigo = randXP(500, 1000);
      if ((userData.xp || 0) < castigo) castigo = userData.xp || 0;
      userData.xp = Math.max(0, (userData.xp || 0) - castigo);
      resultadoTxt = `${pick(cazaCastigo)}\n❌ Perdiste: *-${castigo} XP*.`;
    }

    if (premio > 0) {
      userData.xp = (userData.xp || 0) + premio;
    }

    userData.level = Math.floor(0.1 * Math.sqrt(userData.xp || 0)) || 1;
    if (typeof userData.save === 'function') await userData.save();

    const finalMsg = `*RESULTADO DE LA CACERÍA* 🏹\n\n${resultadoTxt}\n👤 Cazador: @${pureNumber}`;
    try {
      await sock.sendMessage(remoteJid, { text: finalMsg, edit: msgSent.key, mentions: [userJid] });
    } catch {
      await sock.sendMessage(remoteJid, { text: finalMsg, mentions: [userJid] });
    }
  }
};
