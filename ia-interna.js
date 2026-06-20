// ============================================
// 🤖 IA INTERNA AVANZADA - 100% INTERNA
// ============================================
// Sin APIs externas, todo funciona en tu servidor
// Versión 2.0 - Corregida y optimizada

const natural = require('natural');

// ============================================
// 🧠 BASE DE CONOCIMIENTO EN ESPAÑOL
// ============================================
const BASE_CONOCIMIENTO = {
  // Sinónimos organizados por categorías
  sinonimos: {
    dinero: {
      palabras: ['dinero', 'plata', 'cash', 'efectivo', 'billete', 'moneda', 'saldo', 'balance', 'capital', 'fondos', 'recursos', 'presupuesto', 'ingreso', 'gasto', 'pago', 'cobro', 'factura', 'recibo', 'ticket', 'comprobante', 'divisa', 'euro', 'dólar', 'dolar', 'peso', 'libra', 'yuan', 'bitcoin', 'cripto', 'criptomoneda', 'billetera', 'wallet'],
      categoria: 'finanzas',
      icono: '💰'
    },
    foto: {
      palabras: ['foto', 'fotografía', 'fotografia', 'imagen', 'picture', 'selfie', 'retrato', 'captura', 'instantánea', 'instantanea', 'shot', 'pic', 'img', 'visual', 'gráfica', 'grafica', 'paisaje', 'panorámica', 'panoramica', 'macro', 'closeup', 'fotolog'],
      categoria: 'multimedia',
      icono: '📸'
    },
    video: {
      palabras: ['video', 'vídeo', 'video', 'película', 'pelicula', 'film', 'clip', 'corto', 'largometraje', 'documental', 'serie', 'episodio', 'capítulo', 'capitulo', 'grabación', 'grabacion', 'animación', 'animacion', 'trailer', 'tutorial', 'vlog', 'streaming'],
      categoria: 'multimedia',
      icono: '🎬'
    },
    musica: {
      palabras: ['música', 'musica', 'canción', 'cancion', 'tema', 'track', 'audio', 'mp3', 'wav', 'podcast', 'melodía', 'melodia', 'ritmo', 'beat', 'álbum', 'album', 'disco', 'sonido', 'tonada', 'himno', 'instrumental', 'playlist'],
      categoria: 'audio',
      icono: '🎵'
    },
    documento: {
      palabras: ['documento', 'archivo', 'pdf', 'word', 'excel', 'powerpoint', 'texto', 'escrito', 'informe', 'reporte', 'ensayo', 'artículo', 'articulo', 'paper', 'tesis', 'manual', 'guía', 'guia', 'tutorial', 'ebook', 'libro', 'revista'],
      categoria: 'documentos',
      icono: '📄'
    },
    trabajo: {
      palabras: ['trabajo', 'empleo', 'job', 'cv', 'curriculum', 'currículum', 'hoja de vida', 'resume', 'profesión', 'profesion', 'carrera', 'ocupación', 'ocupacion', 'oficio', 'chamba', 'laboral', 'empresa', 'negocio', 'oficina', 'freelance', 'proyecto'],
      categoria: 'profesional',
      icono: '💼'
    },
    estudio: {
      palabras: ['estudio', 'educación', 'educacion', 'aprendizaje', 'clase', 'curso', 'universidad', 'escuela', 'colegio', 'academia', 'tesis', 'examen', 'tarea', 'homework', 'materia', 'asignatura', 'carrera', 'grado', 'master', 'maestría', 'maestria', 'doctorado', 'bachillerato', 'diplomado'],
      categoria: 'educacion',
      icono: '📚'
    },
    salud: {
      palabras: ['salud', 'médico', 'medico', 'doctor', 'hospital', 'enfermedad', 'tratamiento', 'medicina', 'receta', 'diagnóstico', 'diagnostico', 'consulta', 'terapia', 'análisis', 'analisis', 'examen', 'síntoma', 'sintoma', 'dieta', 'nutrición', 'nutricion', 'ejercicio', 'fitness', 'vitaminas'],
      categoria: 'salud',
      icono: '🏥'
    },
    legal: {
      palabras: ['legal', 'ley', 'contrato', 'abogado', 'demanda', 'juicio', 'notario', 'escritura', 'poder', 'testamento', 'herencia', 'divorcio', 'custodia', 'firma', 'acuerdo', 'cláusula', 'clausula', 'jurídico', 'juridico', 'litigio', 'sentencia'],
      categoria: 'legal',
      icono: '⚖️'
    },
    viaje: {
      palabras: ['viaje', 'turismo', 'vuelo', 'hotel', 'destino', 'itinerario', 'reserva', 'maleta', 'pasaporte', 'visa', 'excursión', 'excursion', 'tour', 'aventura', 'vacaciones', 'playa', 'montaña', 'montana', 'ciudad', 'hostal', 'mochilero'],
      categoria: 'viajes',
      icono: '✈️'
    },
    casa: {
      palabras: ['casa', 'hogar', 'familia', 'inmueble', 'propiedad', 'apartamento', 'departamento', 'alquiler', 'renta', 'hipoteca', 'mudanza', 'decoración', 'decoracion', 'mueble', 'jardín', 'jardin', 'habitación', 'habitacion', 'cocina', 'baño'],
      categoria: 'hogar',
      icono: '🏠'
    },
    tecnologia: {
      palabras: ['tecnología', 'tecnologia', 'código', 'codigo', 'programa', 'software', 'app', 'aplicación', 'aplicacion', 'sistema', 'plataforma', 'web', 'internet', 'red', 'servidor', 'base de datos', 'algoritmo', 'script', 'python', 'javascript', 'html', 'css', 'api', 'cloud', 'nube'],
      categoria: 'tecnologia',
      icono: '💻'
    },
    cocina: {
      palabras: ['cocina', 'receta', 'comida', 'ingrediente', 'plato', 'postre', 'salsa', 'gourmet', 'chef', 'restaurante', 'menú', 'menu', 'despensa', 'hornear', 'freír', 'freir', 'cocinar', 'gastronomía', 'gastronomia', 'delicioso'],
      categoria: 'gastronomia',
      icono: '🍳'
    },
    deporte: {
      palabras: ['deporte', 'fútbol', 'futbol', 'basket', 'tenis', 'gym', 'gimnasio', 'entrenamiento', 'ejercicio', 'atleta', 'competencia', 'partido', 'equipo', 'jugador', 'marcas', 'récord', 'record', 'maratón', 'maraton', 'crossfit'],
      categoria: 'deportes',
      icono: '⚽'
    },
    arte: {
      palabras: ['arte', 'pintura', 'dibujo', 'escultura', 'diseño', 'diseno', 'creatividad', 'artista', 'galería', 'galeria', 'museo', 'exposición', 'exposicion', 'ilustración', 'ilustracion', 'gráfica', 'grafica', 'digital', 'tradicional', 'boceto'],
      categoria: 'arte',
      icono: '🎨'
    },
    marketing: {
      palabras: ['marketing', 'mercadotecnia', 'publicidad', 'publicitario', 'seo', 'sem', 'redes sociales', 'instagram', 'facebook', 'tiktok', 'twitter', 'youtube', 'influencer', 'campaña', 'campana', 'branding', 'engagement', 'followers', 'seguidores'],
      categoria: 'marketing',
      icono: '📢'
    },
    seguridad: {
      palabras: ['seguridad', 'password', 'contraseña', 'clave', 'cifrado', 'encriptación', 'encriptacion', 'hacker', 'virus', 'malware', 'firewall', 'antivirus', 'backup', 'copia de seguridad', 'phishing', 'autenticación', 'autenticacion'],
      categoria: 'seguridad',
      icono: '🔒'
    }
  },

  // Intenciones del usuario
  intenciones: {
    buscar: ['buscar', 'encontrar', 'localizar', 'dónde está', 'donde esta', 'cuál es', 'cual es', 'qué es', 'que es'],
    comprar: ['comprar', 'adquirir', 'pagar', 'quiero', 'necesito', 'obtener', 'adquirir', 'me llevo'],
    vender: ['vender', 'publicar', 'ofrecer', 'listar', 'poner en venta', 'subir precio'],
    subir: ['subir', 'upload', 'guardar', 'agregar', 'añadir', 'cargar', 'importar'],
    eliminar: ['eliminar', 'borrar', 'quitar', 'remover', 'sacar', 'suprimir'],
    compartir: ['compartir', 'enviar', 'mandar', 'dar acceso', 'regalar'],
    preguntar: ['cómo', 'como', 'cuándo', 'cuando', 'por qué', 'porque', 'cuánto', 'cuanto', 'quién', 'quien']
  },

  // Stopwords en español (palabras que se ignoran)
  stopwords: [
    'de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'las', 'un', 'con', 'para',
    'que', 'qué', 'es', 'son', 'al', 'lo', 'como', 'cómo', 'más', 'mas', 'pero',
    'sus', 'su', 'le', 'ya', 'o', 'este', 'esta', 'este', 'entre', 'cuando',
    'muy', 'sin', 'sobre', 'ser', 'también', 'tambien', 'me', 'hasta', 'hay',
    'donde', 'dónde', 'quien', 'quién', 'desde', 'todo', 'todos', 'todas',
    'nos', 'mi', 'mis', 'tu', 'tus', 'ellas', 'ellos', 'mío', 'tuyo'
  ],

  // Patrones para auto-clasificación (MEJORADOS)
  patronesClasificacion: [
    { regex: /\b(factura|recibo|invoice|bill|ticket|nota de venta)\b/i, categoria: 'finanzas' },
    { regex: /\b(cv|curriculum|currículum|hoja.?de.?vida|resume|perfil profesional)\b/i, categoria: 'profesional' },
    { regex: /\b(tesis|paper|ensayo|artículo|articulo|investigación|investigacion)\b/i, categoria: 'educacion' },
    { regex: /\b(contrato|acuerdo|convenio|legal|demanda)\b/i, categoria: 'legal' },
    { regex: /\b(receta|cocina|comida|ingrediente|gastronomía)\b/i, categoria: 'gastronomia' },
    { regex: /\b(foto|fotografía|imagen|picture|selfie|retrato)\b/i, categoria: 'multimedia' },
    { regex: /\b(video|película|pelicula|clip|tutorial|documental)\b/i, categoria: 'multimedia' },
    { regex: /\b(canción|cancion|música|musica|audio|podcast|álbum|album)\b/i, categoria: 'audio' },
    { regex: /\b(código|codigo|script|programa|app|aplicación|aplicacion)\b/i, categoria: 'tecnologia' },
    { regex: /\b(plan de marketing|campaña|campana|publicidad|seo|redes sociales)\b/i, categoria: 'marketing' },
    { regex: /\b(password|contraseña|clave|cifrado|backup|copia de seguridad)\b/i, categoria: 'seguridad' },
    { regex: /\b(viaje|vacaciones|turismo|itinerario|reserva hotel)\b/i, categoria: 'viajes' },
    { regex: /\b(ejercicio|rutina|entrenamiento|dieta|nutrición|nutricion)\b/i, categoria: 'salud' },
    { regex: /\b(pintura|dibujo|diseño|diseno|ilustración|ilustracion)\b/i, categoria: 'arte' },
    { regex: /\b(partido|fútbol|futbol|entrenamiento deportivo|competencia)\b/i, categoria: 'deportes' },
    { regex: /\b(hipoteca|alquiler|renta|inmueble|apartamento|departamento)\b/i, categoria: 'hogar' }
  ],

  // Correcciones ortográficas comunes
  correccionesComunes: {
    'presupesto': 'presupuesto',
    'fotográfia': 'fotografía',
    'fotografia': 'fotografía',
    'musíca': 'música',
    'tecnólogia': 'tecnología',
    'educción': 'educación',
    'salúd': 'salud',
    'vídeo': 'video',
    'pelicúla': 'película',
    'canción': 'canción',
    'dólar': 'dólar',
    'atravez': 'a través',
    'haber': 'haber',
    'hay': 'hay'
  }
};

