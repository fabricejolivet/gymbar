export type BLEConfig = {
  serviceUUID: string;
  notifyCharUUID: string;
  writeCharUUID?: string;
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class BLEClient {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;

  private messageBuffer: Uint8Array[] = [];
  private onDataCallbacks: Set<(data: Uint8Array) => void> = new Set();
  private onStatusCallback: ((status: ConnectionStatus) => void) | null = null;

  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private userDisconnected = false;

  private streamingEnabled = false;

  constructor(private config: BLEConfig) {}

  async connect(): Promise<void> {
    try {
      this.updateStatus('connecting');
      this.userDisconnected = false;

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [this.config.serviceUUID] }],
        optionalServices: [this.config.serviceUUID],
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      this.server = await this.device.gatt!.connect();
      const service = await this.server.getPrimaryService(this.config.serviceUUID);

      this.notifyChar = await service.getCharacteristic(this.config.notifyCharUUID);
      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
        this.handleNotification(event);
      });

      if (this.config.writeCharUUID) {
        try {
          this.writeChar = await service.getCharacteristic(this.config.writeCharUUID);
        } catch (e) {
          console.warn('Write characteristic not available');
        }
      }

      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      console.log('BLE connected successfully');
    } catch (error) {
      console.error('BLE connection error:', error);
      this.updateStatus('error');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    console.log('User initiated disconnect');
    this.userDisconnected = true;
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.notifyChar = null;
    this.writeChar = null;
    this.updateStatus('disconnected');
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writeChar) {
      throw new Error('Write characteristic not available');
    }
    await this.writeChar.writeValue(data);
  }

  onData(callback: (data: Uint8Array) => void): () => void {
    this.onDataCallbacks.add(callback);
    return () => {
      this.onDataCallbacks.delete(callback);
    };
  }

  onStatus(callback: (status: ConnectionStatus) => void): void {
    this.onStatusCallback = callback;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.server?.connected === true;
  }

  private handleNotification(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;

    const data = new Uint8Array(value.buffer);

    this.messageBuffer.push(data);
    if (this.messageBuffer.length > 100) {
      this.messageBuffer.shift();
    }

    if (this.streamingEnabled) {
      this.onDataCallbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in onData callback:', error);
        }
      });
    }
  }

  private handleDisconnect(): void {
    console.log('Device disconnected, userDisconnected:', this.userDisconnected);

    if (this.userDisconnected) {
      console.log('User disconnected - not attempting reconnect');
      this.updateStatus('disconnected');
      return;
    }

    this.updateStatus('disconnected');

    if (this.device && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Auto-reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => {
        if (this.device && this.device.gatt && !this.userDisconnected) {
          this.reconnect();
        }
      }, 2000);
    }
  }

  private async reconnect(): Promise<void> {
    try {
      this.updateStatus('connecting');

      if (!this.device || !this.device.gatt) {
        throw new Error('Device not available for reconnection');
      }

      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService(this.config.serviceUUID);

      this.notifyChar = await service.getCharacteristic(this.config.notifyCharUUID);
      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
        this.handleNotification(event);
      });

      if (this.config.writeCharUUID) {
        try {
          this.writeChar = await service.getCharacteristic(this.config.writeCharUUID);
        } catch (e) {
          console.warn('Write characteristic not available on reconnect');
        }
      }

      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      console.log('Reconnection successful');
    } catch (error) {
      console.error('Reconnection failed:', error);
      this.updateStatus('error');
    }
  }

  private updateStatus(status: ConnectionStatus): void {
    this.status = status;
    if (this.onStatusCallback) {
      this.onStatusCallback(status);
    }
  }

  getMessageBuffer(): Uint8Array[] {
    return [...this.messageBuffer];
  }

  startStreaming(): void {
    console.log('BLE streaming enabled');
    this.streamingEnabled = true;
  }

  stopStreaming(): void {
    console.log('BLE streaming disabled');
    this.streamingEnabled = false;
  }

  isStreaming(): boolean {
    return this.streamingEnabled;
  }
}
