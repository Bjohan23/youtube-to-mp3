const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { promisify } = require('util');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear directorio temporal si no existe
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Verificar si yt-dlp está instalado
let ytDlpInstalled = false;
let ytDlpPath = 'yt-dlp'; // Comando predeterminado

try {
  const ytDlpCheck = spawn(ytDlpPath, ['--version']);
  ytDlpCheck.on('error', (err) => {
    console.warn('yt-dlp no está instalado o no está en PATH:', err.message);
    ytDlpInstalled = false;
  });
  ytDlpCheck.on('close', (code) => {
    if (code === 0) {
      console.log('yt-dlp detectado correctamente.');
      ytDlpInstalled = true;
    }
  });
} catch (e) {
  console.warn('No se pudo verificar yt-dlp:', e.message);
}

// Limpiar archivos temporales
function cleanupTempFiles() {
  if (fs.existsSync(tempDir)) {
    fs.readdir(tempDir, (err, files) => {
      if (err) {
        console.error('Error al leer directorio temporal:', err);
        return;
      }
      
      for (const file of files) {
        fs.unlink(path.join(tempDir, file), err => {
          if (err) console.error(`Error al eliminar archivo temporal ${file}:`, err);
        });
      }
    });
  }
}

cleanupTempFiles();
setInterval(cleanupTempFiles, 3600000);

// Función para obtener User-Agent aleatorio
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.2045.60',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
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

// Función para obtener información del video usando yt-dlp
async function getVideoInfoWithYtDlp(videoId) {
  return new Promise((resolve, reject) => {
    if (!ytDlpInstalled) {
      return reject(new Error('yt-dlp no está instalado'));
    }
    
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const ytDlp = spawn(ytDlpPath, [
      '--dump-json',
      '--no-playlist',
      url
    ]);
    
    let output = '';
    let errorOutput = '';
    
    ytDlp.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ytDlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ytDlp.on('error', (err) => {
      reject(new Error(`Error al ejecutar yt-dlp: ${err.message}`));
    });
    
    ytDlp.on('close', (code) => {
      if (code === 0) {
        try {
          const info = JSON.parse(output);
          resolve({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            author: info.uploader,
            formats: info.formats.length
          });
        } catch (err) {
          reject(new Error(`Error al parsear la salida de yt-dlp: ${err.message}`));
        }
      } else {
        // Si yt-dlp falla, revisar el mensaje de error
        if (errorOutput.includes('Video unavailable') || errorOutput.includes('Private video')) {
          reject(new Error('El video no está disponible o es privado'));
        } else if (errorOutput.includes('This video is available for Premium users only')) {
          reject(new Error('Este video es exclusivo para usuarios Premium'));
        } else {
          reject(new Error(`yt-dlp falló con código ${code}: ${errorOutput}`));
        }
      }
    });
  });
}

// Ruta para verificar información del video (intenta con ytdl-core y si falla usa yt-dlp)
app.post('/api/info', async (req, res) => {
  const videoURL = req.body.url;
  
  try {
    // Extraer el ID del video
    const videoId = getVideoId(videoURL);
    if (!videoId) {
      return res.status(400).json({ error: 'URL de YouTube inválida' });
    }
    
    // Primero intentar con ytdl-core (para compatibilidad)
    try {
      const options = {
        requestOptions: {
          headers: {
            'User-Agent': getRandomUserAgent()
          }
        }
      };
      
      const info = await Promise.race([
        ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);
      
      return res.json({
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
        duration: info.videoDetails.lengthSeconds,
        author: info.videoDetails.author.name,
        videoId: videoId,
        method: 'ytdl-core'
      });
    } catch (ytdlError) {
      console.log('ytdl-core falló, intentando con yt-dlp:', ytdlError.message);
      
      // Si ytdl-core falla, intentar con yt-dlp si está disponible
      if (ytDlpInstalled) {
        const info = await getVideoInfoWithYtDlp(videoId);
        return res.json({
          ...info,
          videoId: videoId,
          method: 'yt-dlp'
        });
      } else {
        // Si yt-dlp no está instalado, devolver el error original
        throw ytdlError;
      }
    }
  } catch (error) {
    console.error('Error al obtener información del video:', error);
    
    // Manejar diferentes tipos de errores
    let errorMsg = 'Error al obtener información del video';
    
    if (error.message.includes('No video id found')) {
      errorMsg = 'No se pudo identificar el ID del video en la URL proporcionada';
    } else if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      errorMsg = 'El video no está disponible o es privado';
    } else if (error.message.includes('Premium')) {
      errorMsg = 'Este video es exclusivo para usuarios Premium';
    } else if (error.message.includes('403')) {
      errorMsg = 'Este video tiene restricciones que impiden obtener su información';
    } else if (error.message.includes('Timeout')) {
      errorMsg = 'Tiempo de espera agotado al intentar obtener información del video';
    } else if (error.message.includes('yt-dlp no está instalado')) {
      errorMsg = 'Se requiere instalar yt-dlp para descargar este video';
    }
    
    res.status(500).json({ error: errorMsg });
  }
});

