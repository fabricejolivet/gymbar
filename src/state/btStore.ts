import { create } from 'zustand';
import { BLEClient, ConnectionStatus } from '../core/bt/BLEClient';
import { DeviceInfo } from '../core/models/types';
import { Commands } from '../core/decode/wt9011';

interface BTState {
  client: BLEClient | null;
  device: DeviceInfo | null;
  status: ConnectionStatus;
  rssi?: number;
  batteryPercent: number | null;
  batteryVoltage: number | null;
  temperature: number | null;
  sensorRate: number | null;
  batteryUpdateInterval: NodeJS.Timeout | null;

  initialize: (serviceUUID: string, notifyUUID: string, writeUUID?: string) => void;
  connect: () => Promise<BLEClient | null>;
  disconnect: () => Promise<void>;
  write: (data: Uint8Array) => Promise<void>;
  setStatus: (status: ConnectionStatus) => void;
  setBattery: (percent: number, voltage: number) => void;
  setTemperature: (temp: number) => void;
  setSensorRate: (rate: number) => void;
  startBatteryMonitoring: () => void;
  stopBatteryMonitoring: () => void;
}

export const useBTStore = create<BTState>((set, get) => ({
  client: null,
  device: null,
  status: 'disconnected',
  batteryPercent: null,
  batteryVoltage: null,
  temperature: null,
  sensorRate: null,
  batteryUpdateInterval: null,

  initialize: (serviceUUID, notifyUUID, writeUUID) => {
    const client = new BLEClient({
      serviceUUID,
      notifyCharUUID: notifyUUID,
      writeCharUUID: writeUUID,
    });

    client.onStatus((status) => {
      set({ status });
    });

    set({ client });
  },

  connect: async () => {
    const { client } = get();
    if (!client) throw new Error('BLE client not initialized');

    await client.connect();
    set({
      status: 'connected',
      device: {
        name: 'WT9011DCL',
        id: 'sensor-1',
        connected: true,
      }
    });
    return client;
  },

  disconnect: async () => {
    const { client, batteryUpdateInterval } = get();
    if (!client) return;

    if (batteryUpdateInterval) {
      clearInterval(batteryUpdateInterval);
    }

    await client.disconnect();
    set({
      status: 'disconnected',
      device: null,
      batteryUpdateInterval: null,
    });
  },

  write: async (data) => {
    const { client } = get();
    if (!client) throw new Error('BLE client not initialized');
    await client.write(data);
  },

  setStatus: (status) => set({ status }),

  setBattery: (percent, voltage) => set({ batteryPercent: percent, batteryVoltage: voltage }),

  setTemperature: (temp) => set({ temperature: temp }),

  setSensorRate: (rate) => set({ sensorRate: rate }),

  startBatteryMonitoring: () => {
    const { client, batteryUpdateInterval } = get();
    if (!client?.isConnected() || batteryUpdateInterval) return;

    const interval = setInterval(async () => {
      if (client.isConnected()) {
        try {
          await client.write(Commands.READ_BATTERY);
        } catch (err) {
          console.error('[BT] Battery update failed:', err);
        }
      }
    }, 10000);

    set({ batteryUpdateInterval: interval });
  },

  stopBatteryMonitoring: () => {
    const { batteryUpdateInterval } = get();
    if (batteryUpdateInterval) {
      clearInterval(batteryUpdateInterval);
      set({ batteryUpdateInterval: null });
    }
  },
}));
