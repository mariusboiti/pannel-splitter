# Panel Splitter - LaserFilesPro

A production-ready web tool for splitting large SVG designs into multiple bed-sized tiles for laser cutting. Everything runs client-side in the browser.

## Features

### Core Features
- **Drag & Drop Upload**: Upload SVG files with automatic dimension detection
- **Unit Conversion**: Auto-detect units or force PX→MM conversion at 96 or 72 DPI
- **Configurable Bed Size**: Set your laser bed dimensions with margin and overlap
- **Two Export Modes**:
  - **Laser-Safe Trim** (default): Real geometry trimming using boolean operations
  - **Fast Clip**: Uses clipPath (faster but may not work in all laser software)
- **Tile Numbering**: Multiple formats (R01C01, 01-01, Tile_001) with configurable start index
- **Alignment Guides**: Optional tile borders and corner crosshairs
- **Progress Tracking**: Non-blocking processing with cancel support
- **ZIP Export**: Download all tiles with README summary

### V2 Features
- **Registration Marks**: Add alignment marks to each tile for precise assembly
  - Types: Corner Crosshair, Pin Holes, L-Marks
  - Configurable size, stroke width, and placement (inside tile or on overlap)
- **Assembly Map**: Auto-generated SVG map showing tile layout
  - Grid overview with tile labels
  - Design dimensions and settings legend
  - Assembly order instructions

## Installation

```bash
cd panel-splitter
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:5173 in Chrome.

## Production Build

```bash
npm run build
npm run preview
```

## Usage

1. **Upload SVG**: Drag & drop or click to select an SVG file
2. **Configure Settings**:
   - Set bed width/height (default: 300×200mm)
   - Set margin (default: 5mm)
   - Set overlap if needed (default: 0mm)
   - Choose export mode (Laser-Safe Trim recommended)
3. **Preview**: See the grid overlay on your design
4. **Generate**: Click "Generate Tiles" to process
5. **Export**: Click "Download ZIP" to get all tiles

## Configuration Constants

Edit `src/App.tsx` to change default settings:

```typescript
const DEFAULT_SETTINGS: SettingsType = {
  bedWidth: 300,      // mm
  bedHeight: 200,     // mm
  margin: 5,          // mm
  overlap: 0,         // mm
  exportMode: 'laser-safe',
  numberingEnabled: true,
  numberingFormat: 'R01C01',
  guidesEnabled: false,
  expandStrokes: false,
  simplifyTolerance: 0,
  exportEmptyTiles: false,
  unitMode: 'auto',
};
```

## Testing Checklist

### Basic Tests
- [ ] Upload a simple rectangle SVG
- [ ] Verify tile grid appears correctly
- [ ] Generate tiles and check progress bar
- [ ] Download ZIP and verify contents

### Advanced Tests
- [ ] Test with complex mandala/pattern SVG
- [ ] Verify tile numbering matches grid position
- [ ] Check that tiles align when assembled
- [ ] Import a laser-safe tile into LightBurn - verify no clipping artifacts

### V2 Feature Tests
- [ ] Enable registration marks and verify they appear on exported tiles
- [ ] Test all mark types: crosshair, pinhole, L-marks
- [ ] Verify marks align between adjacent tiles when assembled
- [ ] Enable assembly map and verify it's included in ZIP
- [ ] Check assembly_map.svg shows correct grid layout and labels
- [ ] Test startIndexAtOne toggle (R01C01 vs R00C00)

### Edge Cases
- [ ] SVG with only strokes (no fills)
- [ ] SVG with nested groups and transforms
- [ ] SVG with viewBox but no width/height
- [ ] Very large SVG (>1000mm)
- [ ] SVG that fits in single tile

## Tech Stack

- **Vite** + **React** + **TypeScript**
- **TailwindCSS** for styling
- **Paper.js** for SVG parsing and boolean operations
- **JSZip** for ZIP creation
- **file-saver** for downloads

## File Structure

```
panel-splitter/
├── src/
│   ├── components/
│   │   ├── Uploader.tsx      # File upload with drag & drop
│   │   ├── Settings.tsx      # Configuration panel
│   │   ├── PreviewCanvas.tsx # Canvas with zoom/pan
│   │   ├── TileList.tsx      # Tile selection list
│   │   ├── ExportBar.tsx     # Progress and export buttons
│   │   └── Tooltip.tsx       # Help tooltips
│   ├── lib/svg/
│   │   ├── parser.ts         # SVG parsing and unit conversion
│   │   ├── grid.ts           # Grid computation
│   │   ├── tiler.ts          # Paper.js tiling logic
│   │   └── export.ts         # ZIP generation
│   ├── types.ts              # TypeScript interfaces
│   ├── App.tsx               # Main application
│   ├── main.tsx              # Entry point
│   └── styles.css            # Tailwind imports
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Known Limitations

- Boolean operations may fail on very complex paths (fallback includes original geometry)
- Expand Strokes feature is simplified (full offset not implemented)
- Best tested on Chrome; other browsers may have varying Paper.js support

## License

MIT
