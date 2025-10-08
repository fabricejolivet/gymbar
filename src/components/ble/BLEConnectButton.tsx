import { useBTStore } from '../../state/btStore';
import { dataRouter } from '../../state/dataRouter';
import { Bluetooth } from 'lucide-react';
import { Commands, parseRateResponse, parseBatteryResponse } from '../../core/decode/wt9011';

export function BLEConnectButton() {
  const { status, connect, disconnect, client, batteryPercent, sensorRate, setBattery, setSensorRate, startBatteryMonitoring } = useBTStore();

  const handleClick = async () => {
    if (status === 'connected') {
      await disconnect();
    } else {
      try {
        const connectedClient = await connect();
        if (connectedClient) {
          setTimeout(async () => {
            if (!connectedClient.isConnected()) return;

            console.log('[BLE] Starting connection setup...');
            connectedClient.startStreaming();

            let batteryReceived = false;
            let rateReceived = false;

            const setupHandler = (data: Uint8Array) => {
              if (data.length >= 2 && data[0] === 0x55 && data[1] === 0x71) {
                const header = `0x${data[0].toString(16)} 0x${data[1].toString(16)}`;
                const reg = data.length >= 4 ? (data[2] | (data[3] << 8)) : -1;
                console.log(`[BLE] Received 0x71 packet, reg=0x${reg.toString(16)}, length=${data.length}`);
              }

              const batt = parseBatteryResponse(data);
              if (batt !== null) {
                batteryReceived = true;
                setBattery(batt.percentage, batt.voltage);
                console.log('[BLE] Battery:', batt.voltage.toFixed(2) + 'V', `(${batt.percentage}%)`);
              }

              const rate = parseRateResponse(data);
              if (rate !== null) {
                rateReceived = true;
                setSensorRate(rate);
                console.log('[BLE] Current sensor rate:', rate, 'Hz');

                if (rate !== 20) {
                  console.log('[BLE] Configuring sensor to 20Hz...');
                  setTimeout(() => {
                    if (connectedClient.isConnected()) {
                      connectedClient.write(Commands.RATE_20HZ)
                        .then(() => new Promise(resolve => setTimeout(resolve, 200)))
                        .then(() => {
                          if (connectedClient.isConnected()) {
                            return connectedClient.write(Commands.SAVE_SETTINGS);
                          }
                        })
                        .then(() => {
                          console.log('[BLE] Rate configured to 20Hz');
                          setSensorRate(20);
                        })
                        .catch(err => {
                          console.error('[BLE] Failed to configure rate:', err);
                        });
                    }
                  }, 100);
                } else {
                  console.log('[BLE] Rate already at 20Hz');
                }
              }
            };

            const unsubscribe = connectedClient.onData(setupHandler);

            const requestMetadata = async () => {
              await new Promise(resolve => setTimeout(resolve, 300));

              try {
                console.log('[BLE] Requesting sensor rate...');
                await connectedClient.write(Commands.READ_RATE);
                await new Promise(resolve => setTimeout(resolve, 300));
              } catch (err) {
                console.error('[BLE] Failed to request rate:', err);
              }

              const maxAttempts = 4;
              for (let i = 0; i < maxAttempts && !batteryReceived && connectedClient.isConnected(); i++) {
                try {
                  console.log(`[BLE] Requesting battery (attempt ${i + 1}/${maxAttempts})...`);
                  await connectedClient.write(Commands.READ_BATTERY);
                  await new Promise(resolve => setTimeout(resolve, 500));
                  if (batteryReceived) {
                    console.log('[BLE] Battery received!');
                    break;
                  }
                } catch (err) {
                  console.error('[BLE] Failed to request battery:', err);
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            };

            requestMetadata();

            setTimeout(() => {
              unsubscribe();
              console.log('[BLE] Setup complete');

              if (batteryReceived) {
                console.log('[BLE] Starting 10s battery monitoring loop');
                startBatteryMonitoring();
              } else {
                console.warn('[BLE] No battery response received after 4 attempts');
              }

              if (!rateReceived) {
                console.warn('[BLE] No rate response, setting to 20Hz anyway');
                if (connectedClient.isConnected()) {
                  connectedClient.write(Commands.RATE_20HZ)
                    .then(() => new Promise(resolve => setTimeout(resolve, 200)))
                    .then(() => {
                      if (connectedClient.isConnected()) {
                        return connectedClient.write(Commands.SAVE_SETTINGS);
                      }
                    })
                    .then(() => {
                      console.log('[BLE] Configured to 20Hz (fallback)');
                      setSensorRate(20);
                    })
                    .catch(err => {
                      console.error('[BLE] Failed to configure device:', err);
                    });
                }
              }

              console.log('[BLE] Starting permanent data routing');
              dataRouter.startRouting(connectedClient);
            }, 3000);
          }, 500);
        }
      } catch (error) {
        console.error('[BLE] Connection failed:', error);
      }
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'disconnected':
        return 'Click to connect';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        if (batteryPercent === null) {
          return 'Initializing...';
        }
        return 'Connected';
      case 'error':
        return 'Connection error';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        if (batteryPercent === null) {
          return 'border-yellow-500';
        }
        if (batteryPercent <= 20) {
          return 'border-red-500';
        }
        return 'border-gym-accent';
      case 'connecting':
        return 'border-yellow-500';
      case 'error':
        return 'border-red-500';
      default:
        return 'border-gray-500';
    }
  };

  const getBatteryColor = () => {
    if (batteryPercent === null) return 'text-gray-400';
    if (batteryPercent <= 20) return 'text-red-500';
    if (batteryPercent <= 50) return 'text-yellow-500';
    return 'text-gym-accent';
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <button
        onClick={handleClick}
        disabled={status === 'connecting'}
        className={`relative w-48 h-48 rounded-full border-8 ${getStatusColor()} bg-gym-card flex flex-col items-center justify-center transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Bluetooth size={48} className="text-gray-400 mb-2" />
        <span className="text-sm text-gray-400">Status</span>
        <span className="text-lg font-semibold text-white">{getStatusText()}</span>
        {status === 'connected' && batteryPercent !== null && (
          <span className={`text-sm font-bold mt-1 ${getBatteryColor()}`}>
            {batteryPercent}%
          </span>
        )}
        {status === 'connected' && sensorRate !== null && (
          <span className="text-xs text-gray-500 mt-1">
            {sensorRate}Hz
          </span>
        )}
      </button>
    </div>
  );
}
