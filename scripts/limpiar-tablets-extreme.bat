@echo off
set DEVICE_ID=%1

if "%DEVICE_ID%"=="" (
    echo Error: Debes proporcionar un ID de dispositivo ADB.
    echo Ejemplo: clean-tablet.bat adb-tablet principalWiFi...
    exit /b 1
)

echo [*] Iniciando limpieza extrema en dispositivo: %DEVICE_ID%

:: Lista de paquetes para deshabilitar
set PACKAGES=( ^
    "com.google.android.youtube" ^
    "com.google.android.apps.youtube.music" ^
    "com.google.android.apps.docs" ^
    "com.google.android.apps.maps" ^
    "com.google.android.apps.photos" ^
    "com.google.android.gm" ^
    "com.google.android.talk" ^
    "com.google.android.videos" ^
    "com.google.android.apps.messaging" ^
    "com.google.android.contacts" ^
    "com.android.calendar" ^
    "com.android.contacts" ^
    "com.android.email" ^
    "com.android.gallery3d" ^
    "com.android.music" ^
    "com.android.calculator2" ^
    "com.google.android.apps.wellbeing" ^
    "com.google.android.googlequicksearchbox" ^
    "com.google.android.as" ^
    "com.android.vending" ^
    "com.blackview.apkupgrade" ^
    "com.incar.update" ^
    "com.google.android.apps.nbu.files" ^
    "com.google.android.apps.nbu.paisa.user" ^
    "com.google.android.apps.fitness" ^
    "com.google.android.apps.magazines" ^
    "com.google.android.apps.podcasts" ^
    "com.google.android.projection.gearhead" ^
    "com.android.printspooler" ^
)

for %%p in %PACKAGES% do (
    echo [-] Deshabilitando %%p...
    adb -s %DEVICE_ID% shell pm disable-user --user 0 %%p
)

echo [!] Limpieza completada. 
echo [!] Se recomienda reiniciar la tablet para aplicar todos los cambios de memoria.
adb -s %DEVICE_ID% reboot
