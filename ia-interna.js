// ============================================
// 🤖 IA INTERNA AVANZADA - 100% INTERNA
// ============================================
// Sin APIs externas, todo funciona en tu servidor

const natural = require('natural');
const compromise = require('compromise');

// ============================================
// 🧠 BASE DE CONOCIMIENTO EN ESPAÑOL
// ============================================
const BASE_CONOCIMIENTO = {
  // Sinónimos organizados por categorías
  sinonimos: {
    dinero: {
      palabras: ['dinero', 'plata', 'cash', 'efectivo', 'billete', 'moneda', 'saldo', 'balance', 'capital', 'fondos', 'recursos', 'presupuesto', 'ingreso', 'gasto', 'pago', 'cobro', 'factura', 'recibo', 'ticket', 'comprobante', 'divisa', 'euro', 'dólar', 'peso', 'libra', 'yuan', 'bitcoin', 'cripto'],
      categoria: 'finanzas',
      icono: '💰'
    },
    foto: {
      palabras: ['foto', 'fotografía', 'imagen', 'picture', 'selfie', 'retrato', 'captura', 'instantánea', 'shot', 'pic', 'img', 'visual', 'gráfica', 'paisaje', 'panorámica', 'macro', 'closeup'],
      categoria: 'multimedia',
      icono: '📸'
    },
    video: {
      palabras: ['video', 'vídeo', 'película', 'film', 'clip', 'corto', 'largometraje', 'documental', 'serie', 'episodio', 'capítulo', 'grabación', 'animación', 'trailer', 'tutorial', 'vlog'],
      categoria: 'multimedia',
      icono: '🎬'
    },
    musica: {
      palabras: ['música', 'canción', 'tema', 'track', 'audio', 'mp3', 'wav', 'podcast', 'melodía', 'ritmo', 'beat', 'álbum', 'disco', 'sonido', 'tonada', 'himno', 'instrumental'],
      categoria: 'audio',
      icono: '🎵'
    },
    documento: {
      palabras: ['documento', 'archivo', 'pdf', 'word', 'excel', 'powerpoint', 'texto', 'escrito', 'informe', 'reporte', 'ensayo', 'artículo', 'paper', 'tesis', 'manual', 'guía', 'tutorial'],
      categoria: 'documentos',
      icono: '📄'
    },
    trabajo: {
      palabras: ['trabajo', 'empleo', 'job', 'cv', 'curriculum', 'hoja de vida', 'resume', 'profesión', 'carrera', 'ocupación', 'oficio', 'chamba', 'laboral', 'empresa', 'negocio', 'oficina'],
      categoria: 'profesional',
      icono: '💼'
    },
    estudio: {
      palabras: ['estudio', 'educación', 'aprendizaje', 'clase', 'curso', 'universidad', 'escuela', 'colegio', 'academia', 'tesis', 'examen', 'tarea', 'homework', 'materia', 'asignatura', 'carrera', 'grado', 'master', 'doctorado'],
      categoria: 'educacion',
      icono: '📚'
    },
    salud: {
      palabras: ['salud', 'médico', 'doctor', 'hospital', 'enfermedad', 'tratamiento', 'medicina', 'receta', 'diagnóstico', 'consulta', 'terapia', 'análisis', 'examen', 'síntoma', 'dieta', 'nutrición', 'ejercicio', 'fitness'],
      categoria: 'salud',
      icono: '🏥'
    },
    legal: {
      palabras: ['legal', 'ley', 'contrato', 'abogado', 'demanda', 'juicio', 'notario', 'escritura', 'poder', 'testamento', 'herencia', 'divorcio', 'custodia', 'firma', 'acuerdo', 'cláusula'],
      categoria: 'legal',
      icono: '⚖️'
    },
    viaje: {
      palabras: ['viaje', 'turismo', 'vuelo', 'hotel', 'destino', 'itinerario', 'reserva', 'maleta', 'pasaporte', 'visa', 'excursión', 'tour', 'aventura', 'vacaciones', 'playa', 'montaña', 'ciudad'],
      categoria: 'viajes',
      icono: '✈️'
    },
    casa: {
      palabras: ['casa', 'hogar', 'familia', 'inmueble', 'propiedad', 'apartamento', 'departamento', 'alquiler', 'renta', 'hipoteca', 'mudanza', 'decoración', 'mueble', 'jardín'],
      categoria: 'hogar',
      icono: '🏠'
    },
    tecnologia: {
      palabras: ['tecnología', 'código', 'programa', 'software', 'app', 'aplicación', 'sistema', 'plataforma', 'web', 'internet', 'red', 'servidor', 'base de datos', 'algoritmo', 'script', 'python', 'javascript', 'html', 'css'],
      categoria: 'tecnologia',
      icono: '💻'
    },
    cocina: {
      palabras: ['cocina', 'receta', 'comida', 'ingrediente', 'plato', 'postre', 'salsa', 'gourmet', 'chef', 'restaurante', 'menú', 'despensa', 'hornear', 'freír', 'cocinar'],
      categoria: 'gastronomia',
      icono: '🍳'
    },
    deporte: {
      palabras: ['deporte', 'fútbol', 'basket', 'tenis', 'gym', 'gimnasio', 'entrenamiento', 'ejercicio', 'atleta', 'competencia', 'partido', 'equipo', 'jugador', 'marcas', 'récord'],
      categoria: 'deportes',
      icono: '⚽'
    },
    arte: {
      palabras: ['arte', 'pintura', 'dibujo', 'escultura', 'diseño', 'creatividad', 'artista', 'galería', 'museo', 'exposición', 'ilustración', 'gráfica', 'digital', 'tradicional'],
      categoria: 'arte',
      icono: '🎨'
    }
  },

  // Intenciones del usuario
  intenciones: {
    buscar: ['buscar', 'encontrar', 'localizar', 'dónde', 'donde', 'cuál', 'cual', 'qué', 'que'],
    comprar: ['comprar', 'adquirir', 'pagar', 'quiero', 'necesito', 'obtén', 'obtener'],
    vender: ['vender', 'publicar', 'ofrecer', 'listar', 'poner en venta'],
    subir: ['subir', 'upload', 'guardar', 'agregar', 'añadir', 'cargar'],
    eliminar: ['eliminar', 'borrar', 'quitar', 'remover', 'sacar'],
    compartir: ['compartir', 'enviar', 'mandar', 'dar acceso']
  },

  // Patrones para auto-clasificación
  patronesClasificacion: [
    { regex: /\b(factura|recibo|invoice|bill|ticket)\b/i, categoria: 'finanzas' },
    { regex: /\b(cv|curriculum|hoja.?de.?vida|resume)\b/i, categoria: 'profesional' },
    { regex: /\b(tesis|paper|ensayo|artículo)\b/i, categoria: 'educacion' },
    { regex: /\b(contrato|acuerdo|legal)\b/i, categoria: 'legal' },
    { regex: /\b(receta|cocina|comida)\b/i, categoria: 'gastronomia' },
    { regex: /\b(foto|imagen|picture|selfie)\b/i, categoria: 'multimedia' },
    { regex: /\b(video|película|clip|tutorial)\b/i, categoria: 'multimedia' },
    { regex: /\b(canción|música|audio|podcast)\b/i, categoria: 'audio' },
    { regex: /\b(código|script|programa|app)\b/i, categoria: 'tecnologia' }
  ]
};

