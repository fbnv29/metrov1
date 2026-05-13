
## **Objetivo General**

Desarrollar una aplicación de metrónomo enfocada exclusivamente en performance en vivo para músicos de iglesia, priorizando:

- rapidez operacional,
- estabilidad,
- respuesta inmediata,
- compatibilidad multiplataforma,
- control MIDI,
- gestión de setlists,
- experiencia visual clara,
- y funcionamiento offline.

La aplicación NO está pensada como secuenciador, DAW ni reproductor de pistas.  
El metrónomo es el protagonista absoluto de la interfaz y del flujo de trabajo.

---

# **Problema Actual**

Las soluciones existentes presentan problemas importantes:

## **Experiencia con Ableton Live**

Aspectos positivos:

- Sonido del metrónomo muy agradable.
- Excelente sistema de MIDI Mapping.
- Posibilidad de manejar distintos tempos.
- Buen motor de audio.
- Funciones avanzadas como nudge tempo (ralentizar/acelerar momentáneamente).

Problemas detectados:

- Interfaz demasiado compleja para un uso exclusivamente de metrónomo.
- El metrónomo está oculto dentro de un DAW orientado a producción musical.
- No posee gestión eficiente de bancos de canciones/setlists.
- Requiere configuración manual constante.
- Las subdivisiones rítmicas no son naturales de configurar.
- Exceso de funciones innecesarias para el contexto real de uso.

---

## **Experiencia con Metronome Beats Pro**

Aspectos positivos:

- Sistema de base de datos de canciones.
- Sincronización entre múltiples usuarios.
- Flujo de trabajo rápido para ensayos y cultos.
- Interfaz centrada en el metrónomo.
- Controles grandes y visibles.
- Navegación rápida durante performance en vivo.

Problemas detectados:

- Latencia perceptible al iniciar/detener reproducción.
- Imposibilidad de reenganchar el metrónomo exactamente en tiempo real.
- Dependencia de anticipación manual del operador.
- Licencia pagada poco viable para grupos completos.
- Diseño visual mejorable.
- Motor de audio menos satisfactorio que Ableton Live.

---

# **Requisitos Funcionales**

## **Motor de Metrónomo**

La aplicación debe incluir:

- Cambio de BPM en tiempo real.
- Tap Tempo.
- Inicio/parada instantánea sin latencia perceptible.
- Reinicio siempre desde el tiempo 1.
- Soporte de compases:
    - 4/4
    - 3/4
    - 6/8
    - configurables.
- Soporte de subdivisiones:
    - negra,
    - corchea,
    - negra con punto,
    - corchea con punto,
    - semicorchea.
- Sistema de acentos configurable:
    - activar/desactivar tiempos individualmente,
    - modificar intensidad/acento.
- Sonido de metrónomo agradable y profesional similar al de Ableton Live.

---

# **Control en Vivo**

La aplicación debe estar optimizada para operación en escenario.

## **Controles rápidos**

Teclado:

- Espacio:
    - detener/reanudar metrónomo.
- Enter:
    - avanzar canción.
- Flechas:
    - navegar setlist.
- Cambio inmediato entre canciones.

## **Cambio cuantizado**

Cuando se cambia de canción durante reproducción:

- el cambio debe ejecutarse al finalizar el compás actual,
- nunca cortar abruptamente el tiempo musical.

---

# **MIDI Support**

Soporte completo de MIDI Mapping.

Debe permitir:

- asignar cualquier control MIDI,
- mapear botones,
- teclas,
- pads,
- controladores externos,
- teclados MIDI.

La experiencia debe ser similar al sistema de MIDI Mapping de Ableton Live.

---

# **Gestión de Canciones y Setlists**

## **Banco de canciones**

Base de datos con:

- nombre canción,
- artista,
- BPM,
- métrica,
- subdivisión,
- configuración de acentos.

Debe permitir:

- crear,
- editar,
- eliminar,
- buscar canciones rápidamente.

---

## **Setlists**

El usuario debe poder:

- crear setlists,
- guardar setlists,
- cargar setlists,
- navegar canciones rápidamente durante performance.

Prioridad principal:  
uso en vivo y navegación rápida.

---

# **Arquitectura Deseada**

## **Enfoque Principal**

Aplicación web local offline-first.

La aplicación NO debe depender de tiendas de aplicaciones.

Objetivo:

- evitar costos,
- evitar publicación,
- evitar mantenimiento de App Store/Play Store.

---

# **Arquitectura Técnica Propuesta**

## **Frontend**

Aplicación web ejecutada localmente:

- HTML
- CSS
- JavaScript/TypeScript

Posibles frameworks:

- React
- Vue
- Svelte

Recomendación principal:  
React + Vite.

---

## **Audio Engine**

El metrónomo debe usar:

- Web Audio API
- scheduler de alta precisión
- audio timing basado en `AudioContext.currentTime`

NO debe depender de:

- `setTimeout`
- `setInterval`

porque generan jitter y latencia.

El motor debe funcionar con:

- scheduling predictivo,
- buffer timing,
- sample accurate playback.

---

# **Persistencia de Datos**

## **Online**

Base de datos remota opcional para sincronización.

Opciones recomendadas:

- Supabase
- Firebase

Recomendación principal:  
Supabase.

Razones:

- simple,
- económico,
- PostgreSQL real,
- sincronización sencilla,
- autenticación opcional,
- REST/WebSocket integrado.

---

## **Offline**

La aplicación debe funcionar completamente offline.

Opciones locales:

- IndexedDB
- SQLite WASM
- LocalStorage (solo para prototipo)

Recomendación principal:  
IndexedDB.

---

# **Flujo Offline/Online**

## **Con internet**

La app:

- sincroniza canciones,
- descarga base de datos,
- actualiza cambios,
- comparte contenido entre músicos.

---

## **Sin internet**

La app:

- sigue funcionando completamente,
- mantiene metrónomo operativo,
- permite crear setlists locales,
- almacena cambios temporalmente,
- sincroniza posteriormente.

Arquitectura:  
offline-first.

---

# **Interfaz de Usuario**

La interfaz debe priorizar:

- botones grandes,
- alta visibilidad,
- navegación rápida,
- lectura en escenario,
- contraste alto,
- mínima distracción.

El metrónomo debe ocupar el centro visual completo de la aplicación.

---

# **Diseño Visual Deseado**

Inspiración conceptual:

- Ableton Live:
    - estabilidad,
    - MIDI mapping,
    - sonido.
- Metronome Beats:
    - simplicidad,
    - protagonismo del metrónomo,
    - flujo en vivo.

Pero con:

- mejor diseño visual,
- UI moderna,
- experiencia fullscreen,
- estética minimalista profesional.

---

# **Compatibilidad**

Plataformas prioritarias:

- Windows
- macOS

Opcionales futuras:

- iOS
- Android

---

# **Distribución**

La aplicación idealmente debe poder ejecutarse como:

- página local,
- PWA,
- o aplicación empaquetada.

Opciones:

## **Opción 1 — PWA (recomendada inicialmente)**

Ventajas:

- offline,
- multiplataforma,
- barata,
- rápida de desarrollar,
- sin instalación compleja.

---

## **Opción 2 — Electron**

Ventajas:

- integración desktop,
- mejor acceso MIDI,
- acceso sistema operativo.

Desventajas:

- más pesada.

---

# **Requisitos Críticos**

## **Latencia**

El inicio/parada del metrónomo debe ser:

- instantáneo,
- sample accurate,
- sin retraso perceptible.

Esto es prioritario.

---

## **Robustez**

La aplicación debe soportar:

- uso prolongado,
- cambios rápidos,
- performance en vivo,
- recuperación rápida de errores.

---

# **Funciones Avanzadas Deseadas**

## **Tempo Nudge**

Inspirado en Ableton Live.

Permitir:

- acelerar temporalmente,
- ralentizar temporalmente,
- mantener sincronía en vivo.

Controlable por:

- teclado,
- MIDI.

---

# **Resumen Arquitectónico Final**

## **Stack recomendado**

Frontend:

- React + Vite

Audio:

- Web Audio API

Persistencia local:

- IndexedDB

Persistencia online:

- Supabase

MIDI:

- Web MIDI API

Empaquetado futuro:

- Electron o PWA

---

# **Prioridades Reales del Proyecto**

Orden real de importancia:

1. Latencia extremadamente baja.
2. Simplicidad operacional.
3. Flujo rápido en vivo.
4. Compatibilidad Windows/macOS.
5. MIDI Mapping.
6. Setlists.
7. Funcionamiento offline.
8. Sincronización online opcional.
9. Interfaz visual moderna.
10. Bajo costo de implementación.