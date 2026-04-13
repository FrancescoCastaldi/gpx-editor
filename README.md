<p align="center">
  <img src="logo.svg" alt="GPX Editor Logo" width="320"/>
</p>

# GPX Editor — Power & Speed

GPX Editor is a standalone web application for editing GPX files of cycling activities (natively compatible with Garmin Connect and Strava). All processing happens locally in the browser: your data never leaves your computer.

## Key Features

- **Zero server dependencies**: Works 100% offline.
- **Activity Dashboard**: Instant display of 6 KPIs (Average Power, Average Speed, Distance, Duration, Trackpoints, Elevation +).
- **Profile Chart**: Elevation profile and overlaid power via Chart.js.
- **Proportional Edit**:
  - **Watts**: Scales all power data based on a target average.
  - **Speed**: Compresses or stretches timestamps to reach the desired average speed without altering GPS coordinates.
- **Export**: Download the modified file ready for re-import.
- **Dark/Light Mode**: Support for light and dark themes.

## Getting Started

1. Open `index.html` in your browser.
2. Drag a `.gpx` file into the upload area.
3. Select the edit mode (Watts, Speed, or both).
4. Enter the target values.
5. Click "Export" to download the new file.

## Technical Notes

- The app uses the browser's native XML parser.
- Charts are automatically sampled to ensure smooth performance even with very large files.
- If the original file contains no power data, Watts-related options will be disabled or flagged.

## Privacy

The app does not send data to external servers. Files are read locally via the `FileReader` API and processed in memory.
