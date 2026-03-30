<p align="center">
  <img src="logo.svg" alt="GPX Editor Logo" width="320"/>
</p>

# GPX Editor — Power & Speed

GPX Editor è un'applicazione web standalone per modificare file GPX di attività ciclistiche (nativamente compatibile con Garmin Connect e Strava). Tutto il processing avviene localmente nel browser: i tuoi dati non lasciano mai il computer.

## Funzionalità principali

- **Zero dipendenze server**: Funziona 100% offline.
- **Dashboard attività**: Visualizzazione immediata di 6 KPI (Potenza media, Velocità media, Distanza, Durata, Trackpoints, Dislivello +).
- **Grafico Profilo**: Profilo altimetrico e potenza sovrapposta tramite Chart.js.
- **Modifica Proporzionale**:
  - **Watt**: Scala tutti i dati di potenza basandosi su un target medio.
  - **Velocità**: Comprime o dilata i timestamp per raggiungere la velocità media desiderata senza alterare le coordinate GPS.
- **Export**: Scarica il file modificato pronto per la re-importazione.
- **Dark/Light Mode**: Supporto per temi chiaro e scuro.

## Come iniziare

1. Apri `index.html` nel tuo browser.
2. Trascina un file `.gpx` nella zona di caricamento.
3. Seleziona la modalità di modifica (Watt, Velocità o entrambi).
4. Inserisci i valori target.
5. Clicca su "Esporta" per scaricare il nuovo file.

## Note tecniche

- L'app utilizza un parser XML nativo del browser.
- I grafici sono campionati automaticamente per garantire fluidità anche con file molto grandi.
- Se il file originale non contiene dati di potenza, le opzioni relative ai Watt verranno disabilitate o segnalate.

## Privacy

L'app non invia dati a server esterni. I file vengono letti localmente tramite l'API `FileReader` e processati in memoria.

---
Sviluppato per appassionati di ciclismo e data analysis.
