const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Función para obtener User-Agent aleatorio
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.60'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Extraer video ID de diferentes formatos de URL
function getVideoId(url) {
  try {
    // Limpiar parámetros adicionales como listas de reproducción
    url = url.split('&')[0];
    
    // Si es un enlace youtu.be
    if (url.includes('youtu.be/')) {
      return url.split('youtu.be/')[1].split(/[/?&]/)[0];
    }
    
    // Si es un enlace youtube.com/watch
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    }
    
    // Si ya es un ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }
    
    return null;
  } catch (error) {
    console.error('Error al extraer video ID:', error);
    return null;
  }
}

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para verificar información del video
app.post('/api/info', async (req, res) => {
  const videoURL = req.body.url;
  
  try {
    // Extraer el ID del video
    const videoId = getVideoId(videoURL);
    if (!videoId) {
      return res.status(400).json({ error: 'URL de YouTube inválida' });
    }
    
    // Opciones para evitar algunas restricciones
    const options = {
      requestOptions: {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          'Connection': 'keep-alive',
          'Referer': 'https://www.youtube.com/'
        }
      }
    };
    
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, options);
    
    // Filtrar formatos de audio para comprobar disponibilidad
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    if (audioFormats.length === 0) {
      return res.status(400).json({ 
        error: 'No se encontraron formatos de audio para este video' 
      });
    }
    
    return res.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
      duration: info.videoDetails.lengthSeconds,
      author: info.videoDetails.author.name,
      videoId: videoId
    });
  } catch (error) {
    console.error('Error al obtener información del video:', error);
    
    // Manejar diferentes tipos de errores
    let errorMsg = 'Error al obtener información del video';
    
    if (error.message.includes('No video id found')) {
      errorMsg = 'No se pudo identificar el ID del video en la URL proporcionada';
    } else if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      errorMsg = 'El video no está disponible o es privado';
    } else if (error.message.includes('403')) {
      errorMsg = 'Este video tiene restricciones que impiden obtener su información';
    } else if (error.message.includes('age-restricted')) {
      errorMsg = 'Este video tiene restricciones de edad';
    }
    
    res.status(500).json({ error: errorMsg });
  }
});

// Ruta para descargar el audio (streaming directo)
app.get('/api/download', async (req, res) => {
  const videoURL = req.query.url;
  
  try {
    // Extraer y validar ID del video
    const videoId = getVideoId(videoURL);
    if (!videoId) {
      return res.status(400).json({ error: 'URL de YouTube inválida' });
    }
    
    console.log(`Iniciando descarga para: ${videoURL} (ID: ${videoId})`);
    
    const sanitizedURL = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Obtener información del video para el título y detectar restricciones
    const options = {
      requestOptions: {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          'Connection': 'keep-alive',
          'Referer': 'https://www.youtube.com/'
        }
      }
    };
    
    // Obtener información del video
    const info = await ytdl.getInfo(sanitizedURL, options);
    
    // Verificar si hay restricciones conocidas
    if (info.videoDetails.age_restricted) {
      return res.status(403).json({ error: 'Este video tiene restricciones de edad que impiden su descarga' });
    }
    
    // Encontrar el mejor formato de audio disponible
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    if (audioFormats.length === 0) {
      return res.status(400).json({ error: 'No se encontraron formatos de audio para este video' });
    }
    
    // Ordenar por calidad y seleccionar el mejor formato
    audioFormats.sort((a, b) => {
      // Priorizar webm con opus, luego ordenar por bitrate
      if (a.container === 'webm' && a.audioCodec === 'opus' && b.container !== 'webm') return -1;
      if (b.container === 'webm' && b.audioCodec === 'opus' && a.container !== 'webm') return 1;
      return (b.audioBitrate || 0) - (a.audioBitrate || 0);
    });
    
    const selectedFormat = audioFormats[0];
    console.log(`Seleccionando formato: ${selectedFormat.itag} (${selectedFormat.audioBitrate || 'desconocido'}kbps, ${selectedFormat.container})`);
    
    // Sanitizar el título para usar como nombre de archivo
    const sanitizedTitle = info.videoDetails.title
      .replace(/[\\/:*?"<>|]/g, '')  // Eliminar caracteres no válidos
      .replace(/\s+/g, ' ')          // Normalizar espacios
      .trim();
    
    // Establecer headers para indicar descarga
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.${selectedFormat.container === 'mp4' ? 'm4a' : selectedFormat.container}"`);
    res.setHeader('Content-Type', selectedFormat.container === 'webm' ? 'audio/webm' : 'audio/mp4');
    
    // Opciones para streaming
    const downloadOptions = {
      ...options,
      format: selectedFormat,
      quality: 'highestaudio'
    };
    
    // Crear stream para enviar directamente al cliente (sin guardarlo en disco)
    const stream = ytdl(sanitizedURL, downloadOptions);
    
    // Manejar errores del stream
    stream.on('error', (err) => {
      console.error('Error en stream de ytdl:', err);
      
      // Enviar error apropiado si no se ha enviado respuesta aún
      if (!res.headersSent) {
        let errorMsg = err.message;
        if (err.message.includes('403')) {
          errorMsg = 'Este video tiene restricciones que impiden su descarga. Intente con otro video.';
        }
        res.status(500).json({ error: `Error al descargar: ${errorMsg}` });
      }
    });
    
    // Si ocurre un error en la respuesta
    res.on('error', (err) => {
      console.error('Error en la respuesta HTTP:', err);
      stream.destroy(); // Detener el stream
    });
    
    // Registrar cuando finaliza la transferencia
    res.on('finish', () => {
      console.log(`Streaming de ${sanitizedTitle} completado exitosamente`);
    });
    
    // Pipe directo del stream al cliente
    stream.pipe(res);
    
  } catch (error) {
    console.error('Error general al descargar:', error);
    
    // Mensaje de error más amigable para el usuario
    let errorMsg = error.message;
    if (error.message.includes('403')) {
      errorMsg = 'Este video tiene restricciones que impiden su descarga. Intente con otro video. Para descargar este tipo de videos, use la versión local con yt-dlp.';
    } else if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      errorMsg = 'El video no está disponible o es privado';
    } else if (error.message.includes('age-restricted')) {
      errorMsg = 'Este video tiene restricciones de edad';
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: `Error al descargar: ${errorMsg}` });
    }
  }
});

// Endpoint para verificar estado del servidor
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
    vercel: true
  });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Exportar para Vercel
module.exports = app;

// Si no estamos en Vercel, iniciar servidor normalmente
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('Esta versión es compatible con Vercel pero tiene limitaciones');
    console.log('Videos con restricciones fuertes no podrán ser descargados');
  });
}