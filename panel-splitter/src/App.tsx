import { useState, useCallback, useRef, useEffect } from 'react';
import { Uploader } from './components/Uploader';
import { Settings } from './components/Settings';
import { PreviewCanvas } from './components/PreviewCanvas';
import { TileList } from './components/TileList';
import { ExportBar } from './components/ExportBar';
import { parseSVG } from './lib/svg/parser';
import { computeGrid } from './lib/svg/grid';
import { processTiles } from './lib/svg/tiler';
import { exportToZip } from './lib/svg/export';
import {
  SVGInfo,
  Settings as SettingsType,
  GridInfo,
  TileInfo,
  ProcessingState,
  ValidationError,
  UnitMode,
} from './types';

const DEFAULT_SETTINGS: SettingsType = {
  bedWidth: 300,
  bedHeight: 200,
  margin: 5,
  overlap: 0,
  exportMode: 'laser-safe',
  numberingEnabled: true,
  numberingFormat: 'R01C01',
  startIndexAtOne: true,
  guidesEnabled: false,
  expandStrokes: false,
  simplifyTolerance: 0,
  exportEmptyTiles: false,
  unitMode: 'auto',
  registrationMarks: {
    enabled: false,
    type: 'crosshair',
    placement: 'inside',
    size: 6,
    strokeWidth: 0.2,
    holeDiameter: 2,
  },
  assemblyMap: {
    enabled: true,
    includeLabels: true,
    includeThumbnails: false,
  },
};

function validateSettings(settings: SettingsType): ValidationError[] {
  const errors: ValidationError[] = [];

  if (settings.bedWidth < 10) {
    errors.push({ field: 'bedWidth', message: 'Bed width must be at least 10mm' });
  }
  if (settings.bedHeight < 10) {
    errors.push({ field: 'bedHeight', message: 'Bed height must be at least 10mm' });
  }
  if (settings.margin < 0) {
    errors.push({ field: 'margin', message: 'Margin cannot be negative' });
  }
  if (settings.overlap < 0) {
    errors.push({ field: 'overlap', message: 'Overlap cannot be negative' });
  }

  const effectiveWidth = settings.bedWidth - 2 * settings.margin;
  const effectiveHeight = settings.bedHeight - 2 * settings.margin;

  if (effectiveWidth <= 0) {
    errors.push({ field: 'margin', message: 'Margin too large for bed width' });
  }
  if (effectiveHeight <= 0) {
    errors.push({ field: 'margin', message: 'Margin too large for bed height' });
  }
  if (settings.overlap >= effectiveWidth) {
    errors.push({ field: 'overlap', message: 'Overlap must be less than effective tile width' });
  }
  if (settings.overlap >= effectiveHeight) {
    errors.push({ field: 'overlap', message: 'Overlap must be less than effective tile height' });
  }

  return errors;
}

