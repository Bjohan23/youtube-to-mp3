const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para verificar información del video
app.post('/api/info', async (req, res) => {
  const videoURL = req.body.url;
  if (!ytdl.validateURL(videoURL)) {
    return res.status(400).json({ error: 'URL de YouTube inválida' });
  }

  try {
    const info = await ytdl.getInfo(videoURL);
    res.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0].url,
      duration: info.videoDetails.lengthSeconds
    });
  } catch (error) {
    console.error('Error al obtener información del video:', error);
    res.status(500).json({ error: 'Error al obtener información del video' });
  }
});

// Ruta para descargar el audio
app.get('/api/download', async (req, res) => {
  const videoURL = req.query.url;
  if (!ytdl.validateURL(videoURL)) {
    return res.status(400).json({ error: 'URL de YouTube inválida' });
  }

  try {
    console.log(`Iniciando descarga para: ${videoURL}`);
    
    // Opciones avanzadas para evitar restricciones de YouTube
    const options = {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        }
      }
    };
    
    const info = await ytdl.getInfo(videoURL, options);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');
    
    // Generar nombre de archivo temporal único
    const tempFileName = crypto.randomBytes(16).toString('hex') + '.mp3';
    const tempFilePath = path.join(tempDir, tempFileName);
    
    console.log(`Archivo temporal: ${tempFilePath}`);
    console.log(`Título del video: ${title}`);

    // Obtener todos los formatos de audio disponibles
    let audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    // Si no hay formatos de audio específicos, intentar con formatos que tengan audio
    if (audioFormats.length === 0) {
      console.log('No se encontraron formatos de audio específicos, buscando formatos con audio...');
      audioFormats = info.formats.filter(format => format.hasAudio);
    }
    
    if (audioFormats.length === 0) {
      console.error('No se encontraron formatos de audio para:', videoURL);
      return res.status(500).json({ error: 'No se encontraron formatos de audio para este video' });
    }

    // Ordenar por calidad y seleccionar el mejor formato de audio
    audioFormats.sort((a, b) => {
      // Priorizar formatos que han funcionado bien en el pasado
      // (webm con opus suele funcionar mejor para descargas)
      if (a.container === 'webm' && a.audioCodec === 'opus') return -1;
      if (b.container === 'webm' && b.audioCodec === 'opus') return 1;
      
      // Luego ordenar por bitrate
      return b.audioBitrate - a.audioBitrate;
    });
    
    const selectedFormat = audioFormats[0];
    console.log(`Formatos de audio disponibles: ${audioFormats.length}`);
    console.log(`Seleccionando formato: ${selectedFormat.itag} (${selectedFormat.audioBitrate || 'desconocido'}kbps, ${selectedFormat.container})`);

    // Crear stream para descarga y escritura en archivo temporal
    const fileStream = fs.createWriteStream(tempFilePath);
    
    // Opciones avanzadas para la descarga
    const downloadOptions = {
      ...options,
      format: selectedFormat,
      range: {
        start: 0,
        end: undefined
      }
    };
    
    // Iniciar la descarga con opciones mejoradas
    const stream = ytdl(videoURL, downloadOptions);

    // Manejar eventos del stream
    stream.on('error', (err) => {
      console.error('Error en stream de ytdl:', err);
      fileStream.end();
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      
      // Mensaje de error más amigable para el usuario
      let errorMsg = err.message;
      if (err.message.includes('403')) {
        errorMsg = 'Este video tiene restricciones que impiden su descarga. Intente con otro video.';
      }
      
      if (!res.headersSent) {
        res.status(500).json({ error: `Error al descargar: ${errorMsg}` });
      }
    });
    
    let dataReceived = false;
    
    stream.on('data', () => {
      dataReceived = true;
    });
    
    // Establecer un timeout para detectar estancamientos
    const timeout = setTimeout(() => {
      if (!dataReceived) {
        stream.destroy(new Error('Timeout - No se recibieron datos'));
        fileStream.end();
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        if (!res.headersSent) {
          res.status(500).json({ error: 'La descarga se ha estancado. Intente con otro video o más tarde.' });
        }
      }
    }, 15000); // 15 segundos
    
    // Manejar eventos de escritura en archivo
    fileStream.on('error', (err) => {
      clearTimeout(timeout);
      console.error('Error escribiendo archivo temporal:', err);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: `Error al guardar archivo: ${err.message}` });
      }
    });

    // Cuando termine la descarga, enviar el archivo al cliente
    fileStream.on('finish', () => {
      clearTimeout(timeout);
      console.log(`Descarga completa, enviando archivo: ${title}.mp3`);
      
      // Verificar que el archivo tenga contenido
      fs.stat(tempFilePath, (err, stats) => {
        if (err || stats.size === 0) {
          console.error('El archivo descargado está vacío o no existe');
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          if (!res.headersSent) {
            res.status(500).json({ error: 'No se pudo descargar el contenido del video' });
          }
          return;
        }
        
        // Enviar el archivo al cliente
        res.download(tempFilePath, `${title}.mp3`, (err) => {
          // Eliminar el archivo temporal después de enviarlo
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`Archivo temporal eliminado: ${tempFilePath}`);
          }
          
          if (err) {
            console.error('Error al enviar archivo al cliente:', err);
          } else {
            console.log(`Archivo enviado exitosamente: ${title}.mp3`);
          }
        });
      });
    });

    // Iniciar descarga
    stream.pipe(fileStream);
    
  } catch (error) {
    console.error('Error al descargar el video:', error);
    
    // Mensaje de error más amigable para el usuario
    let errorMsg = error.message;
    if (error.message.includes('403')) {
      errorMsg = 'Este video tiene restricciones que impiden su descarga. Intente con otro video.';
    } else if (error.message.includes('Status code: 4')) {
      errorMsg = 'YouTube ha bloqueado temporalmente las descargas. Intente más tarde.';
    }
    
    res.status(500).json({ error: `Error al descargar: ${errorMsg}` });
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Configuración para Vercel
module.exports = app; 