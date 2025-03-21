const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const path = require('path');
const https = require('https');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Generar un ID único para simular una sesión persistente
const SESSION_ID = crypto.randomBytes(16).toString('hex');

// Generar una cookie aleatoria para cada solicitud
function generateCookies() {
  const cookieNames = ['CONSENT', 'VISITOR_INFO1_LIVE', 'YSC', '__Secure-3PSID', 'PREF', 'SID', 'HSID', 'SSID'];
  const randomValues = cookieNames.map(name => 
    `${name}=${crypto.randomBytes(10).toString('hex')}; Domain=.youtube.com; Path=/`
  );
  return randomValues.join('; ');
}

// Configurar User-Agents realistas
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Extraer video ID de diferentes formatos de URL
function getVideoId(url) {
  try {
    // Limpiar parámetros adicionales
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

// Función para obtener información del video usando fetch directamente
async function getVideoInfoWithFetch(videoId) {
  try {
    const userAgent = getRandomUserAgent();
    const cookies = generateCookies();
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Primera solicitud para obtener cookies
    const initialResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!initialResponse.ok) {
      throw new Error(`Error en solicitud inicial: ${initialResponse.status}`);
    }
    
    // Extraer cookies de la respuesta
    const setCookieHeader = initialResponse.headers.get('set-cookie');
    const receivedCookies = setCookieHeader ? setCookieHeader : cookies;
    
    // Obtener el HTML
    const html = await initialResponse.text();
    
    // Extraer título del video
    const titleMatch = html.match(/<title>(.*?) - YouTube<\/title>/);
    const title = titleMatch ? titleMatch[1] : `Video ${videoId}`;
    
    // Extraer miniatura
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    
    // Extraer duración (aproximada, ya que no es fácil obtenerla del HTML)
    let duration = 0;
    const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
    if (durationMatch) {
      duration = parseInt(durationMatch[1]);
    }
    
    // Extraer autor
    let author = 'YouTube';
    const authorMatch = html.match(/"ownerChannelName":"([^"]+)"/);
    if (authorMatch) {
      author = authorMatch[1];
    }
    
    return {
      title,
      thumbnail,
      duration,
      author,
      videoId,
      cookies: receivedCookies,
      userAgent
    };
  } catch (error) {
    console.error('Error en getVideoInfoWithFetch:', error);
    throw error;
  }
}

// Ruta para verificar información del video
app.post('/api/info', async (req, res) => {
  const videoURL = req.body.url;
  
  try {
    // Extraer el ID del video
    const videoId = getVideoId(videoURL);
    if (!videoId) {
      return res.status(400).json({ error: 'URL de YouTube inválida' });
    }
    
    // Intentar primero con ytdl-core
    try {
      const userAgent = getRandomUserAgent();
      const cookies = generateCookies();
      
      const options = {
        requestOptions: {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Cookie': cookies,
            'x-youtube-client-name': '1',
            'x-youtube-client-version': '2.20230331.00.00',
            'Connection': 'keep-alive',
            'Referer': 'https://www.youtube.com/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Pragma': 'no-cache',
            'Cache-Control': 'no-cache',
            'TE': 'trailers'
          }
        }
      };
      
      const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, options);
      
      return res.json({
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
        duration: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name,
        videoId: videoId,
        method: 'ytdl-core'
      });
    } catch (ytdlError) {
      console.log('ytdl-core falló, intentando con método alternativo:', ytdlError.message);
      
      // Si ytdl-core falla, intentar con nuestro método de respaldo
      const info = await getVideoInfoWithFetch(videoId);
      return res.json({
        ...info,
        method: 'fetch'
      });
    }
  } catch (error) {
    console.error('Error al obtener información del video:', error);
    
    // Manejar diferentes tipos de errores
    let errorMsg = 'Error al obtener información del video';
    
    if (error.message.includes('No video id found')) {
      errorMsg = 'No se pudo identificar el ID del video en la URL proporcionada';
    } else if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      errorMsg = 'El video no está disponible o es privado';
    } else if (error.message.includes('bot')) {
      errorMsg = 'YouTube ha detectado que somos un bot. Intente descargar el video localmente.';
    } else if (error.message.includes('403')) {
      errorMsg = 'YouTube ha bloqueado la solicitud. Intente descargar el video localmente.';
    }
    
    res.status(500).json({ error: errorMsg });
  }
});

// Función para obtener enlaces directos a través del parseo del HTML
async function getDirectLinks(videoId, userAgent, cookies) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Realizar solicitud a YouTube
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Cookie': cookies,
        'Referer': 'https://www.youtube.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Connection': 'keep-alive'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error en solicitud HTTP: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Buscar datos de configuración del reproductor
    const playerConfigRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/;
    const match = html.match(playerConfigRegex);
    
    if (!match) {
      throw new Error('No se pudo encontrar la configuración del reproductor');
    }
    
    try {
      const playerConfig = JSON.parse(match[1]);
      
      // Extraer formatos de streaming
      const formats = playerConfig.streamingData?.formats || [];
      const adaptiveFormats = playerConfig.streamingData?.adaptiveFormats || [];
      
      // Combinar todos los formatos y filtrar solo audio
      const allFormats = [...formats, ...adaptiveFormats].filter(format => 
        format.mimeType && (format.mimeType.includes('audio') || format.audioQuality)
      );
      
      if (allFormats.length === 0) {
        throw new Error('No se encontraron formatos de audio');
      }
      
      // Ordenar por calidad
      allFormats.sort((a, b) => {
        // Priorizar por bitrate de audio
        const bitrateA = a.bitrate || 0;
        const bitrateB = b.bitrate || 0;
        return bitrateB - bitrateA;
      });
      
      return {
        formats: allFormats,
        title: playerConfig.videoDetails?.title || `Video ${videoId}`,
        author: playerConfig.videoDetails?.author || 'YouTube',
        lengthSeconds: playerConfig.videoDetails?.lengthSeconds || 0
      };
    } catch (parseError) {
      console.error('Error al parsear la configuración:', parseError);
      throw new Error('Error al procesar la configuración del reproductor');
    }
  } catch (error) {
    console.error('Error en getDirectLinks:', error);
    throw error;
  }
}