export default function App() {
  const [svgInfo, setSvgInfo] = useState<SVGInfo | null>(null);
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [gridInfo, setGridInfo] = useState<GridInfo | null>(null);
  const [selectedTile, setSelectedTile] = useState<TileInfo | null>(null);
  const [processedTiles, setProcessedTiles] = useState<TileInfo[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 900;
    const stored = window.localStorage.getItem('panelSplitter:leftPaneWidth');
    const parsed = stored ? Number(stored) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Math.round(Math.min(980, Math.max(520, window.innerWidth * 0.62)));
  });
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    currentTile: 0,
    totalTiles: 0,
    phase: 'idle',
    error: null,
  });

  const cancelRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('panelSplitter:leftPaneWidth', String(leftPaneWidth));
  }, [leftPaneWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      const start = resizeStartRef.current;
      const wrapper = layoutRef.current;
      if (!start || !wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      const minLeft = 420;
      const minRight = 340;
      const maxLeft = Math.max(minLeft, rect.width - minRight - 12);
      const next = start.width + (e.clientX - start.x);
      setLeftPaneWidth(Math.max(minLeft, Math.min(maxLeft, Math.round(next))));
    };

    const onUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const errors = validateSettings(settings);
    setValidationErrors(errors);

    if (svgInfo && errors.length === 0) {
      try {
        const grid = computeGrid(svgInfo.detectedWidthMm, svgInfo.detectedHeightMm, settings);
        setGridInfo(grid);
        setProcessedTiles([]);
        setSelectedTile(null);
      } catch (err) {
        setGridInfo(null);
        setValidationErrors([{
          field: 'general',
          message: err instanceof Error ? err.message : 'Failed to compute grid',
        }]);
      }
    } else if (!svgInfo) {
      setGridInfo(null);
    }
  }, [svgInfo, settings]);

  const handleSVGLoaded = useCallback((info: SVGInfo) => {
    setSvgInfo(info);
    setProcessedTiles([]);
    setSelectedTile(null);
    setProcessingState(prev => ({ ...prev, error: null, phase: 'idle' }));
  }, []);

  const handleUnitModeChange = useCallback((mode: UnitMode) => {
    setSettings(prev => ({ ...prev, unitMode: mode }));
    
    if (svgInfo) {
      try {
        const reparsed = parseSVG(svgInfo.originalContent, svgInfo.fileName, mode);
        setSvgInfo(reparsed);
      } catch (err) {
        console.error('Failed to reparse SVG with new unit mode:', err);
      }
    }
  }, [svgInfo]);

  const handleGenerate = useCallback(async () => {
    if (!svgInfo || !gridInfo || validationErrors.length > 0) return;

    cancelRef.current = false;
    setProcessingState({
      isProcessing: true,
      currentTile: 0,
      totalTiles: gridInfo.tiles.length,
      phase: 'preparing',
      error: null,
    });

    try {
      setProcessingState(prev => ({ ...prev, phase: 'tiling' }));

      const results = await processTiles(
        svgInfo,
        gridInfo,
        settings,
        (current, total) => {
          setProcessingState(prev => ({
            ...prev,
            currentTile: current,
            totalTiles: total,
          }));
        },
        () => cancelRef.current
      );

      const updatedTiles = gridInfo.tiles.map(tile => {
        const result = results.find(r => r.tile.id === tile.id);
        return result ? result.tile : { ...tile, isEmpty: true };
      });

      setProcessedTiles(updatedTiles);
      setGridInfo(prev => prev ? { ...prev, tiles: updatedTiles } : null);
      setProcessingState({
        isProcessing: false,
        currentTile: gridInfo.tiles.length,
        totalTiles: gridInfo.tiles.length,
        phase: 'done',
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      setProcessingState({
        isProcessing: false,
        currentTile: 0,
        totalTiles: 0,
        phase: 'idle',
        error: message === 'Processing cancelled' ? null : message,
      });
    }
  }, [svgInfo, gridInfo, settings, validationErrors]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setProcessingState(prev => ({ ...prev, phase: 'cancelled' }));
  }, []);

  const handleExport = useCallback(async () => {
    if (!svgInfo || !gridInfo || processedTiles.length === 0) return;

    setProcessingState(prev => ({ ...prev, isProcessing: true, phase: 'exporting' }));

    try {
      await exportToZip({
        svgInfo,
        settings,
        gridInfo,
        tiles: processedTiles,
      });

      setProcessingState(prev => ({ ...prev, isProcessing: false, phase: 'done' }));
    } catch (err) {
      setProcessingState(prev => ({
        ...prev,
        isProcessing: false,
        phase: 'idle',
        error: err instanceof Error ? err.message : 'Export failed',
      }));
    }
  }, [svgInfo, gridInfo, settings, processedTiles]);

  const canGenerate = svgInfo !== null && gridInfo !== null && validationErrors.length === 0 && !processingState.isProcessing;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8" viewBox="0 0 100 100">
              <rect x="5" y="5" width="40" height="40" fill="#0ea5e9" rx="4"/>
              <rect x="55" y="5" width="40" height="40" fill="#38bdf8" rx="4"/>
              <rect x="5" y="55" width="40" height="40" fill="#38bdf8" rx="4"/>
              <rect x="55" y="55" width="40" height="40" fill="#0ea5e9" rx="4"/>
            </svg>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Panel Splitter</h1>
              <p className="text-sm text-gray-500">LaserFilesPro</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto p-4">
        {/* Mobile / small screens: stacked */}
        <div className="grid grid-cols-1 gap-4 lg:hidden">
          <div className="h-[500px]">
            <PreviewCanvas
              svgInfo={svgInfo}
              gridInfo={gridInfo}
              selectedTile={selectedTile}
              onTileSelect={setSelectedTile}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TileList
              gridInfo={gridInfo}
              selectedTile={selectedTile}
              onTileSelect={setSelectedTile}
            />
            <ExportBar
              gridInfo={gridInfo}
              processingState={processingState}
              processedTiles={processedTiles}
              onGenerate={handleGenerate}
              onCancel={handleCancel}
              onExport={handleExport}
              canGenerate={canGenerate}
            />
          </div>
          <Uploader
            onSVGLoaded={handleSVGLoaded}
            unitMode={settings.unitMode}
            onUnitModeChange={handleUnitModeChange}
            svgInfo={svgInfo}
          />
          <Settings
            settings={settings}
            onChange={setSettings}
            errors={validationErrors}
          />
        </div>

        {/* Desktop: sticky left pane + resizable splitter + scrollable right pane */}
        <div ref={layoutRef} className="hidden lg:flex gap-4">
          <div
            className="sticky top-4 self-start"
            style={{ width: leftPaneWidth, height: 'calc(100vh - 140px)' }}
          >
            <div className="h-full flex flex-col gap-4">
              <div className="flex-1 min-h-[360px]">
                <PreviewCanvas
                  svgInfo={svgInfo}
                  gridInfo={gridInfo}
                  selectedTile={selectedTile}
                  onTileSelect={setSelectedTile}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TileList
                  gridInfo={gridInfo}
                  selectedTile={selectedTile}
                  onTileSelect={setSelectedTile}
                />
                <ExportBar
                  gridInfo={gridInfo}
                  processingState={processingState}
                  processedTiles={processedTiles}
                  onGenerate={handleGenerate}
                  onCancel={handleCancel}
                  onExport={handleExport}
                  canGenerate={canGenerate}
                />
              </div>
            </div>
          </div>

          <div
            className={`w-2 -mx-1 cursor-col-resize rounded hover:bg-gray-300/60 ${isResizing ? 'bg-gray-300/80' : 'bg-transparent'}`}
            onMouseDown={(e) => {
              e.preventDefault();
              resizeStartRef.current = { x: e.clientX, width: leftPaneWidth };
              setIsResizing(true);
            }}
            title="Drag to resize"
          />

          <div className="flex-1 space-y-4">
            <Uploader
              onSVGLoaded={handleSVGLoaded}
              unitMode={settings.unitMode}
              onUnitModeChange={handleUnitModeChange}
              svgInfo={svgInfo}
            />
            <Settings
              settings={settings}
              onChange={setSettings}
              errors={validationErrors}
            />
          </div>
        </div>
      </main>

      <footer className="mt-8 py-4 border-t border-gray-200 bg-white">
        <div className="max-w-screen-2xl mx-auto px-4 text-center text-sm text-gray-500">
          Panel Splitter by LaserFilesPro • Client-side SVG tiling for laser cutters
        </div>
      </footer>
    </div>
  );
}