// ============================================
// 🔧 FUNCIONES AUXILIARES
// ============================================

// Normaliza texto: quita acentos y pasa a minúsculas
function normalizarTexto(texto) {
  if (!texto) return '';
  return texto
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita acentos
    .trim();
}

// Tokeniza y limpia un texto
function tokenizarYLimpiar(texto) {
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(normalizarTexto(texto)) || [];
  
  // Filtrar stopwords
  return tokens.filter(t => 
    t.length > 2 && 
    !BASE_CONOCIMIENTO.stopwords.includes(t)
  );
}

// ============================================
// 🔍 MOTOR DE BÚSQUEDA INTELIGENTE
// ============================================
class MotorBusquedaIA {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutos
    this.MAX_CACHE_SIZE = 500;
    
    logger?.info?.('🤖 Motor de IA inicializado');
  }

  // ==========================================
  // 🔎 ANÁLISIS COMPLETO DE TEXTO
  // ==========================================
  analizar(texto) {
    if (!texto || typeof texto !== 'string') {
      return {
        textoOriginal: '',
        tokens: [],
        intencion: 'buscar',
        terminosExpandidos: [],
        categorias: [],
        terminosConPeso: [],
        esPregunta: false,
        sugerencias: [],
        entidades: []
      };
    }

    const textoLimpio = texto.toLowerCase().trim();
    const textoNormalizado = normalizarTexto(texto);
    const tokens = tokenizarYLimpiar(texto);
    
    // Aplicar stemming a los tokens
    const tokensStemmed = tokens.map(t => this.stemmer.stem(t));
    
    // Detectar intención
    const intencion = this.detectarIntencion(tokens);
    
    // Expandir con sinónimos
    const terminosExpandidos = this.expandirSinonimos(tokens);
    
    // Detectar categorías
    const categorias = this.detectarCategorias(terminosExpandidos);
    
    // Detectar entidades (fechas, montos, emails)
    const entidades = this.detectarEntidades(texto);
    
    // Sugerir correcciones ortográficas
    const sugerencias = this.sugerirCorrecciones(tokens);
    
    // Calcular relevancia de cada término
    const terminosConPeso = terminosExpandidos.map(t => ({
      termino: t,
      peso: this.calcularPeso(t, terminosExpandidos.length)
    }));
    
    return {
      textoOriginal: texto,
      textoNormalizado,
      tokens,
      tokensStemmed,
      intencion,
      terminosExpandidos,
      categorias,
      terminosConPeso,
      esPregunta: this.esPregunta(tokens, texto),
      sugerencias,
      entidades,
      totalTerminos: terminosExpandidos.length
    };
  }

  // ==========================================
  // 🎯 DETECTAR INTENCIÓN (MEJORADO)
  // ==========================================
  detectarIntencion(tokens) {
    // Buscar coincidencias EXACTAS de palabras completas
    for (const [intencion, palabras] of Object.entries(BASE_CONOCIMIENTO.intenciones)) {
      for (const token of tokens) {
        // Coincidencia exacta (no parcial)
        if (palabras.some(p => normalizarTexto(p) === token)) {
          return intencion;
        }
      }
    }
    return 'buscar'; // Por defecto
  }

  // ==========================================
  // 🔄 EXPANDIR CON SINÓNIMOS (MEJORADO)
  // ==========================================
  expandirSinonimos(tokens) {
    const expandidos = new Set(tokens);
    
    for (const token of tokens) {
      const tokenNorm = normalizarTexto(token);
      
      for (const [categoria, data] of Object.entries(BASE_CONOCIMIENTO.sinonimos)) {
        // Buscar coincidencia exacta o muy cercana
        const match = data.palabras.find(p => 
          normalizarTexto(p) === tokenNorm ||
          this.stemmer.stem(normalizarTexto(p)) === this.stemmer.stem(tokenNorm)
        );
        
        if (match) {
          // Añadir solo 3 sinónimos principales (no todos)
          data.palabras.slice(0, 3).forEach(sinonimo => {
            expandidos.add(normalizarTexto(sinonimo));
          });
          break; // Ya encontramos la categoría, no seguir buscando
        }
      }
    }
    
    return Array.from(expandidos);
  }

  // ==========================================
  // 🏷️ DETECTAR CATEGORÍAS
  // ==========================================
  detectarCategorias(terminos) {
    const categorias = new Set();
    
    for (const termino of terminos) {
      const terminoNorm = normalizarTexto(termino);
      
      for (const [cat, data] of Object.entries(BASE_CONOCIMIENTO.sinonimos)) {
        if (data.palabras.some(p => normalizarTexto(p) === terminoNorm)) {
          categorias.add(cat);
        }
      }
    }
    
    return Array.from(categorias);
  }

  // ==========================================
  // ⚖️ CALCULAR PESO (TF-IDF BÁSICO)
  // ==========================================
  calcularPeso(termino, totalTerminos) {
    const terminoNorm = normalizarTexto(termino);
    
    // Términos más específicos pesan más
    let peso = 1.0;
    if (terminoNorm.length > 10) peso = 1.8;
    else if (terminoNorm.length > 7) peso = 1.5;
    else if (terminoNorm.length > 5) peso = 1.3;
    else if (terminoNorm.length < 4) peso = 0.7;
    
    // Penalizar términos muy comunes
    const muyComunes = ['archivo', 'documento', 'archivo', 'cosa', 'tipo'];
    if (muyComunes.includes(terminoNorm)) peso *= 0.5;
    
    // Bonus si hay pocos términos (búsqueda específica)
    if (totalTerminos <= 2) peso *= 1.3;
    
    return peso;
  }

  // ==========================================
  // ❓ DETECTAR PREGUNTA (MEJORADO)
  // ==========================================
  esPregunta(tokens, textoOriginal) {
    // Si tiene signo de interrogación, es pregunta
    if (textoOriginal && textoOriginal.includes('?')) return true;
    
    // Palabras que indican pregunta (coincidencia exacta)
    const palabrasPregunta = ['que', 'como', 'cuando', 'donde', 'porque', 'cual', 'quien', 'cuanto', 'por que'];
    return tokens.some(t => palabrasPregunta.includes(normalizarTexto(t)));
  }

  // ==========================================
  // 🔍 BUSCAR FUZZY (CORREGIDO)
  // ==========================================
  buscarFuzzy(texto, listaArchivos, maxResultados = 20) {
    if (!texto || !listaArchivos || listaArchivos.length === 0) {
      return [];
    }
    
    // Verificar caché
    const cacheKey = `${texto}_${listaArchivos.length}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.resultado;
    }
    
    const analisis = this.analizar(texto);
    const resultados = [];
    
    for (const archivo of listaArchivos) {
      const titulo = normalizarTexto(archivo.titulo || '');
      const descripcion = normalizarTexto(archivo.descripcion || '');
      const categoria = normalizarTexto(archivo.categoria || '');
      const textoArchivo = `${titulo} ${descripcion} ${categoria}`;
      
      // Tokenizar el texto del archivo para comparación justa
      const tokensArchivo = tokenizarYLimpiar(textoArchivo);
      
      let puntaje = 0;
      const coincidencias = [];
      
      // Puntaje por coincidencia exacta de términos expandidos
      for (const termino of analisis.terminosExpandidos) {
        const terminoNorm = normalizarTexto(termino);
        
        // Coincidencia en título (más importante)
        if (titulo.includes(terminoNorm)) {
          puntaje += this.calcularPeso(termino, analisis.terminosExpandidos.length) * 15;
          coincidencias.push(termino);
        }
        // Coincidencia en descripción
        else if (descripcion.includes(terminoNorm)) {
          puntaje += this.calcularPeso(termino, analisis.terminosExpandidos.length) * 8;
          coincidencias.push(termino);
        }
        // Coincidencia por token individual
        else if (tokensArchivo.includes(terminoNorm)) {
          puntaje += this.calcularPeso(termino, analisis.terminosExpandidos.length) * 5;
          coincidencias.push(termino);
        }
      }
      
      // Puntaje por coincidencia fuzzy (Levenshtein) - CORREGIDO
      for (const termino of analisis.tokens) {
        const terminoNorm = normalizarTexto(termino);
        
        // Comparar con cada palabra del archivo, NO con todo el texto
        for (const palabraArchivo of tokensArchivo) {
          const distancia = natural.LevenshteinDistance(palabraArchivo, terminoNorm);
          
          if (distancia === 1 && palabraArchivo.length > 4) {
            puntaje += 3; // Error ortográfico menor
          } else if (distancia === 2 && palabraArchivo.length > 6) {
            puntaje += 1; // Error ortográfico mayor
          }
          
          // Stemming match
          if (this.stemmer.stem(palabraArchivo) === this.stemmer.stem(terminoNorm)) {
            puntaje += 4;
          }
        }
      }
      
      // Bonus por categoría coincidente
      if (categoria && analisis.categorias.includes(categoria)) {
        puntaje += 20;
      }
      
      // Bonus por popularidad (si el archivo tiene ventas o likes)
      if (archivo.sales) puntaje += Math.min(archivo.sales, 10);
      if (archivo.likes) puntaje += Math.min(archivo.likes, 5);
      
      if (puntaje > 0) {
        resultados.push({
          archivo,
          puntaje: Math.round(puntaje * 100) / 100,
          coincidencias: [...new Set(coincidencias)],
          matchCategoria: analisis.categorias.includes(categoria)
        });
      }
    }
    
    // Ordenar por puntaje
    const resultado = resultados
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, maxResultados);
    
    // Guardar en caché
    this.cache.set(cacheKey, { resultado, timestamp: Date.now() });
    
    // Limpiar caché si crece mucho
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.cache.delete(oldest[0]);
    }
    
    return resultado;
  }

  // ==========================================
  // 🏷️ CLASIFICAR ARCHIVO AUTOMÁTICAMENTE
  // ==========================================
  clasificarArchivo(nombre, descripcion = '') {
    const texto = `${nombre} ${descripcion}`.toLowerCase();
    const categoriasDetectadas = [];
    
    // Primero intentar con patrones regex
    for (const patron of BASE_CONOCIMIENTO.patronesClasificacion) {
      if (patron.regex.test(texto)) {
        categoriasDetectadas.push(patron.categoria);
      }
    }
    
    // Si no detecta nada, usar análisis de tokens
    if (categoriasDetectadas.length === 0) {
      const analisis = this.analizar(texto);
      categoriasDetectadas.push(...analisis.categorias);
    }
    
    // Determinar categoría principal
    const categoriaPrincipal = categoriasDetectadas[0] || 'otros';
    
    return {
      categoriaPrincipal,
      categorias: [...new Set(categoriasDetectadas)],
      tags: this.generarTags(texto),
      confianza: categoriasDetectadas.length > 0 ? 'alta' : 'baja',
      icono: BASE_CONOCIMIENTO.sinonimos[categoriaPrincipal]?.icono || '📁'
    };
  }

  // ==========================================
  // 🏷️ GENERAR TAGS AUTOMÁTICOS
  // ==========================================
  generarTags(texto) {
    const tags = new Set();
    const tokens = tokenizarYLimpiar(texto);
    
    for (const token of tokens) {
      if (token.length > 3) {
        for (const [cat, data] of Object.entries(BASE_CONOCIMIENTO.sinonimos)) {
          if (data.palabras.some(p => normalizarTexto(p) === token)) {
            tags.add(data.icono + ' ' + cat);
            break;
          }
        }
      }
    }
    
    return Array.from(tags).slice(0, 5);
  }

  // ==========================================
  // 💡 RECOMENDAR SIMILARES (CORREGIDO)
  // ==========================================
  recomendarSimilares(archivoActual, todosArchivos, limite = 5) {
    if (!archivoActual || !todosArchivos) return [];
    
    const archivosSimilares = [];
    const idActual = archivoActual._id?.toString() || archivoActual.id;
    
    for (const archivo of todosArchivos) {
      const idOtro = archivo._id?.toString() || archivo.id;
      
      // Saltar el mismo archivo (CORREGIDO)
      if (idOtro === idActual) continue;
      
      let similitud = 0;
      
      // Misma categoría = +10
      if (archivo.categoria === archivoActual.categoria && archivo.categoria) {
        similitud += 10;
      }
      
      // Mismo vendedor = +5 (CORREGIDO para usar userUid)
      if ((archivo.userId === archivoActual.userId || 
           archivo.userUid === archivoActual.userUid) && archivo.userUid) {
        similitud += 5;
      }
      
      // Tags en común
      const tagsActuales = archivoActual.tags || [];
      const tagsOtro = archivo.tags || [];
      const comunes = tagsActuales.filter(t => tagsOtro.includes(t));
      similitud += comunes.length * 3;
      
      // Palabras en común en título
      const tituloActual = tokenizarYLimpiar(archivoActual.titulo || '');
      const tituloOtro = tokenizarYLimpiar(archivo.titulo || '');
      const palabrasComunes = tituloActual.filter(p => 
        tituloOtro.includes(p) && p.length > 3
      );
      similitud += palabrasComunes.length * 2;
      
      // Rango de precio similar (si aplica)
      if (archivo.price && archivoActual.price) {
        const diff = Math.abs(archivo.price - archivoActual.price);
        const promedio = (archivo.price + archivoActual.price) / 2;
        if (diff / promedio < 0.3) { // 30% de diferencia
          similitud += 3;
        }
      }
      
      if (similitud > 0) {
        archivosSimilares.push({ archivo, similitud });
      }
    }
    
    return archivosSimilares
      .sort((a, b) => b.similitud - a.similitud)
      .slice(0, limite)
      .map(r => r.archivo);
  }

  // ==========================================
  // 🔍 DETECTAR ENTIDADES (NUEVO)
  // ==========================================
  detectarEntidades(texto) {
    const entidades = {
      emails: [],
      montos: [],
      fechas: [],
      urls: []
    };
    
    // Emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    entidades.emails = texto.match(emailRegex) || [];
    
    // Montos de dinero ($100, 50€, etc.)
    const montoRegex = /(?:\$|€|£)?\s*\d+(?:[.,]\d+)?(?:\s*(?:dólares|euros|pesos|usd|eur))?/gi;
    entidades.montos = texto.match(montoRegex) || [];
    
    // URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    entidades.urls = texto.match(urlRegex) || [];
    
    // Fechas (formato común)
    const fechaRegex = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g;
    entidades.fechas = texto.match(fechaRegex) || [];
    
    return entidades;
  }

  // ==========================================
  // ✏️ SUGERIR CORRECCIONES ORTOGRÁFICAS (NUEVO)
  // ==========================================
  sugerirCorrecciones(tokens) {
    const sugerencias = [];
    
    for (const token of tokens) {
      const tokenNorm = normalizarTexto(token);
      
      // Buscar en correcciones conocidas
      for (const [error, correccion] of Object.entries(BASE_CONOCIMIENTO.correccionesComunes)) {
        if (normalizarTexto(error) === tokenNorm) {
          sugerencias.push({ original: token, sugerencia: correccion });
          break;
        }
      }
      
      // Si no está en correcciones conocidas, buscar con Levenshtein en sinónimos
      if (sugerencias.length === 0 || sugerencias[sugerencias.length - 1].original !== token) {
        for (const data of Object.values(BASE_CONOCIMIENTO.sinonimos)) {
          for (const palabra of data.palabras) {
            const palabraNorm = normalizarTexto(palabra);
            if (palabraNorm === tokenNorm) continue;
            
            const distancia = natural.LevenshteinDistance(tokenNorm, palabraNorm);
            if (distancia === 1 && tokenNorm.length > 4) {
              sugerencias.push({ original: token, sugerencia: palabra });
              break;
            }
          }
        }
      }
    }
    
    return sugerencias.slice(0, 5);
  }

  // ==========================================
  // 🌍 DETECTAR IDIOMA (NUEVO)
  // ==========================================
  detectarIdioma(texto) {
    const textoNorm = normalizarTexto(texto);
    
    // Palabras indicador de español
    const palabrasES = ['que', 'como', 'donde', 'cuando', 'porque', 'para', 'como', 'con', 'una', 'pero', 'más', 'muy'];
    // Palabras indicador de inglés
    const palabrasEN = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'that', 'it', 'for', 'with', 'this'];
    
    const tokens = tokenizarYLimpiar(texto);
    let scoreES = 0, scoreEN = 0;
    
    for (const token of tokens) {
      if (palabrasES.includes(token)) scoreES++;
      if (palabrasEN.includes(token)) scoreEN++;
    }
    
    // Acentos son fuerte indicador de español
    if (texto.match(/[áéíóúñ]/)) scoreES += 3;
    
    if (scoreES > scoreEN) return 'es';
    if (scoreEN > scoreES) return 'en';
    return 'desconocido';
  }

  // ==========================================
  // 🧹 LIMPIAR CACHÉ
  // ==========================================
  limpiarCache() {
    const size = this.cache.size;
    this.cache.clear();
    logger?.info?.(`🧹 Caché de IA limpiada (${size} entradas)`);
    return size;
  }

  // ==========================================
  // 📊 ESTADÍSTICAS DEL MOTOR
  // ==========================================
  obtenerEstadisticas() {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.MAX_CACHE_SIZE,
      cacheTTL: this.CACHE_TTL,
      categorias: Object.keys(BASE_CONOCIMIENTO.sinonimos).length,
      totalSinonimos: Object.values(BASE_CONOCIMIENTO.sinonimos)
        .reduce((acc, cat) => acc + cat.palabras.length, 0),
      patronesClasificacion: BASE_CONOCIMIENTO.patronesClasificacion.length,
      intenciones: Object.keys(BASE_CONOCIMIENTO.intenciones).length,
      stopwords: BASE_CONOCIMIENTO.stopwords.length
    };
  }
}

// ============================================
// 🚀 EXPORTAR INSTANCIA GLOBAL
// ============================================
const motorIA = new MotorBusquedaIA();

// Log de inicialización
try {
  const stats = motorIA.obtenerEstadisticas();
  console.log('🤖 IA Interna Avanzada v2.0 cargada');
  console.log(`✅ ${stats.categorias} categorías, ${stats.totalSinonimos} sinónimos, ${stats.patronesClasificacion} patrones`);
} catch (e) {
  console.log('🤖 IA Interna Avanzada v2.0 cargada');
}

module.exports = {
  motorIA,
  BASE_CONOCIMIENTO,
  
  // Funciones helper para usar en endpoints
  buscarInteligente: (texto, archivos, max) => motorIA.buscarFuzzy(texto, archivos, max),
  clasificarArchivo: (nombre, desc) => motorIA.clasificarArchivo(nombre, desc),
  recomendarSimilares: (archivo, todos, limite) => motorIA.recomendarSimilares(archivo, todos, limite),
  analizarTexto: (texto) => motorIA.analizar(texto),
  detectarIdioma: (texto) => motorIA.detectarIdioma(texto),
  normalizarTexto,
  tokenizarYLimpiar,
  
  // Funciones adicionales
  obtenerEstadisticasIA: () => motorIA.obtenerEstadisticas(),
  limpiarCacheIA: () => motorIA.limpiarCache()
};
