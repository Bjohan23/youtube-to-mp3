# YouTube a MP3 Converter

Aplicación web que permite descargar videos de YouTube en formato MP3 con la máxima calidad de audio disponible.

## Características

- Interfaz de usuario simple e intuitiva
- Obtención de información del video (título, miniatura, duración)
- Descarga de audio en formato MP3 con alta calidad
- Listo para desplegar en Vercel

## Requisitos

- Node.js 14 o superior
- npm o yarn

## Instalación

1. Clona este repositorio:
```
git clone <url-repositorio>
cd youtube-to-mp3
```

2. Instala las dependencias:
```
npm install
```

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

## Tecnologías utilizadas

- Node.js
- Express.js
- ytdl-core
- Bootstrap 5

## Licencia

ISC 