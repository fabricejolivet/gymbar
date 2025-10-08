import { useState, useEffect, useRef } from 'react';
import { Activity, Info, X, RotateCcw } from 'lucide-react';
import { RepDisplacementGraph } from '../charts/RepDisplacementGraph';
import { useEKFStore } from '../../state/ekfStore';
import { dataRouter } from '../../state/dataRouter';
import { BarbellRepDetector } from '../../core/reps/barbell';
import type { RepCounterConfig } from '../../core/reps/barbell';

interface RepCounterTuningProps {
  config: RepCounterConfig;
  onChange: (config: Partial<RepCounterConfig>) => void;
}

type RepPhase = 'idle' | 'descent' | 'ascent' | 'lockout';

export function RepCounterTuning({ config, onChange }: RepCounterTuningProps) {
  const [displacementData, setDisplacementData] = useState<Array<{ time: number; position: number; velocity: number; phase: RepPhase }>>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<RepPhase>('idle');
  const repDetectorRef = useRef(new BarbellRepDetector(config));
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    repDetectorRef.current.setConfig(config);
  }, [config]);

  const handleReset = () => {
    repDetectorRef.current.reset();
    setRepCount(0);
    setCurrentPhase('idle');
    setDisplacementData([]);
  };

  useEffect(() => {
    const handleSample = () => {
      try {
        const ekfState = useEKFStore.getState().state;
        const vz = ekfState.v[2] * 100;
        const vy = ekfState.v[1] * 100;
        const pz = ekfState.p[2] * 100;
        const py = ekfState.p[1] * 100;

        const rep = repDetectorRef.current.update(
          pz,
          vz,
          py,
          vy,
          0,
          0,
          Date.now()
        );

        if (rep) {
          setRepCount(prev => prev + 1);
        }

        const detectorState = repDetectorRef.current.getState();
        setCurrentPhase(detectorState);

        if (showGraph) {
          const now = Date.now();
          if (now - lastUpdateRef.current >= 20) {
            lastUpdateRef.current = now;
            const position = config.mode === 'vertical' ? pz : py;
            const velocity = config.mode === 'vertical' ? vz : vy;
            setDisplacementData(prev => {
              const newData = [...prev, { time: now, position, velocity, phase: detectorState }];
              return newData.slice(-300);
            });
          }
        }
      } catch (err) {
        console.error('[RepCounterTuning] Error processing sample:', err);
      }
    };

    const unsubscribe = dataRouter.subscribe(handleSample);
    return () => unsubscribe();
  }, [showGraph]);

  const getPhaseColor = (phase: RepPhase) => {
    switch (phase) {
      case 'descent': return 'text-red-400';
      case 'ascent': return 'text-blue-400';
      case 'lockout': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="bg-gym-card border border-gym-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-gym-accent" />
          <h2 className="text-base font-bold text-white">Rep Counter</h2>
          <div className="flex items-center gap-2 ml-2">
            <span className="text-2xl font-bold text-gym-accent">{repCount}</span>
            <span className={`text-xs font-bold uppercase ${getPhaseColor(currentPhase)}`}>
              {currentPhase}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="p-1 rounded-lg hover:bg-gym-bg transition-colors"
            title="Reset counter"
          >
            <RotateCcw size={16} className="text-gray-400" />
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-1 rounded-lg hover:bg-gym-bg transition-colors"
          >
            {showHelp ? <X size={18} className="text-gray-400" /> : <Info size={18} className="text-gray-400" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => onChange({ mode: 'vertical' })}
          className={`py-2 px-3 rounded-lg text-sm font-bold transition-colors ${
            config.mode === 'vertical'
              ? 'bg-gym-accent text-gym-bg'
              : 'bg-gym-bg text-gray-400 border border-gym-border'
          }`}
        >
          Vertical
        </button>
        <button
          onClick={() => onChange({ mode: 'horizontal' })}
          className={`py-2 px-3 rounded-lg text-sm font-bold transition-colors ${
            config.mode === 'horizontal'
              ? 'bg-gym-accent text-gym-bg'
              : 'bg-gym-bg text-gray-400 border border-gym-border'
          }`}
        >
          Horizontal
        </button>
      </div>

      <button
        onClick={() => {
          setShowGraph(!showGraph);
          if (!showGraph) {
            setDisplacementData([]);
          }
        }}
        className="w-full mb-3 py-2 px-3 rounded-lg text-sm font-bold transition-colors bg-gym-bg text-gray-400 border border-gym-border hover:border-gym-accent"
      >
        {showGraph ? 'Hide Graph' : 'Show Graph'}
      </button>

      {showGraph && (
        <RepDisplacementGraph
          displacementData={displacementData}
          minROM={config.minROM_cm}
          minDescent={config.minDescentChange_cm ?? 2}
          minAscent={config.minAscentChange_cm ?? 2}
          mode={config.mode}
        />
      )}

      <div className="space-y-3 mt-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Min ROM</label>
            <span className="text-white font-mono text-xs">{config.minROM_cm} cm</span>
          </div>
          <input
            type="range"
            min="10"
            max="80"
            step="5"
            value={config.minROM_cm}
            onChange={(e) => onChange({ minROM_cm: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Min Descent</label>
            <span className="text-white font-mono text-xs">{config.minDescentChange_cm?.toFixed(1) ?? '2.0'} cm</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={config.minDescentChange_cm ?? 2}
            onChange={(e) => onChange({ minDescentChange_cm: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Min Ascent</label>
            <span className="text-white font-mono text-xs">{config.minAscentChange_cm?.toFixed(1) ?? '2.0'} cm</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={config.minAscentChange_cm ?? 2}
            onChange={(e) => onChange({ minAscentChange_cm: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Lockout Velocity</label>
            <span className="text-white font-mono text-xs">{config.lockoutVelocity_cms ?? 10} cm/s</span>
          </div>
          <input
            type="range"
            min="2"
            max="30"
            step="1"
            value={config.lockoutVelocity_cms ?? 10}
            onChange={(e) => onChange({ lockoutVelocity_cms: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
          <p className="text-xs text-gray-500 mt-1">Max velocity to trigger lockout</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Lockout Duration</label>
            <span className="text-white font-mono text-xs">{config.lockoutDuration_ms} ms</span>
          </div>
          <input
            type="range"
            min="50"
            max="1000"
            step="50"
            value={config.lockoutDuration_ms}
            onChange={(e) => onChange({ lockoutDuration_ms: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
          <p className="text-xs text-gray-500 mt-1">Hold time at top</p>
        </div>
      </div>

      {showHelp && (
        <div className="mt-4 p-3 bg-gym-bg border border-gym-border rounded-lg space-y-2 text-xs">
          <div>
            <span className="text-gym-accent font-bold">Mode:</span>
            <span className="text-gray-400 ml-1">Vertical for squats/presses, Horizontal for rows</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Min ROM:</span>
            <span className="text-gray-400 ml-1">Total distance bar must travel to count as valid rep</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Min Descent:</span>
            <span className="text-gray-400 ml-1">Distance bar must move down to trigger ascent phase</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Min Ascent:</span>
            <span className="text-gray-400 ml-1">Distance bar must move up from bottom to validate rep</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Lockout Duration:</span>
            <span className="text-gray-400 ml-1">Time bar must be stable at top to complete rep (position change &lt; 0.5cm, 3 samples needed)</span>
          </div>
          <div className="pt-2 border-t border-gym-border">
            <span className="text-purple-400 font-bold">How it works:</span>
            <div className="text-gray-400 ml-1 mt-1 space-y-1">
              <div>1. <span className="text-red-400">Descent</span>: Triggered when bar moves down &gt; Min Descent</div>
              <div>2. <span className="text-blue-400">Ascent</span>: Triggered when bar starts moving up &gt; Min Ascent</div>
              <div>3. <span className="text-green-400">Lockout</span>: Triggered when bar is stable (&lt; 0.5cm movement, velocity &lt; 10cm/s for 3 samples)</div>
              <div>4. <span className="text-gym-accent">Rep Counted</span>: After holding lockout for the specified duration with ROM &gt; Min ROM</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