// Función para transmitir a través de proxy
async function proxyStream(url, res, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    
    const requestOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      headers: {
        'User-Agent': headers['User-Agent'] || getRandomUserAgent(),
        'Accept': '*/*',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Range': headers['Range'] || '',
        'Referer': 'https://www.youtube.com/',
        'Origin': 'https://www.youtube.com',
        'Connection': 'keep-alive'
      }
    };
    
    // Realizar solicitud a la URL
    const request = https.get(requestOptions, (response) => {
      // Copiar headers relevantes
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      if (response.headers['accept-ranges']) {
        res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
      }
      
      // Transmitir la respuesta al cliente
      response.pipe(res);
      
      response.on('end', () => {
        resolve();
      });
    });
    
    request.on('error', (err) => {
      console.error('Error en proxy stream:', err);
      reject(err);
    });
    
    // Manejar errores en la respuesta
    res.on('error', (err) => {
      console.error('Error en respuesta al cliente:', err);
      request.destroy();
      reject(err);
    });
  });
}

// Ruta para descargar el audio
app.get('/api/download', async (req, res) => {
  const videoURL = req.query.url;
  
  try {
    // Extraer y validar ID del video
    const videoId = getVideoId(videoURL);
    if (!videoId) {
      return res.status(400).json({ error: 'URL de YouTube inválida' });
    }
    
    console.log(`Iniciando descarga para: ${videoURL} (ID: ${videoId})`);
    
    // Obtener información del video
    let videoInfo;
    let cookies;
    let userAgent;
    
    try {
      // Primero intentar con ytdl-core
      const options = {
        requestOptions: {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Cookie': generateCookies()
          }
        }
      };
      
      const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, options);
      videoInfo = {
        title: info.videoDetails.title,
        formats: ytdl.filterFormats(info.formats, 'audioonly'),
        lengthSeconds: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name
      };
      
      cookies = options.requestOptions.headers.Cookie;
      userAgent = options.requestOptions.headers['User-Agent'];
    } catch (ytdlError) {
      console.log('ytdl-core falló, intentando obtener links directamente:', ytdlError.message);
      
      // Intentar obtener enlaces directamente
      const fetchInfo = await getVideoInfoWithFetch(videoId);
      cookies = fetchInfo.cookies;
      userAgent = fetchInfo.userAgent;
      
      videoInfo = await getDirectLinks(videoId, userAgent, cookies);
    }
    
    // Verificar que tenemos formatos disponibles
    if (!videoInfo.formats || videoInfo.formats.length === 0) {
      return res.status(400).json({ error: 'No se encontraron formatos de audio para este video' });
    }
    
    // Seleccionar el mejor formato
    const selectedFormat = videoInfo.formats[0];
    console.log(`Formato seleccionado: ${selectedFormat.itag || 'desconocido'}, tipo: ${selectedFormat.mimeType || 'desconocido'}`);
    
    // Sanitizar el título para el nombre de archivo
    const sanitizedTitle = videoInfo.title
      .replace(/[\\/:*?"<>|]/g, '')  // Eliminar caracteres no válidos
      .replace(/\s+/g, ' ')          // Normalizar espacios
      .trim();
    
    // Determinar extensión del archivo
    let extension = 'mp3';
    if (selectedFormat.mimeType) {
      if (selectedFormat.mimeType.includes('audio/webm')) {
        extension = 'webm';
      } else if (selectedFormat.mimeType.includes('audio/mp4')) {
        extension = 'm4a';
      }
    }
    
    // Configurar cabeceras para descarga
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.${extension}"`);
    
    // Obtener la URL directa
    const directUrl = selectedFormat.url || selectedFormat.signatureCipher;
    
    if (!directUrl) {
      return res.status(400).json({ error: 'No se pudo obtener la URL de descarga' });
    }
    
    // Verificar si tenemos una URL directa o necesitamos descifrar
    let streamUrl = directUrl;
    if (typeof streamUrl === 'string' && streamUrl.includes('signatureCipher')) {
      // Necesitaríamos implementar lógica para descifrar, pero es complejo
      return res.status(400).json({ 
        error: 'Este video requiere descifrado de firma que no está disponible en Vercel. Intente descargar localmente.' 
      });
    }
    
    // Transmitir el contenido a través de proxy
    const headers = {
      'User-Agent': userAgent,
      'Range': req.headers.range || ''
    };
    
    await proxyStream(streamUrl, res, headers);
    console.log(`Streaming completado para: ${sanitizedTitle}`);
    
  } catch (error) {
    console.error('Error general al descargar:', error);
    
    // Manejar diferentes tipos de errores
    let errorMsg = error.message;
    if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      errorMsg = 'El video no está disponible o es privado';
    } else if (error.message.includes('bot')) {
      errorMsg = 'YouTube ha detectado que somos un bot. Intente descargar el video localmente con yt-dlp.';
    } else if (error.message.includes('403') || error.message.includes('forbidden')) {
      errorMsg = 'YouTube ha bloqueado la solicitud. Intente descargar el video localmente con yt-dlp.';
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
    environment: process.env.VERCEL ? 'vercel' : (process.env.NODE_ENV || 'development')
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
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log('Esta versión está optimizada para Vercel pero tiene limitaciones');
    console.log('Videos con restricciones fuertes pueden no funcionar en el entorno de Vercel');
  });
}