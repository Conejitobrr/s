'use strict';

const games = new Map();

const PALABRAS = [
  // 🐾 ANIMALES (50)
  ['ELEFANTE', 'Animal terrestre más grande con trompa'], ['JIRAFA', 'Animal de cuello muy largo'], ['COCODRILO', 'Reptil grande de pantanos y ríos'],
  ['MURCIELAGO', 'Único mamífero que vuela y duerme de cabeza'], ['DELFIN', 'Mamífero marino muy inteligente'], ['BALLENA', 'El animal más grande de todo el océano'],
  ['TIBURON', 'Depredador marino con aleta dorsal y muchos dientes'], ['CANGURO', 'Animal que salta y lleva a su cría en una bolsa'], ['KOALA', 'Animal que duerme mucho y come eucalipto'],
  ['PINGUINO', 'Ave marina que no vuela y vive en el frío'], ['AVESTRUZ', 'Ave gigante que corre rápido y no vuela'], ['CAMALEON', 'Reptil que cambia de color para camuflarse'],
  ['TORTUGA', 'Animal lento con un caparazón duro'], ['SERPIENTE', 'Reptil largo que se arrastra sin patas'], ['AGUILA', 'Ave rapaz de gran vista y vuelo alto'],
  ['BUHO', 'Ave nocturna de ojos grandes que gira su cabeza'], ['HALCON', 'Ave cazadora famosa por su enorme velocidad'], ['GORILA', 'El primate más grande y fuerte de la selva'],
  ['CHIMPANCE', 'Primate muy inteligente y parecido al humano'], ['HIPOPOTAMO', 'Animal pesado que pasa el día en ríos africanos'], ['RINOCERONTE', 'Gran mamífero con uno o dos cuernos en la nariz'],
  ['LEOPARDO', 'Felino salvaje cubierto de manchas oscuras'], ['GUEPARDO', 'El animal terrestre más veloz del mundo'], ['PANTERA', 'Felino grande de pelaje completamente negro'],
  ['TIGRE', 'Gran felino salvaje con rayas negras y naranjas'], ['LEON', 'Conocido como el rey de la selva'], ['CEBRA', 'Animal parecido al caballo pero con rayas blancas y negras'],
  ['CAMELLO', 'Animal del desierto con dos jorobas'], ['DROMEDARIO', 'Animal del desierto con una sola joroba'], ['FLAMENCO', 'Ave rosada de patas muy largas'],
  ['PELICANO', 'Ave costera con una gran bolsa en el pico'], ['TUCAN', 'Ave tropical con un pico enorme y colorido'], ['LORO', 'Ave colorida capaz de imitar la voz humana'],
  ['COLIBRI', 'Pájaro diminuto que mueve las alas rapidísimo'], ['PULPO', 'Animal marino con ocho tentáculos'], ['CALAMAR', 'Molusco marino con tentáculos que lanza tinta'],
  ['MEDUSA', 'Animal marino gelatinoso que pica si lo tocas'], ['CANGREJO', 'Crustáceo con pinzas que camina de lado'], ['LANGOSTA', 'Crustáceo marino grande y muy caro en restaurantes'],
  ['ARDILLA', 'Roedor de cola esponjosa que guarda bellotas'], ['CASTOR', 'Roedor que construye represas con madera en los ríos'], ['HORMIGA', 'Insecto pequeño y muy trabajador que vive en colonias'],
  ['ABEJA', 'Insecto volador que produce miel y cera'], ['AVISPA', 'Insecto con aguijón que pica sin morir'], ['MARIPOSA', 'Insecto de alas coloridas que antes fue oruga'],
  ['ESCORPION', 'Arácnido con pinzas y un aguijón venenoso en la cola'], ['TARANTULA', 'Araña grande y peluda'], ['ESCARABAJO', 'Insecto con un caparazón duro sobre las alas'],
  ['SALTAMONTES', 'Insecto verde que da grandes saltos en el pasto'], ['LIBELULA', 'Insecto volador de cuerpo alargado y cuatro alas transparentes'],

  // 🍔 COMIDA Y BEBIDA (50)
  ['HAMBURGUESA', 'Comida rápida con carne entre dos panes redondos'], ['PIZZA', 'Masa redonda horneada con salsa de tomate y queso'], ['ESPAGUETI', 'Pasta larga y delgada de origen italiano'],
  ['LASANA', 'Capas de pasta con carne, salsa y queso al horno'], ['ENSALADA', 'Plato frío hecho con vegetales variados'], ['CHOCOLATE', 'Dulce famoso hecho a base de cacao'],
  ['HELADO', 'Postre congelado y cremoso de muchos sabores'], ['MANZANA', 'Fruta roja o verde del árbol manzano'], ['PLATANO', 'Fruta alargada de cáscara amarilla rica en potasio'],
  ['SANDIA', 'Fruta grande, verde por fuera y roja con semillas por dentro'], ['MELON', 'Fruta redonda y dulce de pulpa naranja o verde claro'], ['NARANJA', 'Fruta cítrica redonda muy usada para hacer jugo'],
  ['MANDARINA', 'Cítrico parecido a la naranja pero más pequeño y fácil de pelar'], ['FRUTILLA', 'Fruta pequeña, roja y con puntitos por fuera'], ['CEREZA', 'Fruta roja pequeña que suele ponerse sobre los pasteles'],
  ['DURAZNO', 'Fruta de piel suave y aterciopelada con un hueso grande dentro'], ['PINA', 'Fruta tropical con corona de hojas y cáscara escamosa'], ['MANGO', 'Fruta tropical muy dulce y jugosa de pulpa amarilla'],
  ['AGUACATE', 'Fruto verde y cremoso usado para hacer guacamole'], ['TOMATE', 'Fruto rojo muy usado en ensaladas y salsas'], ['LECHUGA', 'Hortaliza de hojas verdes base de las ensaladas'],
  ['ZANAHORIA', 'Vegetal alargado de color naranja que crece bajo tierra'], ['CEBOLLA', 'Vegetal en capas que te hace llorar al picarlo'], ['AJO', 'Condimento de olor muy fuerte dividido en dientes'],
  ['ARROZ', 'Cereal blanco en granos pequeños básico en la cocina mundial'], ['LENTEJAS', 'Legumbres pequeñas y marrones ricas en hierro'], ['GARBANZOS', 'Legumbres amarillas con las que se hace el hummus'],
  ['QUESO', 'Alimento sólido derivado de la leche'], ['MANTEQUILLA', 'Grasa láctea que se unta en el pan tostado'], ['YOGUR', 'Lácteo espeso y fermentado de varios sabores'],
  ['LECHE', 'Líquido blanco producido por las vacas'], ['CAFE', 'Bebida oscura y caliente que quita el sueño'], ['LIMONADA', 'Bebida refrescante hecha con agua, azúcar y limón'],
  ['CERVEZA', 'Bebida alcohólica espumosa hecha con cebada'], ['VINO', 'Bebida alcohólica hecha de uvas fermentadas'], ['PANQUEQUE', 'Tortita dulce y esponjosa para el desayuno'],
  ['GALLETA', 'Bocadillo dulce o salado horneado y crujiente'], ['PASTEL', 'Postre grande donde se ponen velas en los cumpleaños'], ['CARAMELO', 'Dulce pequeño hecho de azúcar fundido'],
  ['PALOMITAS', 'Maíz inflado que se come siempre en el cine'], ['SALCHICHA', 'Embutido alargado que va dentro del perro caliente'], ['TOCINO', 'Tiras de carne de cerdo que se fríen hasta quedar crujientes'],
  ['EMPANADA', 'Masa rellena de carne o queso cerrada y horneada o frita'], ['TORTILLA', 'Preparación redonda hecha con huevos batidos'], ['GELATINA', 'Postre colorido, transparente y tembloroso'],
  ['MERMELADA', 'Conserva dulce de frutas para untar en el pan'], ['MOSTAZA', 'Salsa amarilla de sabor fuerte para comidas rápidas'], ['MAYONESA', 'Salsa blanca y cremosa hecha con huevo y aceite'],
  ['VINAGRE', 'Líquido ácido usado para aliñar ensaladas'], ['AZUCAR', 'Polvo blanco cristalino que sirve para endulzar'],

  // 🏠 OBJETOS Y HOGAR (50)
  ['TELEVISOR', 'Aparato con pantalla para ver canales y películas en casa'], ['REFRIGERADOR', 'Electrodoméstico grande que mantiene fría la comida'], ['MICROONDAS', 'Aparato de cocina que calienta la comida en segundos'],
  ['LAVADORA', 'Máquina automática para limpiar la ropa'], ['LICUADORA', 'Electrodoméstico con cuchillas para hacer jugos y batidos'], ['ASPIRADORA', 'Máquina que succiona el polvo de los pisos y alfombras'],
  ['VENTILADOR', 'Aparato con aspas que giran para dar aire fresco'], ['ALMOHADA', 'Cojín blando donde apoyas la cabeza al dormir'], ['COLCHON', 'Pieza grande y acolchada que va sobre la cama'],
  ['SABANA', 'Tela grande y fina con la que se viste la cama'], ['FRAZADA', 'Manta gruesa para abrigarse al dormir en invierno'], ['ROPERO', 'Mueble grande con puertas donde se cuelga la ropa'],
  ['ESPEJO', 'Superficie de cristal donde ves tu propio reflejo'], ['LAMPARA', 'Objeto que sostiene un foco para dar luz a un cuarto'], ['CORTINA', 'Tela que cuelga en las ventanas para tapar el sol'],
  ['ALFOMBRA', 'Tejido grueso que se coloca en el piso para decorar'], ['SILLON', 'Asiento grande y muy cómodo con brazos en la sala'], ['ESCRITORIO', 'Mesa de trabajo o estudio donde suele ir la computadora'],
  ['ESTANTERIA', 'Mueble con varias tablas horizontales para poner libros'], ['CUCHARA', 'Cubierto cóncavo usado para tomar sopa'], ['TENEDOR', 'Cubierto con puntas o dientes para pinchar la comida'],
  ['CUCHILLO', 'Utensilio con filo metálico para cortar alimentos'], ['SARTEN', 'Recipiente redondo con mango largo para freír'], ['CACEROLA', 'Olla de metal con dos asas para cocinar al fuego'],
  ['BOTELLA', 'Recipiente de cuello estrecho para guardar líquidos'], ['PARAGUAS', 'Objeto plegable que se abre para no mojarse con la lluvia'], ['MOCHILA', 'Bolso que se lleva colgado en la espalda con dos correas'],
  ['MALETA', 'Equipaje con ruedas donde guardas ropa para viajar'], ['BILLETERA', 'Objeto pequeño de bolsillo para guardar billetes y tarjetas'], ['LLAVERO', 'Aro metálico donde se juntan las llaves de la casa'],
  ['RELOJ', 'Instrumento que sirve para medir y ver la hora'], ['GAFAS', 'Lentes con marco que se usan para ver mejor o cubrirse del sol'], ['ANILLO', 'Aro pequeño de metal que se lleva como adorno en el dedo'],
  ['COLLAR', 'Joya o cadena que se lleva alrededor del cuello'], ['PULSERA', 'Adorno que se coloca alrededor de la muñeca'], ['CEPILLO', 'Utensilio con cerdas para peinar el pelo o lavar los dientes'],
  ['TOALLA', 'Tela absorbente para secarse el cuerpo después de bañarse'], ['JABON', 'Producto que hace espuma y sirve para lavarse las manos'], ['CHAMPU', 'Líquido jabonoso especial para lavar el cabello'],
  ['PERFUME', 'Líquido aromático que se aplica para oler bien'], ['TIJERAS', 'Herramienta de dos hojas afiladas para cortar papel o tela'], ['MARTILLO', 'Herramienta pesada usada para clavar clavos'],
  ['DESTORNILLADOR', 'Herramienta manual para girar y ajustar tornillos'], ['ESCALERA', 'Estructura con peldaños que sirve para subir a lugares altos'], ['CANDADO', 'Cerradura portátil de metal que se abre con llave o combinación'],
  ['LINTERNA', 'Aparato portátil a pilas que proyecta un chorro de luz'], ['VELA', 'Cilindro de cera con una mecha que se enciende para iluminar'], ['ENCENDEDOR', 'Pequeño aparato de bolsillo que produce una llama de fuego'],
  ['BASURERO', 'Recipiente donde se tiran los desperdicios y papeles'], ['ESCOBA', 'Utensilio con palo largo para barrer el suelo'],

  // 🧬 CUERPO HUMANO Y SALUD (35)
  ['CEREBRO', 'Órgano dentro de la cabeza que controla los pensamientos'], ['CORAZON', 'Órgano del pecho que bombea sangre a todo el cuerpo'], ['PULMONES', 'Órganos encargados de la respiración'],
  ['ESTOMAGO', 'Órgano donde se digieren los alimentos que comemos'], ['HIGADO', 'Órgano grande del abdomen que limpia la sangre'], ['ESQUELETO', 'Conjunto de todos los huesos del cuerpo'],
  ['CRANEO', 'Hueso duro que protege el cerebro'], ['COSTILLAS', 'Huesos curvos que forman una caja en el pecho'], ['COLUMNA', 'Eje de huesos en la espalda que sostiene el cuerpo'],
  ['RODILLA', 'Articulación central de la pierna que permite doblarla'], ['TOBILLO', 'Articulación que une la pierna con el pie'], ['HOMBRO', 'Parte del cuerpo donde se une el brazo con el torso'],
  ['GARGANTA', 'Conducto interno del cuello por donde pasa la comida y el aire'], ['LENGUA', 'Órgano muscular de la boca con el que sentimos los sabores'], ['DIENTES', 'Piezas blancas y duras en la boca para masticar'],
  ['PESTANAS', 'Pelitos que crecen en el borde de los párpados para proteger el ojo'], ['CEJAS', 'Líneas de vello situadas encima de los ojos'], ['MEJILLA', 'Cada una de las dos partes carnosas de la cara, los cachetes'],
  ['BARBILLA', 'Parte inferior de la cara, debajo de la boca'], ['OMBLIGO', 'Cicatriz redonda que queda en el centro de la barriga'], ['SANGRE', 'Líquido rojo que circula por las venas y arterias'],
  ['MUSCULO', 'Tejido del cuerpo que se contrae para darnos fuerza y movimiento'], ['VITAMINA', 'Sustancia en las frutas necesaria para el buen funcionamiento del cuerpo'], ['VACUNA', 'Inyección que previene enfermedades graves'],
  ['JARABE', 'Medicamento líquido y dulce para calmar la tos'], ['TERMOMETRO', 'Instrumento médico para medir la fiebre'], ['AMBULANCIA', 'Vehículo con sirena que lleva enfermos al hospital'],
  ['CICATRIZ', 'Marca que queda en la piel cuando se cierra una herida'], ['ESTORNUDO', 'Expulsión violenta de aire por la nariz y la boca'], ['BOSTEZO', 'Abrir grande la boca involuntariamente por sueño o aburrimiento'],
  ['LAGRIMA', 'Gota de agua salada que sale del ojo al llorar'], ['SUDOR', 'Líquido transparente que sale por la piel cuando hace calor'], ['OXIGENO', 'Gas invisible del aire indispensable para poder respirar'],
  ['ALERGIA', 'Reacción del cuerpo al polvo, polen o ciertos alimentos'], ['FIEBRE', 'Aumento anormal de la temperatura del cuerpo por infección'],

  // 👷 PROFESIONES Y OFICIOS (35)
  ['ARQUITECTO', 'Profesional que diseña planos de casas y edificios'], ['INGENIERO', 'Experto que usa la ciencia para construir máquinas o puentes'], ['ABOGADO', 'Profesional que defiende a las personas en un juicio'],
  ['CIRUJANO', 'Médico especialista en realizar operaciones en el quirófano'], ['DENTISTA', 'Doctor especialista en cuidar los dientes y las encías'], ['VETERINARIO', 'Médico que cura y atiende a los animales'],
  ['ENFERMERO', 'Profesional de salud que cuida a los pacientes en el hospital'], ['BOMBERO', 'Persona valiente que apaga incendios con mangueras'], ['POLICIA', 'Agente encargado de mantener el orden y atrapar criminales'],
  ['DETECTIVE', 'Investigador que busca pistas para resolver crímenes'], ['PILOTO', 'Persona que maneja y vuela un avión'], ['ASTRONAUTA', 'Persona que viaja al espacio exterior en un cohete'],
  ['MARINERO', 'Persona que trabaja navegando en un barco'], ['CARPINTERO', 'Oficio de fabricar muebles y objetos trabajando la madera'], ['ELECTRICISTA', 'Técnico que instala y repara cables y enchufes de luz'],
  ['PLOMERO', 'Técnico que arregla tuberías de agua y caños rotos'], ['MECANICO', 'Especialista en reparar motores y automóviles'], ['PANADERO', 'Persona que madruga para hornear pan y pasteles'],
  ['COCINERO', 'Profesional que prepara platos deliciosos en un restaurante'], ['CARNICERO', 'Persona que corta y vende distintos tipos de carne'], ['JARDINERO', 'Persona que cuida las plantas, flores y corta el césped'],
  ['PINTOR', 'Artista que crea cuadros usando pinceles y colores'], ['ESCULTOR', 'Artista que talla estatuas en piedra, madera o barro'], ['ESCRITOR', 'Autor que inventa historias y publica libros'],
  ['PERIODISTA', 'Profesional que investiga noticias y las cuenta en televisión o diarios'], ['FOTOGRAFO', 'Profesional que captura momentos con una cámara'], ['PROFESOR', 'Persona dedicada a enseñar a los alumnos en la escuela'],
  ['CIENTIFICO', 'Investigador que hace experimentos en un laboratorio'], ['FARMACEUTICO', 'Especialista que vende medicamentos recetados'], ['CARTERO', 'Persona encargada de repartir cartas y paquetes casa por casa'],
  ['SASTRE', 'Oficio de confeccionar y arreglar trajes a medida'], ['ZAPATERO', 'Artesano que fabrica o repara el calzado'], ['PELUQUERO', 'Persona que corta y peina el cabello'],
  ['ARQUEOLOGO', 'Científico que excava ruinas antiguas y busca fósiles'], ['ASTRONOMO', 'Científico que estudia las estrellas y los planetas con telescopios'],

  // 🌍 LUGARES, NATURALEZA Y ESPACIO (45)
  ['HOSPITAL', 'Edificio donde van los enfermos para ser curados'], ['AEROPUERTO', 'Terminal grande donde despegan y aterrizan los aviones'], ['BIBLIOTECA', 'Lugar silencioso lleno de libros para leer y estudiar'],
  ['UNIVERSIDAD', 'Institución donde se estudia una carrera profesional'], ['ESCUELA', 'Lugar donde los niños van a aprender y estudiar'], ['RESTAURANTE', 'Local donde pagas para sentarte a comer platos preparados'],
  ['SUPERMERCADO', 'Tienda grande con carritos donde compras toda la comida'], ['FARMACIA', 'Tienda donde se compran medicinas y remedios'], ['TEATRO', 'Escenario con butacas donde actores representan obras en vivo'],
  ['MUSEO', 'Edificio donde se exhiben obras de arte y objetos históricos'], ['ESTADIO', 'Recinto gigante con gradas para ver partidos de fútbol o conciertos'], ['GIMNASIO', 'Local con pesas y máquinas para hacer ejercicio físico'],
  ['CEMENTERIO', 'Lugar silencioso donde están las tumbas de los difuntos'], ['CATEDRAL', 'Iglesia principal muy grande y antigua de una ciudad'], ['CASTILLO', 'Fortaleza antigua con murallas y torres donde vivían los reyes'],
  ['MONTANA', 'Gran elevación natural de tierra y roca muy alta'], ['VOLCAN', 'Montaña con un cráter por donde sale lava y ceniza'], ['DESIERTO', 'Lugar muy seco lleno de arena donde casi nunca llueve'],
  ['SELVA', 'Bosque tropical muy denso, lluvioso y lleno de animales'], ['CASCADA', 'Caída de agua de un río desde una gran altura'], ['LAGUNA', 'Depósito natural de agua más pequeño que un lago'],
  ['OCEANO', 'Masa gigantesca de agua salada que separa los continentes'], ['ISLA', 'Porción de tierra rodeada de agua por todas partes'], ['PENINSULA', 'Tierra rodeada de mar salvo por una parte unida al continente'],
  ['GLACIAR', 'Enorme masa de hielo acumulada en las zonas polares o montañas'], ['CUEVA', 'Cavidad subterránea y oscura formada entre las rocas'], ['PANTANO', 'Terreno lleno de agua estancada, lodo y vegetación'],
  ['PRADERA', 'Terreno extenso y plano cubierto de hierba y pasto'], ['ACANTILADO', 'Costa alta y rocosa que cae de forma vertical hacia el mar'], ['ARRECIFE', 'Estructura submarina llena de corales y peces de colores'],
  ['CONTINENTE', 'Cada una de las grandes extensiones de tierra como América o Europa'], ['PLANETA', 'Cuerpo celeste como la Tierra o Marte que gira alrededor del Sol'], ['GALAXIA', 'Conjunto inmenso de millones de estrellas y polvo espacial'],
  ['ESTEROIDE', 'Roca espacial que orbita alrededor del Sol'], ['COMETA', 'Cuerpo espacial de hielo y roca con una cola brillante'], ['METEORITO', 'Fragmento de roca espacial que cae y choca contra la Tierra'],
  ['UNIVERSO', 'Todo el espacio, el tiempo, las estrellas y la materia que existe'], ['ECLIPSE', 'Fenómeno en que la Luna tapa la luz del Sol o viceversa'], ['ATMOSFERA', 'Capa de gases que rodea y protege al planeta Tierra'],
  ['HORIZONTE', 'Línea lejana donde parece que se juntan el cielo y el mar'], ['LABERINTO', 'Lugar lleno de caminos confusos donde es difícil encontrar la salida'], ['OASIS', 'Sitio con agua y palmeras en medio del desierto'],
  ['FRONTERA', 'Línea divisoria que separa un país de otro'], ['CAPITAL', 'Ciudad principal de un país donde está el gobierno'], ['PUENTE', 'Construcción que permite cruzar por encima de un río o avenida'],

  // ⚽ DEPORTES, TRANSPORTE Y TECNOLOGÍA (50)
  ['FUTBOL', 'Deporte de once contra once donde se patea un balón hacia el arco'], ['BALONCESTO', 'Deporte donde se encesta una pelota naranja en un aro alto'], ['VOLEIBOL', 'Deporte donde dos equipos pasan el balón con las manos sobre una red'],
  ['BEISBOL', 'Deporte donde se golpea una pelota pequeña con un bate'], ['NATACION', 'Deporte que consiste en avanzar en el agua usando los brazos y piernas'], ['ATLETISMO', 'Deporte de carreras de velocidad, saltos y lanzamientos'],
  ['CICLISMO', 'Deporte que se practica compitiendo en bicicleta'], ['BOXEO', 'Deporte de combate en un ring usando guantes acolchados'], ['KARATE', 'Arte marcial japonés de golpes con manos y pies'],
  ['GIMNASIA', 'Deporte de gran flexibilidad, saltos y piruetas'], ['PATINAJE', 'Deslizarse sobre ruedas o sobre una pista de hielo'], ['AJEDREZ', 'Juego de mesa de estrategia con reyes, torres y peones'],
  ['BILLAR', 'Juego de mesa verde donde se golpean bolas con un taco de madera'], ['BOLICHE', 'Juego que consiste en derribar diez pinos con una bola pesada'], ['ESGRIMA', 'Deporte de combate donde se lucha con espadas o floretes'],
  ['MARATON', 'Carrera de resistencia de cuarenta y dos kilómetros'], ['PARACAIDISMO', 'Saltar desde un avión y caer suavemente con una tela gigante'], ['ALPINISMO', 'Deporte que consiste en escalar montañas muy altas'],
  ['AUTOMOVIL', 'Vehículo de cuatro ruedas con motor para transportar personas'], ['CAMIONETA', 'Vehículo más grande que un auto con espacio atrás para carga'], ['AUTOBUS', 'Vehículo largo de transporte público para muchos pasajeros'],
  ['MOTOCICLETA', 'Vehículo de dos ruedas con motor y manubrio'], ['BICICLETA', 'Vehículo de dos ruedas que avanza al mover los pedales'], ['PATINETA', 'Tabla con cuatro rueditas que se impulsa con un pie'],
  ['SUBTERRANEO', 'Tren eléctrico que viaja por túneles debajo de la ciudad'], ['HELICOPTERO', 'Aeronave que despega en vertical gracias a una gran hélice arriba'], ['COHETE', 'Nave potente que despega hacia el espacio exterior'],
  ['SUBMARINO', 'Embarcación capaz de navegar por debajo del agua'], ['VELERO', 'Barco que se mueve impulsado por la fuerza del viento en sus telas'], ['CANOA', 'Bote pequeño y estrecho que se mueve usando remos'],
  ['LOCOMOTORA', 'Vagón delantero con motor que arrastra a todo el tren'], ['TRACTOR', 'Vehículo de ruedas gigantes usado para trabajar en el campo'], ['COMPUTADORA', 'Máquina electrónica con pantalla y teclado para trabajar o jugar'],
  ['TELEFONO', 'Aparato que sirve para llamar y comunicarse a distancia'], ['TECLADO', 'Conjunto de botones con letras y números para escribir'], ['PANTALLA', 'Superficie donde se ven las imágenes del televisor o celular'],
  ['AUDIFONOS', 'Aparatos pequeños que se ponen en las orejas para escuchar música'], ['MICROFONO', 'Aparato que amplifica o graba la voz cuando hablas'], ['IMPRESORA', 'Máquina que pasa textos e imágenes de la pantalla al papel'],
  ['BATERIA', 'Pieza que almacena energía para que funcione un aparato sin enchufe'], ['CARGADOR', 'Cable que se conecta al enchufe para darle energía al celular'], ['SATELITE', 'Aparato enviado al espacio que gira alrededor de la Tierra'],
  ['TELESCOPIO', 'Instrumento óptico para ver estrellas y planetas lejanos'], ['MICROSCOPIO', 'Instrumento para ver cosas diminutas como bacterias'], ['BRUJULA', 'Instrumento con aguja imantada que siempre apunta al norte'],
  ['SEMAFORO', 'Señal de tránsito con luces roja, amarilla y verde'], ['RADAR', 'Sistema que usa ondas para detectar aviones o barcos a distancia'], ['ANTENA', 'Estructura metálica que recibe o transmite señales de radio o televisión'],
  ['ENCHUFE', 'Pieza en la pared donde se conectan los aparatos eléctricos'], ['CALCULADORA', 'Aparato portátil para hacer sumas, restas y cuentas rápidas'],

  // 🎸 MÚSICA, ARTE, CLIMA Y CONCEPTOS (45)
  ['GUITARRA', 'Instrumento musical de madera con seis cuerdas'], ['PIANO', 'Instrumento musical grande con teclas blancas y negras'], ['VIOLIN', 'Instrumento pequeño de cuatro cuerdas que se toca con un arco'],
  ['TROMPETA', 'Instrumento musical de viento hecho de metal dorado'], ['SAXOFON', 'Instrumento de viento de metal curvo muy usado en el jazz'], ['FLAUTA', 'Instrumento tubular con agujeritos que suena al soplar'],
  ['ACORDEON', 'Instrumento musical con fuelle que se abre y cierra con las manos'], ['TAMBOR', 'Instrumento de percusión que suena al golpearlo con palillos'], ['MARACAS', 'Par de instrumentos que se sacuden con las manos para dar ritmo'],
  ['ORQUESTA', 'Gran grupo de músicos tocando distintos instrumentos juntos'], ['CONCIERTO', 'Espectáculo de música en vivo frente al público'], ['MELODIA', 'Sucesión de notas musicales que forman una canción agradable'],
  ['PELICULA', 'Historia grabada en video que se proyecta en el cine'], ['COMEDIA', 'Género de películas o teatro hecho para hacer reír'], ['TRAGEDIA', 'Obra dramática con un final muy triste'],
  ['HISTORIETA', 'Relato contado con dibujos y globos de diálogo, un cómic'], ['ESCULTURA', 'Obra de arte modelada en tres dimensiones'], ['FOTOGRAFIA', 'Imagen capturada con una cámara para el recuerdo'],
  ['TORMENTA', 'Lluvia muy fuerte acompañada de vientos, truenos y rayos'], ['RELAMPAGO', 'Resplandor de luz brillante que cae del cielo en una tormenta'], ['TRUENO', 'Ruido muy fuerte que suena en el cielo después del rayo'],
  ['HURACAN', 'Ciclón tropical con vientos destructivos y lluvias intensas'], ['TORNADO', 'Remolino gigante de viento en forma de embudo que arrasa todo'], ['TERREMOTO', 'Sacudida fuerte de la tierra causada por placas internas'],
  ['TSUNAMI', 'Ola gigantesca del mar provocada por un terremoto submarino'], ['ARCOIRIS', 'Arco de siete colores que sale en el cielo cuando llueve con sol'], ['GRANIZO', 'Lluvia en forma de bolitas de hielo duro'],
  ['NEBLINA', 'Nube muy baja y espesa que dificulta ver el camino'], ['INVIERNO', 'La estación más fría de todo el año'], ['PRIMAVERA', 'Estación del año donde florecen las plantas y árboles'],
  ['VERANO', 'La estación más calurosa del año ideal para ir a la playa'], ['OTONO', 'Estación del año en que se caen las hojas secas de los árboles'], ['CALENDARIO', 'Tabla donde están ordenados los días, semanas y meses del año'],
  ['SIGLO', 'Periodo de tiempo que equivale exactamente a cien años'], ['MILENIO', 'Periodo de tiempo que equivale a mil años'], ['LIBERTAD', 'Derecho de actuar por voluntad propia sin estar prisionero'],
  ['JUSTICIA', 'Dar a cada persona lo que le corresponde según la ley'], ['AMISTAD', 'Cariño sincero y lealtad entre dos o más amigos'], ['PACIENCIA', 'Capacidad de esperar con calma sin desesperarse'],
  ['VALENTIA', 'Valor para enfrentar el miedo o el peligro'], ['SABIDURIA', 'Gran conocimiento y experiencia para tomar buenas decisiones'], ['ESPERANZA', 'Confianza de que algo bueno va a suceder'],
  ['FELICIDAD', 'Estado de ánimo de gran alegría y bienestar'], ['NOSTALGIA', 'Tristeza suave al recordar buenos momentos del pasado'], ['MISTERIO', 'Algo muy extraño o secreto que aún no tiene explicación']
];

