import { useState, useEffect, useRef } from 'react';
import { Activity, Info, X, RotateCcw } from 'lucide-react';
import { RepDisplacementGraph } from '../charts/RepDisplacementGraph';
import { useEKFStore } from '../../state/ekfStore';
import { dataRouter } from '../../state/dataRouter';
import { SimpleVerticalRepDetector, type SimpleRepConfig } from '../../core/reps/simpleVerticalDetector';

interface RepCounterTuningProps {
  config: SimpleRepConfig;
  onChange: (config: Partial<SimpleRepConfig>) => void;
}

type RepPhase = 'waiting' | 'descending' | 'ascending' | 'lockout';

export function RepCounterTuning({ config, onChange }: RepCounterTuningProps) {
  const [displacementData, setDisplacementData] = useState<Array<{ time: number; position: number; velocity: number; phase: RepPhase }>>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<RepPhase>('waiting');
  const [currentROM, setCurrentROM] = useState(0);
  const repDetectorRef = useRef(new SimpleVerticalRepDetector(config));
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    repDetectorRef.current.setConfig(config);

    // CRITICAL: Set callback to reset EKF when rep completes
    repDetectorRef.current.setOnRepComplete(() => {
      console.log('[RepCounterTuning] 🔄 Rep completed - resetting EKF');
      const resetEKF = useEKFStore.getState().reset;
      resetEKF();
    });
  }, [config]);

  const handleReset = () => {
    repDetectorRef.current.reset();
    const resetEKF = useEKFStore.getState().reset;
    resetEKF();
    setRepCount(0);
    setCurrentPhase('waiting');
    setCurrentROM(0);
    setDisplacementData([]);
  };

  useEffect(() => {
    const handleSample = () => {
      try {
        const ekfState = useEKFStore.getState().state;
        const vz = ekfState.v[2] * 100; // m/s to cm/s
        const pz = ekfState.p[2] * 100; // m to cm

        const rep = repDetectorRef.current.update(
          pz,           // verticalPos_cm
          vz,           // verticalVel_cms
          0,            // tilt_deg (not used in settings)
          0,            // targetTilt_deg
          Date.now()    // time_ms
        );

        if (rep) {
          setRepCount(prev => prev + 1);
          console.log('[RepCounterTuning] Rep detected:', rep);
        }

        const detectorState = repDetectorRef.current.getState();
        setCurrentPhase(detectorState);
        setCurrentROM(repDetectorRef.current.getCurrentROM());

        if (showGraph) {
          const now = Date.now();
          if (now - lastUpdateRef.current >= 20) {
            lastUpdateRef.current = now;
            setDisplacementData(prev => {
              const newData = [...prev, { time: now, position: pz, velocity: vz, phase: detectorState }];
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
  }, [showGraph, config]);

  const getPhaseColor = (phase: RepPhase) => {
    switch (phase) {
      case 'descending': return 'text-red-400';
      case 'ascending': return 'text-blue-400';
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
            {currentROM > 0 && (
              <span className="text-xs text-gray-400">
                ({currentROM.toFixed(0)}cm)
              </span>
            )}
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

      <div className="bg-gym-bg rounded-lg p-2 mb-3 text-xs text-gray-400">
        Simple vertical-only rep detector. Detects: descent → bottom → ascent → lockout → rep complete → reset
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
          minDescent={3}
          minAscent={3}
          mode="vertical"
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
          <p className="text-xs text-gray-500 mt-1">Minimum range of motion to count rep</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Descent Velocity</label>
            <span className="text-white font-mono text-xs">{Math.abs(config.descentVelocity_cms)} cm/s</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={Math.abs(config.descentVelocity_cms)}
            onChange={(e) => onChange({ descentVelocity_cms: -parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
          <p className="text-xs text-gray-500 mt-1">Velocity threshold to start descent phase</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Ascent Velocity</label>
            <span className="text-white font-mono text-xs">{config.ascentVelocity_cms} cm/s</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={config.ascentVelocity_cms}
            onChange={(e) => onChange({ ascentVelocity_cms: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
          <p className="text-xs text-gray-500 mt-1">Velocity threshold to start ascent phase</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Lockout Velocity</label>
            <span className="text-white font-mono text-xs">{config.lockoutVelocity_cms} cm/s</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={config.lockoutVelocity_cms}
            onChange={(e) => onChange({ lockoutVelocity_cms: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
          <p className="text-xs text-gray-500 mt-1">Max velocity to enter lockout</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-400">Lockout Duration</label>
            <span className="text-white font-mono text-xs">{config.lockoutDuration_ms} ms</span>
          </div>
          <input
            type="range"
            min="100"
            max="1000"
            step="50"
            value={config.lockoutDuration_ms}
            onChange={(e) => onChange({ lockoutDuration_ms: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-gym-bg rounded-lg appearance-none cursor-pointer accent-gym-accent"
          />
          <p className="text-xs text-gray-500 mt-1">Hold time at top before completing rep</p>
        </div>
      </div>

      {showHelp && (
        <div className="mt-4 p-3 bg-gym-bg border border-gym-border rounded-lg space-y-2 text-xs">
          <div>
            <span className="text-gym-accent font-bold">Simple Vertical Detector:</span>
            <span className="text-gray-400 ml-1">State machine for vertical barbell movements</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Min ROM:</span>
            <span className="text-gray-400 ml-1">Total distance bar must travel to count as valid rep</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Descent/Ascent Velocity:</span>
            <span className="text-gray-400 ml-1">Velocity thresholds to trigger phase transitions</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Lockout Velocity:</span>
            <span className="text-gray-400 ml-1">Max velocity allowed to enter lockout phase</span>
          </div>
          <div>
            <span className="text-gym-accent font-bold">Lockout Duration:</span>
            <span className="text-gray-400 ml-1">Time bar must be stable at top to complete rep</span>
          </div>
          <div className="pt-2 border-t border-gym-border">
            <span className="text-purple-400 font-bold">How it works:</span>
            <div className="text-gray-400 ml-1 mt-1 space-y-1">
              <div>1. <span className="text-gray-400">Waiting</span>: Idle, waiting for descent</div>
              <div>2. <span className="text-red-400">Descending</span>: Bar moving down (velocity &lt; -3 cm/s)</div>
              <div>3. <span className="text-blue-400">Ascending</span>: Bar moving up (velocity &gt; +3 cm/s)</div>
              <div>4. <span className="text-green-400">Lockout</span>: Bar stable at top (velocity &lt; 2 cm/s)</div>
              <div>5. <span className="text-gym-accent">Rep Complete</span>: After lockout duration + ROM check → All filters reset!</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