// Función para descargar audio con yt-dlp
async function downloadWithYtDlp(videoId, outputPath) {
  return new Promise((resolve, reject) => {
    if (!ytDlpInstalled) {
      return reject(new Error('yt-dlp no está instalado'));
    }
    
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Iniciando descarga con yt-dlp: ${url}`);
    
    // Configurar yt-dlp para extraer solo audio y convertir a mp3
    const ytDlp = spawn(ytDlpPath, [
      '--no-playlist',
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '0', // Mejor calidad
      '--output', outputPath,
      '--no-warnings',
      '--no-colors',
      url
    ]);
    
    let errorOutput = '';
    
    ytDlp.stderr.on('data', (data) => {
      const message = data.toString();
      errorOutput += message;
      console.log(`yt-dlp stderr: ${message}`);
    });
    
    ytDlp.stdout.on('data', (data) => {
      console.log(`yt-dlp stdout: ${data.toString().trim()}`);
    });
    
    ytDlp.on('error', (err) => {
      console.error('Error al ejecutar yt-dlp:', err);
      reject(err);
    });
    
    ytDlp.on('close', (code) => {
      if (code === 0) {
        // Verificar que el archivo existe y tiene un tamaño mínimo
        fs.stat(outputPath, (err, stats) => {
          if (err || !stats) {
            console.error('Error al verificar archivo descargado:', err);
            return reject(new Error('Error al verificar archivo de salida'));
          }
          
          if (stats.size < 10000) { // Menos de 10KB probablemente es un error
            console.error('Archivo descargado demasiado pequeño:', stats.size);
            return reject(new Error('Archivo descargado demasiado pequeño'));
          }
          
          console.log(`Descarga completada con yt-dlp: ${stats.size} bytes`);
          resolve({ fileSize: stats.size });
        });
      } else {
        // Detectar mensajes de error específicos
        let errorMsg = `yt-dlp falló con código ${code}`;
        
        if (errorOutput.includes('Video unavailable') || errorOutput.includes('Private video')) {
          errorMsg = 'El video no está disponible o es privado';
        } else if (errorOutput.includes('This video is available for Premium users only')) {
          errorMsg = 'Este video es exclusivo para usuarios Premium';
        } else if (errorOutput.includes('ERROR: Unable to download webpage')) {
          errorMsg = 'No se pudo acceder al video. YouTube puede estar bloqueando la descarga.';
        } else if (errorOutput.includes('COPYRIGHT_STRIKE')) {
          errorMsg = 'Este video tiene restricciones de copyright que impiden su descarga';
        }
        
        reject(new Error(errorMsg));
      }
    });
  });
}

// Ruta para descargar el audio con yt-dlp
app.get('/api/download', async (req, res) => {
  const videoURL = req.query.url;
  
  try {
    // Extraer y validar ID del video
    const videoId = getVideoId(videoURL);
    if (!videoId) {
      return res.status(400).json({ error: 'URL de YouTube inválida' });
    }
    
    console.log(`Iniciando descarga para: ${videoURL} (ID: ${videoId})`);
    
    // Comprobar si yt-dlp está instalado
    if (!ytDlpInstalled) {
      return res.status(500).json({ 
        error: 'Se requiere instalar yt-dlp para descargar videos protegidos. Por favor, instala yt-dlp y reinicia el servidor.' 
      });
    }
    
    // Generar nombre de archivo temporal único
    const tempFileName = crypto.randomBytes(16).toString('hex') + '.mp3';
    const tempFilePath = path.join(tempDir, tempFileName);
    console.log(`Archivo temporal: ${tempFilePath}`);
    
    // Obtener información del video para el título
    let title;
    try {
      // Intentar obtener información con yt-dlp
      const info = await getVideoInfoWithYtDlp(videoId);
      title = info.title;
    } catch (infoError) {
      // Intentar con ytdl-core como respaldo
      try {
        const options = { requestOptions: { headers: { 'User-Agent': getRandomUserAgent() } } };
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, options);
        title = info.videoDetails.title;
      } catch (ytdlError) {
        // Si no podemos obtener el título, usar el ID del video
        title = `YouTube Video ${videoId}`;
      }
    }
    
    // Sanitizar el título para evitar caracteres problemáticos
    const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
    console.log(`Título del video: ${sanitizedTitle}`);
    
    // Descargar con yt-dlp
    await downloadWithYtDlp(videoId, tempFilePath);
    
    // Verificar que el archivo existe antes de enviarlo
    fs.stat(tempFilePath, (err, stats) => {
      if (err || stats.size === 0) {
        console.error('El archivo descargado está vacío o no existe');
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        return res.status(500).json({ error: 'No se pudo descargar el contenido del video' });
      }
      
      // Establecer headers para indicar descarga
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.mp3"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      
      // Stream para enviar el archivo
      const fileStream = fs.createReadStream(tempFilePath);
      
      fileStream.on('error', (err) => {
        console.error('Error al leer archivo para enviar:', err);
        res.status(500).json({ error: 'Error al enviar el archivo' });
      });
      
      // Registrar cuando finaliza la respuesta
      res.on('finish', () => {
        console.log(`Archivo ${sanitizedTitle}.mp3 enviado correctamente`);
        
        // Eliminar archivo temporal después de enviarlo
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`Archivo temporal eliminado: ${tempFilePath}`);
        }
      });
      
      // Enviar el archivo
      fileStream.pipe(res);
    });
    
  } catch (error) {
    console.error('Error general al descargar:', error);
    
    // Eliminar archivo temporal si existe
    const tempFileName = req.query.tempfile;
    if (tempFileName && fs.existsSync(tempFileName)) {
      fs.unlinkSync(tempFileName);
    }
    
    // Mensaje de error más amigable para el usuario
    let errorMsg = error.message;
    
    if (error.message.includes('yt-dlp no está instalado')) {
      errorMsg = 'Se requiere instalar yt-dlp para descargar este video. Por favor, instale yt-dlp y reinicie el servidor.';
    } else if (error.message.includes('COPYRIGHT_STRIKE') || error.message.includes('copyright')) {
      errorMsg = 'Este video tiene restricciones de copyright que impiden su descarga';
    } else if (error.message.includes('Premium')) {
      errorMsg = 'Este video es exclusivo para usuarios Premium';
    } else if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      errorMsg = 'El video no está disponible o es privado';
    } else if (error.message.includes('No video id found')) {
      errorMsg = 'No se pudo identificar el video. Verifique la URL e intente nuevamente.';
    }
    
    res.status(500).json({ error: `Error al descargar: ${errorMsg}` });
  }
});

// Endpoint para verificar estado del servidor y herramientas disponibles
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: require('./package.json').version,
    ytdlp: ytDlpInstalled ? 'disponible' : 'no disponible'
  });
});

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  
  if (!ytDlpInstalled) {
    console.warn('\x1b[33m%s\x1b[0m', 'ADVERTENCIA: yt-dlp no está instalado o no está en el PATH.');
    console.warn('\x1b[33m%s\x1b[0m', 'Se recomienda instalar yt-dlp para mejorar la compatibilidad con videos protegidos.');
    console.warn('\x1b[33m%s\x1b[0m', 'Instrucciones de instalación:');
    console.warn('\x1b[33m%s\x1b[0m', '- Windows (con chocolatey): choco install yt-dlp');
    console.warn('\x1b[33m%s\x1b[0m', '- Windows (manual): Descarga desde https://github.com/yt-dlp/yt-dlp/releases y añádelo al PATH');
    console.warn('\x1b[33m%s\x1b[0m', '- macOS: brew install yt-dlp');
    console.warn('\x1b[33m%s\x1b[0m', '- Linux: apt/dnf/pacman install yt-dlp');
  }
});

// Configuración para Vercel
module.exports = app;