const DIBUJOS = [
  `  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========`,
  `  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========`,
  `  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========`,
  `  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========`,
  `  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========`,
  `  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========`,
  `  +---+\n  |   |\n  💀  |\n /|\\  |\n / \\  |\n      |\n=========`
];

function normalizeInput(str = '') {
  return String(str)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function renderBoard(game) {
  const display = game.word.split('').map(l => (game.guessed.has(l) ? l : '_')).join(' ');
  return `🪢 *JUEGO DEL AHORCADO* 🪢\n\n\`\`\`${DIBUJOS[game.errors]}\`\`\`\n\n🔤 *Palabra (${game.word.length} letras):*\n${display}\n\n💡 *Pista:* _${game.pista}_\n❌ *Errores:* ${game.errors}/6\n📋 *Letras usadas:* ${[...game.guessed].join(', ') || 'Ninguna'}\n\n📌 _Escribe una letra suelta en el chat o usa *.adivinar [palabra]*_`;
}

module.exports = {
  name: 'ahorcado',
  aliases: ['colgado', 'adivinar', 'palabra'],
  category: 'juegos',
  desc: 'Juega al ahorcado con más de 350 palabras y gana XP',

  execute: async ({ sock, msg, remoteJid, sender, args, commandName, db, reply }) => {
    const cmd = commandName.toLowerCase();
    const firstArg = normalizeInput(args[0] || '');

    if (firstArg === 'FIN' || firstArg === 'RENDIRSE' || firstArg === 'SALIR') {
      if (!games.has(remoteJid)) return reply('❌ No hay ninguna partida de ahorcado activa en este grupo.');
      const game = games.get(remoteJid);
      games.delete(remoteJid);
      return reply(`🏳️ *PARTIDA CANCELADA*\n\nSe rindieron. La palabra secreta era: *${game.word}*`);
    }

    if ((cmd === 'ahorcado' || cmd === 'colgado') && !firstArg) {
      if (games.has(remoteJid)) {
        return reply(renderBoard(games.get(remoteJid)));
      }

      const [word, pista] = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
      const game = {
        word: normalizeInput(word),
        pista,
        guessed: new Set(),
        errors: 0,
        startedAt: Date.now()
      };
      games.set(remoteJid, game);
      return reply(renderBoard(game));
    }

    if (!games.has(remoteJid)) {
      return reply('❌ No hay ninguna partida activa. Inicia una escribiendo *.ahorcado*');
    }

    if (!firstArg || !/^[A-ZÑ]+$/.test(firstArg)) {
      return reply('❌ Ingresa únicamente una letra o la palabra completa sin símbolos.');
    }

    return await module.exports.processGuess({ sock, msg, remoteJid, sender, input: firstArg, db, reply });
  },

  onMessage: async ({ sock, remoteJid, body, sender, msg, db, reply }) => {
    if (!games.has(remoteJid) || !body || msg.key.fromMe) return;
    const clean = normalizeInput(body);
    if (/^[A-ZÑ]$/.test(clean)) {
      await module.exports.processGuess({ sock, msg, remoteJid, sender, input: clean, db, reply });
    }
  },

  processGuess: async ({ sock, msg, remoteJid, sender, input, db, reply }) => {
    const game = games.get(remoteJid);
    if (!game) return;

    const cleanSenderNum = String(sender).split(':')[0].split('@')[0].replace(/\D/g, '');

    if (input.length > 1) {
      if (input === game.word) {
        games.delete(remoteJid);
        if (db?.addXP) await db.addXP(sender, 1500);
        return sock.sendMessage(remoteJid, {
          text: `🎉 *¡ADIVINÓ LA PALABRA!* 🎉\n\n🏆 @${cleanSenderNum} acertó directamente: *${game.word}*\n💰 Recompensa: *+1500 XP*`,
          mentions: [sender]
        }, { quoted: msg });
      } else {
        game.errors += 1;
      }
    } else {
      if (game.guessed.has(input)) return;
      game.guessed.add(input);
      if (!game.word.includes(input)) {
        game.errors += 1;
      }
    }

    const won = game.word.split('').every(l => game.guessed.has(l));
    if (won) {
      games.delete(remoteJid);
      if (db?.addXP) await db.addXP(sender, 1500);
      return sock.sendMessage(remoteJid, {
        text: `🎉 *¡PALABRA COMPLETADA!* 🎉\n\n✅ La palabra era: *${game.word}*\n🏆 Última letra por: @${cleanSenderNum}\n💰 Premio: *+1500 XP*`,
        mentions: [sender]
      }, { quoted: msg });
    }

    if (game.errors >= 6) {
      games.delete(remoteJid);
      return reply(`💀 *¡AHORCADO!* 💀\n\n\`\`\`${DIBUJOS[6]}\`\`\`\n\nNadie pudo salvarlo.\n🔓 La palabra secreta era: *${game.word}*`);
    }

    return reply(renderBoard(game));
  }
};
