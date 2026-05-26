# Vibeapp Android pilot release

## Estado actual

- SDK Android, JDK 21, platform-tools, NDK, CMake y licencias estan instalados localmente.
- El paquete Android piloto es `io.vibeapp.mobile`.
- APK debug verificado: `vibeapp/build/app/outputs/flutter-apk/app-debug.apk`.
- APK release firmado verificado para instalacion directa: `vibeapp/build/app/outputs/flutter-apk/app-release.apk`.
- App Bundle release firmado verificado para Play Console: `vibeapp/build/app/outputs/bundle/release/app-release.aab`.
- Upload key piloto local creada fuera del repositorio: `C:/Users/msusf/Documents/Codex/secure/vibeapp-upload-keystore.p12`.
- `vibeapp/android/key.properties` existe solo localmente y esta ignorado por Git.

## Regla de seguridad

Nunca subir a Git:

- `key.properties`
- `.jks`
- `.keystore`
- `.p12`
- passwords o claves de firma

La clave local permite probar el flujo completo de release. Antes de Play Console hay que decidir si esta misma upload key sera la definitiva o si se genera una nueva bajo custodia formal.

## Comandos de verificacion

Compuerta completa de piloto desde la raiz del repo:

```powershell
npm run verify:pilot
```

Esta orden ejecuta la validacion PWA, los PDFs ReportLab, la firma Android y Flutter `analyze`/`test`. Es el comando recomendado antes de publicar o entregar un paquete piloto.

Verificacion automatica desde la raiz del repo:

```powershell
npm run verify:android
```

Esa compuerta valida que existan APK/AAB release, que el APK este firmado, que `key.properties` siga ignorado por Git y que no haya secretos de firma trackeados.

Chequeo Flutter aislado desde la raiz del repo:

```powershell
npm run verify:flutter
```

Ese chequeo valida contrato Android, permisos, dependencias nativas, `flutter analyze` y `flutter test`. Si se quiere reconstruir APK/AAB dentro de la compuerta Flutter, usar:

```powershell
$env:VIBE_REBUILD_ANDROID='1'
npm run verify:flutter
```

Ejecutar desde `vibeapp`:

```powershell
$env:JAVA_HOME='C:\Users\msusf\Documents\Codex\Java\jdk-21'
$env:ANDROID_HOME='C:\Users\msusf\Documents\Codex\Android\sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat analyze
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat test
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat build apk --debug
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat build apk --release
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat build appbundle --release
```

Verificar firma del APK release:

```powershell
$env:JAVA_HOME='C:\Users\msusf\Documents\Codex\Java\jdk-21'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
C:\Users\msusf\Documents\Codex\Android\sdk\build-tools\35.0.0\apksigner.bat verify --verbose --print-certs vibeapp\build\app\outputs\flutter-apk\app-release.apk
```

Resultado esperado: `Verifies`, `Verified using v2 scheme: true`, un firmante y certificado `CN=Vibeapp Pilot`.

## Siguiente paso de piloto

1. Confirmar que `io.vibeapp.mobile` sera el identificador de paquete para pruebas.
2. Instalar el APK release firmado en un Android fisico para prueba rapida, o subir el AAB firmado a una pista interna de Play Console.
3. Validar inicio de sesion, captura de texto, foto, video, audio, ubicacion y cola offline.
4. Confirmar en la PWA que la experiencia creada desde Vibeapp aparece en Libreria, Activos, Reportes, Hallazgos y Publicaciones.
