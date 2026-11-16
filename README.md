# Rutin

1. `npm install`
2. Copiá `.env.example` a `.env.local` y completá los valores.
3. Google Cloud Console → proyecto nuevo:
   - Habilitar **Google Drive API**.
   - Pantalla de consentimiento OAuth (External, agregarte como usuario de prueba).
   - Credenciales → ID de cliente OAuth (Aplicación web).
     - Origen autorizado: `http://localhost:3000`
     - URI de redirección: `http://localhost:3000/api/auth/callback/google`
4. `npm run dev`

Los datos se guardan en `rutin-data.json` dentro de la carpeta oculta de la app en el Drive del usuario (scope `drive.appdata`).
