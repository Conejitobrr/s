'use strict';

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

module.exports = {
  name: 'follar',
  aliases: ['coger', 'tirar', 'violar'],
  category: 'diversión +18',
  desc: 'Comando de rol grotesco para el grupo (mencionando o respondiendo)',

  execute: async ({ sock, remoteJid, sender, msg, mentionedJid, quoted, db, reply }) => {
    try {
      // 🔥 Detecta mención con @ o el autor del mensaje al que respondiste
      const rawTarget = mentionedJid?.[0] || quoted?.sender;

      if (!rawTarget) {
        return reply('❌ Tienes que mencionar o responder al mensaje de la perra o el perro que te vas a follar.\n\n📌 *Ejemplo:*\n.follar @usuario _(o responde a su mensaje con .follar)_');
      }

      const senderClean = cleanJid(sender);
      const targetClean = cleanJid(rawTarget);

      if (targetClean === senderClean) {
        return reply('❌ No te puedes follar a ti mismo, pajero.');
      }

      const user = `@${cleanNumber(senderClean)}`;
      const target = `@${cleanNumber(targetClean)}`;

      const respuestasGrotescas = [
        `🥵 ${user} se acaba de follar a ${target} y le hizo gritar como una maldita puta. 🥵`,
        `💦 ${user} agarró a ${target} en cuatro y le dio tan duro que le desarmó la cadera. 😈`,
        `🐕 ${user} puso a ${target} como perrito y le dio hasta sacarle espuma por la boca. 🥵`,
        `🍆 ${user} le metió a ${target} hasta lo que no tiene nombre. ¡Qué maldita reventada le pegó! 💥`,
        `🛏️ ${target} se creía muy salsa hasta que ${user} se la/lo folló y le dejó el orto como bandera de Japón. 🌸`,
        `🍼 ${user} ordeñó a ${target} como vaca lechera, le sacó hasta la última gota. 💦`,
        `🔨 ${user} agarró a ${target} y le dio contra el muro como a rata en balde, ¡sin piedad! 🐀`,
        `😈 ${user} se folló a ${target} tan salvaje que los vecinos llamaron a la policía. 🚓`,
        `🌭 ${target} terminó con la boca abierta, babeando y las piernas temblando después de la cogida que le dio ${user}. 💦`,
        `🥵 ${user} le dio a ${target} una arrastrada de aquellas, le dejó el hoyo pidiendo auxilio y clemencia. 😹`,
        `🚂 ${user} le pasó por encima a ${target} como tren sin frenos. ¡Gemía como perra en celo! 🐶`,
        `💥 ${user} le rompió el culo a ${target} de una manera tan brutal que no se va a poder sentar en un mes entero. 🪑`,
        `🥩 ${user} le rellenó el pavo a ${target} con tanta fuerza que le salieron los ojos en blanco. 🦃`,
        `💦 ${target} quedó con las patas al aire y los ojos desorbitados después de que ${user} se la/lo cogiera sin asco. 🤤`,
        `🌪️ ${user} desbarató a ${target} en la cama, le dio por todos los huecos posibles hasta dejarla/lo seco. 💀`,
        `🍑 ${user} le agarró las nalgas a ${target} y se las dejó rojas de tanto darle como a cajón que no cierra. 🔥`,
        `🔥 ${user} le dio a ${target} una cogida tan asquerosa y rica que ${target} terminó rogando por más. 😈`,
        `🥛 ${user} dejó a ${target} como panadero, con toda la cara llena de leche. 💦`,
        `🥵 ${user} enterró a ${target} en el colchón a puros sentones y le sacó hasta los malos pensamientos. 🧠`,
        `💦 A ${target} le temblaban las rodillas después de que ${user} la/lo usara de putita personal toda la noche. 🧸`,
        `🍆 ${user} le reventó la garganta a ${target} a puros vergazos. ¡Qué maldita barbaridad! 🥵`,
        `🤬 ${user} agarró del pelo a ${target} y se la/lo folló tan fuerte que la/lo dejó medio pendejo/a. 🤯`,
        `🧟 ${user} le sacó el alma a ${target} a punta de pijazos, la/lo dejó como zombie en la cama. 🧟‍♀️`,
        `🚽 ${target} va a tener que cagar de pie después de la destrozada de culo que le metió ${user}. 💩`,
        `⛓️ ${user} amarró a ${target} y la/lo usó como su esclava sexual hasta dejarle los fluidos secos. ⛓️`,
        `🌭 ${user} le atragantó toda la macana a ${target} hasta dejarla/lo sin oxígeno. 😵`,
        `🕳️ ${user} le taladró el hoyo a ${target} con tanta furia que casi llega al centro de la tierra. 🌍`,
        `🐽 ${user} puso a ${target} a tragar fluidos como cerda/o en celo y la/lo hizo rogar por la última gota. 💦`,
        `🐕 ${target} terminó gateando en pelotas porque ${user} le reventó la espalda a sentones. 🔙`,
        `🍼 ${user} le dejó el vientre a ${target} rebasando de tanta leche que le bombeó adentro. 🍼`,
        `☠️ ${user} se folló a ${target} con tanto morbo que casi lo/la manda a conocer a San Pedro. 🪦`,
        `😈 ${user} le dio a ${target} por donde no entra el sol y la/lo hizo llorar del puto placer. 🥵`,
        `🥵 ${user} escupió, ahorcó y se cogió a ${target} con pura maldad, ¡y a esa perra le encantó! 😈`,
        `💦 ${user} le metió a ${target} una ensartada que le reinició el Windows a punta de mecos. 💻`,
        `🥩 ${user} dejó el culo de ${target} más abierto que las puertas de un supermercado. 🚪💨`,
        `🔨 ${user} agarró a ${target} del cuello y la/lo clavó en la pared a punta de pijazos. ¡Parecía cuadro barato! 🖼️`,
        `🚀 ${user} se la empujó a ${target} tan adentro que le tocó las amígdalas desde el fondo. 😱`,
        `🦴 ${target} sintió cómo le crujían los huesos cuando ${user} se la/lo cogió sin piedad en el piso del baño. 🚿`,
        `💦 ${user} llenó a ${target} como piñata de cumpleaños, le salían fluidos por donde la/lo miraras. 🪅`,
        `🔥 ${user} dejó a ${target} caminando chueco como pingüino mareado después de semejante follada. 🐧`,
        `🔌 ${target} quedó con un cortocircuito mental después de la penetrada infernal que le dio ${user}. ⚡`,
        `🍆 ${user} usó a ${target} como muñeca inflable toda la noche, ni para respirar le dio tiempo. 🎈`,
        `🩸 ${user} se folló a ${target} tan sucio que le dejó el asterisco latiendo como corazón asustado. 💓`,
        `🥵 ${target} rogaba que parara, pero ${user} se la/lo rellenó con tanta leche que la/lo dejó empalagado/a. 🍼`,
        `🚜 ${user} le aró el terreno a ${target} con la verga, ¡la/lo dejó listo/a para sembrar papas! 🥔`,
        `🌪️ ${target} fue succionado/a por el huracán de pasión de ${user}, terminó destrozado/a y babeando en una esquina. 🤤`,
        `🕳️ ${user} descubrió un pozo sin fondo en el culo de ${target} y lo llenó de pura crema blanca. 🍦`,
        `💀 ${user} le hizo un exorcismo de semen a ${target}, le sacó hasta el último demonio a puros gritos. 👿`,
        `🐕 ${user} amarró a ${target} de la cama y se la/lo folló tan fuerte que rompió la puta base de madera. 🛏️💥`,
        `😈 ${user} obligó a ${target} a tragarse todo su orgullo y 3 litros de su leche condensada. 🥫`,
        `🔥 ${user} le dio de cenar mucha proteína caliente a ${target}, lo/la dejó relamiéndose los bigotes. 🐱`,
        `🥩 ${target} se creía muy difícil hasta que ${user} se lo/la cogió y le dejó la cara enterrada en la almohada. 🛏️`,
        `🍆 ${user} perforó a ${target} con tanta fuerza que casi le saca la verga por el ombligo. 🎯`,
        `🚑 Tuvieron que llamar a la ambulancia porque ${user} le descolocó la mandíbula a ${target} a punta de vergazos. 🏥`,
        `💦 ${user} lavó a ${target} por dentro y por fuera con pura leche caliente. ¡Qué buen servicio! 🛁`,
        `🔪 ${user} descuartizó la virginidad de ${target} con una follada que pasará a la historia. 📜`,
        `💣 ${user} soltó una bomba de fluidos adentro de ${target} que le reventó las tripas de placer. 💥`,
        `🐾 ${target} quedó suplicando de rodillas para que ${user} se la metiera una vez más. 🙏`,
        `🔩 ${user} atornilló a ${target} contra la puerta hasta que la perra/perro aprendió quién manda. 🚪`,
        `🌋 ${user} entró en erupción y bañó a ${target} con magma blanca y espesa. 🥵`,
        `🍗 ${user} agarró a ${target} de las piernas como pollo asado y se lo/la devoró por completo. 🤤`,
        `🥵 ${target} va a necesitar terapia psicológica después de las asquerosidades ricas que le hizo ${user}. 🧠`,
        `🔨 ${user} usó el culo de ${target} de funda toda la madrugada, lo/la dejó aguado/a de tanta fricción. 🪚`,
        `🍼 ${target} abrió la boca y ${user} le reventó el hocico con pura crema batida natural. 🍰`,
        `🚀 ${user} mandó a ${target} directo a la luna a base de puro choque de pelvis, ¡qué viaje! 🌕`,
        `🐷 ${user} le rellenó las entrañas a ${target} de una forma tan sucia que hasta a Satanás le dio asco. 😈`,
        `💦 ${target} quedó como trapeador sucio, escurriendo fluidos por culpa de ${user}. 🧹`,
        `🍆 ${user} encajó a ${target} en su instrumento y lo/la hizo sonar como violín desafinado. 🎻`,
        `🪚 ${user} cortó la respiración de ${target} metiéndosela hasta la garganta, la perra/o no podía ni toser. 🗣️`,
        `🔥 ${user} chamuscó los gemidos de ${target} a puros besos sucios y mordidas en las nalgas. 🍑`,
        `⛓️ ${user} encadenó a ${target} a la cama y se la/lo folló hasta que cantó el himno nacional. 🎶`,
        `🕳️ ${target} tiene el hoyo tan desgarrado que podría usarlo de bolsillo gracias a ${user}. 👖`,
        `🌭 ${user} le sirvió el menú completo a ${target} y lo/la obligó a no dejar ni una sola gota en el plato. 🍽️`,
        `🐕 ${target} andaba de zorra/zorro hasta que ${user} la/lo domesticó a punta de palos de carne. 🍖`,
        `💦 ${user} le echó crema a los tacos de ${target} y la/lo dejó llorando de la enchilada de placer que le dio. 🌮`,
        `💀 ${user} aniquiló la inocencia de ${target} dejándola/lo retorciéndose en un charco de fluidos. 🏊‍♂️`,
        `🍆 ${user} apuñaló con carne a ${target} repetidas veces, lo/la dejó suplicando por su vida (y por más). 🔪`,
        `🔩 ${user} le cambió el aceite a ${target} con una potente inyección de fluidos viscosos. 🛢️`,
        `🥵 ${target} temblaba como lavadora vieja cuando ${user} le metió el centrifugado máximo. 🧺`,
        `🔥 ${user} hizo que ${target} olvidara su propio nombre a base de puro sexo puerco. 🐷`,
        `💦 ${user} exprimió a ${target} como limón viejo y le sacó todo el jugo en una sola sentada. 🍋`,
        `🍼 ${target} amaneció con el estómago hinchado de toda la leche que le metió ${user} en la madrugada. 🤰`,
        `💥 ${user} le pegó tan duro a ${target} que le movió el cerebro de lugar, ahora solo sabe gemir. 🧠💦`,
        `🍑 ${user} aplaudió con las nalgas de ${target} a tal velocidad que rompió la barrera del sonido. 💨`,
        `😈 ${user} agarró a ${target} y le demostró por qué es el rey/reina de las folladas salvajes. ¡Amén! 🙏`
      ];

      const textoAleatorio = respuestasGrotescas[Math.floor(Math.random() * respuestasGrotescas.length)];

      await sock.sendMessage(remoteJid, {
        text: textoAleatorio,
        mentions: [senderClean, targetClean]
      }, { quoted: msg });

      if (db && typeof db.addXP === 'function') {
        await db.addXP(senderClean, Math.floor(Math.random() * 8) + 2);
      }
    } catch (err) {
      console.log('❌ Error en plugin follar:', err?.message || err);
      return reply('❌ Ocurrió un error al ejecutar el comando.');
    }
  }
};
