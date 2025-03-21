# YouTube a MP3 Converter

Aplicación web que permite descargar videos de YouTube en formato MP3 con la máxima calidad de audio disponible.

## Características

- Interfaz de usuario simple e intuitiva
- Obtención de información del video (título, miniatura, duración)
- Descarga de audio en formato MP3 con alta calidad
- Soporte para yt-dlp para descargar videos con restricciones
- Tema claro/oscuro
- Personalización de colores de la interfaz
- Sistema de alertas visuales
- Manejo mejorado de diferentes formatos de URL de YouTube
- Listo para desplegar en Vercel

## Requisitos

- Node.js 14 o superior
- npm o yarn
- yt-dlp (opcional, recomendado para mejor compatibilidad)

## Instalación

1. Clona este repositorio:
```
git clone https://github.com/Bjohan23/youtube-to-mp3.git
cd youtube-to-mp3
```

2. Instala las dependencias:
```
npm install
```

3. (Opcional) Instala yt-dlp para mejorar la compatibilidad con videos protegidos:
   - Windows (con chocolatey): `choco install yt-dlp`
   - Windows (manual): Descarga desde https://github.com/yt-dlp/yt-dlp/releases y añádelo al PATH
   - macOS: `brew install yt-dlp`
   - Linux: `apt/dnf/pacman install yt-dlp`

## Uso

1. Inicia el servidor de desarrollo:
```
npm run dev
```

2. Abre tu navegador y accede a `http://localhost:3000`

3. Ingresa la URL del video de YouTube que deseas convertir a MP3

4. Haz clic en "Convertir a MP3" y espera a que se procese

5. Haz clic en "Descargar MP3" para descargar el archivo de audio

## Despliegue en Vercel

Para desplegar esta aplicación en Vercel:

1. Crea una cuenta en [Vercel](https://vercel.com) si aún no tienes una

2. Instala la CLI de Vercel:
```
npm install -g vercel
```

3. Ejecuta el comando de despliegue:
```
vercel
```

4. Sigue las instrucciones para completar el despliegue

## Limitaciones

- Esta aplicación está destinada solo para uso personal
- Descarga únicamente contenido del cual tengas derechos o que esté bajo licencias que permitan su descarga
- YouTube puede cambiar su API en cualquier momento, lo que podría afectar la funcionalidad
- Algunos videos con restricciones especiales pueden requerir yt-dlp para su descarga

## Tecnologías utilizadas

- Node.js
- Express.js
- ytdl-core
- yt-dlp (opcional)
- Tailwind CSS
- JavaScript

## Licencia

ISC 