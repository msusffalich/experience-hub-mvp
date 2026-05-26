# Vibeapp Android pilot release

## Estado actual

- SDK Android, JDK 21, platform-tools, NDK, CMake y licencias estan instalados localmente.
- El paquete Android piloto es `io.vibeapp.mobile`.
- APK debug verificado: `vibeapp/build/app/outputs/flutter-apk/app-debug.apk`.
- App Bundle release verificado: `vibeapp/build/app/outputs/bundle/release/app-release.aab`.
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

Ejecutar desde `vibeapp`:

```powershell
$env:JAVA_HOME='C:\Users\msusf\Documents\Codex\Java\jdk-21'
$env:ANDROID_HOME='C:\Users\msusf\Documents\Codex\Android\sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat analyze
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat test
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat build apk --debug
C:\Users\msusf\Documents\Codex\flutter-sdk\bin\flutter.bat build appbundle --release
```

## Siguiente paso de piloto

1. Confirmar que `io.vibeapp.mobile` sera el identificador de paquete para pruebas.
2. Instalar el APK debug en un Android fisico o subir el AAB a una pista interna de Play Console.
3. Validar inicio de sesion, captura de texto, foto, video, audio, ubicacion y cola offline.
4. Confirmar en la PWA que la experiencia creada desde Vibeapp aparece en Libreria, Activos, Reportes, Hallazgos y Publicaciones.
