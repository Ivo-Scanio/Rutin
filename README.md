# Rutin

## Para usar la app

No hace falta instalar programas en la computadora ni en el celular: abre la dirección de Rutin en un navegador e inicia sesión con Google.

Si aparece un error de permisos de Google Drive, cierra sesión y vuelve a iniciar sesión aceptando los permisos solicitados por Rutin. Si Google no vuelve a pedirlos, quita el acceso anterior desde [los permisos de tu cuenta de Google](https://myaccount.google.com/permissions) y vuelve a entrar.

## Para ejecutar Rutin localmente

1. `npm install`
2. Copiá `.env.example` a `.env.local` y completá los valores.
3. Google Cloud Console → proyecto nuevo:
   - Habilitar **Google Drive API**.
   - Pantalla de consentimiento OAuth (External, agregarte como usuario de prueba y declarar los permisos `https://www.googleapis.com/auth/drive.appdata` y `https://www.googleapis.com/auth/calendar.events`).
   - Credenciales → ID de cliente OAuth (Aplicación web).
     - Origen autorizado: `http://localhost:3000`
     - URI de redirección: `http://localhost:3000/api/auth/callback/google`
4. `npm run dev`

Los datos se guardan en `rutin-data.json` dentro de la carpeta oculta de la app en el Drive del usuario (scope `drive.appdata`).