// ============================================
// 🔍 MOTOR DE BÚSQUEDA INTELIGENTE
// ============================================
class MotorBusquedaIA {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.cache = new Map();
  }

  // Analiza el texto del usuario
  analizar(texto) {
    const textoLimpio = texto.toLowerCase().trim();
    const tokens = this.tokenizer.tokenize(textoLimpio) || [];
    
    // Detectar intención
    const intencion = this.detectarIntencion(tokens);
    
    // Expandir con sinónimos
    const terminosExpandidos = this.expandirSinonimos(tokens);
    
    // Detectar categorías
    const categorias = this.detectarCategorias(terminosExpandidos);
    
    // Calcular relevancia de cada término
    const terminosConPeso = terminosExpandidos.map(t => ({
      termino: t,
      peso: this.calcularPeso(t)
    }));
    
    return {
      textoOriginal: texto,
      tokens,
      intencion,
      terminosExpandidos,
      categorias,
      terminosConPeso,
      esPregunta: texto.includes('?') || this.esPregunta(tokens)
    };
  }

  // Detecta qué quiere hacer el usuario
  detectarIntencion(tokens) {
    for (const [intencion, palabras] of Object.entries(BASE_CONOCIMIENTO.intenciones)) {
      for (const token of tokens) {
        if (palabras.some(p => token.includes(p) || p.includes(token))) {
          return intencion;
        }
      }
    }
    return 'buscar'; // Por defecto
  }

  // Expande términos con sinónimos
  expandirSinonimos(tokens) {
    const expandidos = new Set(tokens);
    
    for (const token of tokens) {
      for (const [categoria, data] of Object.entries(BASE_CONOCIMIENTO.sinonimos)) {
        if (data.palabras.some(p => p.includes(token) || token.includes(p))) {
          // Añadir algunos sinónimos (no todos para no saturar)
          data.palabras.slice(0, 5).forEach(sinonimo => expandidos.add(sinonimo));
        }
      }
    }
    
    return Array.from(expandidos);
  }

  // Detecta categorías relevantes
  detectarCategorias(terminos) {
    const categorias = new Set();
    
    for (const termino of terminos) {
      for (const [cat, data] of Object.entries(BASE_CONOCIMIENTO.sinonimos)) {
        if (data.palabras.some(p => p.includes(termino) || termino.includes(p))) {
          categorias.add(cat);
        }
      }
    }
    
    return Array.from(categorias);
  }

  // Calcula qué tan importante es un término
  calcularPeso(termino) {
    // Términos más específicos pesan más
    if (termino.length > 8) return 1.5;
    if (termino.length > 5) return 1.2;
    
    // Palabras comunes pesan menos
    const comunes = ['de', 'la', 'el', 'en', 'y', 'a', 'los', 'del', 'las', 'un', 'con', 'para'];
    if (comunes.includes(termino)) return 0.3;
    
    return 1.0;
  }

  // Detecta si es una pregunta
  esPregunta(tokens) {
    const palabrasPregunta = ['qué', 'que', 'cómo', 'como', 'cuándo', 'cuando', 'dónde', 'donde', 'por qué', 'porque', 'cuál', 'cual', 'quién', 'quien'];
    return tokens.some(t => palabrasPregunta.includes(t));
  }

  // Busca fuzzy (tolerante a errores)
  buscarFuzzy(texto, listaArchivos, maxResultados = 20) {
    const analisis = this.analizar(texto);
    const resultados = [];
    
    for (const archivo of listaArchivos) {
      const textoArchivo = `${archivo.titulo || ''} ${archivo.descripcion || ''} ${archivo.categoria || ''}`.toLowerCase();
      let puntaje = 0;
      
      // Puntaje por coincidencia exacta
      for (const termino of analisis.terminosExpandidos) {
        if (textoArchivo.includes(termino)) {
          puntaje += this.calcularPeso(termino) * 10;
        }
      }
      
      // Puntaje por coincidencia fuzzy (Levenshtein)
      for (const termino of analisis.tokens) {
        const distancia = natural.LevenshteinDistance(textoArchivo, termino, { search: true });
        if (distancia && distancia < 3) {
          puntaje += 5 - distancia; // Más cerca = más puntos
        }
      }
      
      // Bonus por categoría coincidente
      if (archivo.categoria && analisis.categorias.includes(archivo.categoria)) {
        puntaje += 15;
      }
      
      if (puntaje > 0) {
        resultados.push({
          archivo,
          puntaje,
          coincidencias: analisis.terminosExpandidos.filter(t => textoArchivo.includes(t))
        });
      }
    }
    
    // Ordenar por puntaje
    return resultados
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, maxResultados);
  }

  // Clasifica automáticamente un archivo por su nombre
  clasificarArchivo(nombre, descripcion = '') {
    const texto = `${nombre} ${descripcion}`.toLowerCase();
    const categoriasDetectadas = [];
    
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
    
    return {
      categorias: [...new Set(categoriasDetectadas)],
      tags: this.generarTags(texto),
      confianza: categoriasDetectadas.length > 0 ? 'alta' : 'baja'
    };
  }

  // Genera tags automáticos
  generarTags(texto) {
    const tags = new Set();
    const tokens = this.tokenizer.tokenize(texto.toLowerCase()) || [];
    
    for (const token of tokens) {
      if (token.length > 4) { // Solo palabras significativas
        for (const [cat, data] of Object.entries(BASE_CONOCIMIENTO.sinonimos)) {
          if (data.palabras.includes(token)) {
            tags.add(data.icono + ' ' + cat);
          }
        }
      }
    }
    
    return Array.from(tags).slice(0, 5);
  }

  // Recomienda archivos similares
  recomendarSimilares(archivoActual, todosArchivos, limite = 5) {
    const archivosSimilares = [];
    
    for (const archivo of todosArchivos) {
      if (archivo.id === archivoActual.id) continue;
      
      let similitud = 0;
      
      // Misma categoría = +10
      if (archivo.categoria === archivoActual.categoria) {
        similitud += 10;
      }
      
      // Mismo vendedor = +5
      if (archivo.userId === archivoActual.userId) {
        similitud += 5;
      }
      
      // Tags en común
      const tagsActuales = archivoActual.tags || [];
      const tagsOtro = archivo.tags || [];
      const comunes = tagsActuales.filter(t => tagsOtro.includes(t));
      similitud += comunes.length * 3;
      
      // Palabras en común en título
      const tituloActual = (archivoActual.titulo || '').toLowerCase().split(' ');
      const tituloOtro = (archivo.titulo || '').toLowerCase().split(' ');
      const palabrasComunes = tituloActual.filter(p => tituloOtro.includes(p) && p.length > 3);
      similitud += palabrasComunes.length * 2;
      
      if (similitud > 0) {
        archivosSimilares.push({ archivo, similitud });
      }
    }
    
    return archivosSimilares
      .sort((a, b) => b.similitud - a.similitud)
      .slice(0, limite)
      .map(r => r.archivo);
  }
}

// ============================================
// 🚀 EXPORTAR INSTANCIA GLOBAL
// ============================================
const motorIA = new MotorBusquedaIA();

module.exports = {
  motorIA,
  BASE_CONOCIMIENTO,
  
  // Funciones helper para usar en endpoints
  buscarInteligente: (texto, archivos) => motorIA.buscarFuzzy(texto, archivos),
  clasificarArchivo: (nombre, desc) => motorIA.clasificarArchivo(nombre, desc),
  recomendarSimilares: (archivo, todos) => motorIA.recomendarSimilares(archivo, todos),
  analizarTexto: (texto) => motorIA.analizar(texto)
};
