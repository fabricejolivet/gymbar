import { ImuSample } from '../models/types';

export function parse0x61(frame: ArrayBuffer | Uint8Array): ImuSample | null {
  const data = frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;

  if (data.length < 20) return null;
  if (data[0] !== 0x55 || data[1] !== 0x61) return null;

  const readInt16LE = (offset: number): number => {
    const value = data[offset] | (data[offset + 1] << 8);
    return value & 0x8000 ? value - 0x10000 : value;
  };

  const ax = readInt16LE(2) / 32768 * 16;
  const ay = readInt16LE(4) / 32768 * 16;
  const az = readInt16LE(6) / 32768 * 16;

  const wx = readInt16LE(8) / 32768 * 2000;
  const wy = readInt16LE(10) / 32768 * 2000;
  const wz = readInt16LE(12) / 32768 * 2000;

  const roll = readInt16LE(14) / 32768 * 180;
  const pitch = readInt16LE(16) / 32768 * 180;
  const yaw = readInt16LE(18) / 32768 * 180;

  return {
    t: Date.now(),
    accel_g: [ax, ay, az],
    gyro_dps: [wx, wy, wz],
    euler_deg: [roll, pitch, yaw],
  };
}

export function parse0x71(frame: ArrayBuffer | Uint8Array): Partial<ImuSample> | null {
  const data = frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;

  if (data.length < 20) return null;
  if (data[0] !== 0x55 || data[1] !== 0x71) return null;

  const readInt16LE = (offset: number): number => {
    const value = data[offset] | (data[offset + 1] << 8);
    return value & 0x8000 ? value - 0x10000 : value;
  };

  const startRegL = data[2];
  const startRegH = data[3];
  const startReg = startRegL | (startRegH << 8);

  if (startReg === 0x3a) {
    const hx = readInt16LE(4) / 150;
    const hy = readInt16LE(6) / 150;
    const hz = readInt16LE(8) / 150;
    return {
      t: Date.now(),
      mag_uT: [hx, hy, hz],
    };
  }

  if (startReg === 0x51) {
    const q0 = readInt16LE(4) / 32768;
    const q1 = readInt16LE(6) / 32768;
    const q2 = readInt16LE(8) / 32768;
    const q3 = readInt16LE(10) / 32768;
    return {
      t: Date.now(),
      quat: [q0, q1, q2, q3],
    };
  }

  return null;
}

export function buildCommand(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

export const Commands = {
  READ_MAG: buildCommand([0xff, 0xaa, 0x27, 0x3a, 0x00]),
  READ_QUAT: buildCommand([0xff, 0xaa, 0x27, 0x51, 0x00]),
  READ_TEMP: buildCommand([0xff, 0xaa, 0x27, 0x40, 0x00]),
  READ_BATTERY: buildCommand([0xff, 0xaa, 0x27, 0x64, 0x00]),
  READ_RATE: buildCommand([0xff, 0xaa, 0x27, 0x03, 0x00]),
  READ_VERSION1: buildCommand([0xff, 0xaa, 0x27, 0x2e, 0x00]),
  READ_VERSION2: buildCommand([0xff, 0xaa, 0x27, 0x2f, 0x00]),
  CAL_ACCEL: buildCommand([0xff, 0xaa, 0x01, 0x01, 0x00]),
  CAL_MAG_START: buildCommand([0xff, 0xaa, 0x01, 0x07, 0x00]),
  CAL_MAG_END: buildCommand([0xff, 0xaa, 0x01, 0x00, 0x00]),
  SAVE_SETTINGS: buildCommand([0xff, 0xaa, 0x00, 0x00, 0x00]),
  RATE_10HZ: buildCommand([0xff, 0xaa, 0x03, 0x06, 0x00]),
  RATE_20HZ: buildCommand([0xff, 0xaa, 0x03, 0x07, 0x00]),
  RATE_50HZ: buildCommand([0xff, 0xaa, 0x03, 0x08, 0x00]),
  RATE_100HZ: buildCommand([0xff, 0xaa, 0x03, 0x09, 0x00]),
  RATE_200HZ: buildCommand([0xff, 0xaa, 0x03, 0x0b, 0x00]),
};

export function parseRateResponse(frame: ArrayBuffer | Uint8Array): number | null {
  const data = frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;

  if (data.length < 8) return null;
  if (data[0] !== 0x55 || data[1] !== 0x71) return null;

  const startRegL = data[2];
  const startRegH = data[3];
  const startReg = startRegL | (startRegH << 8);

  if (startReg === 0x03) {
    const rateCode = data[4];
    switch (rateCode) {
      case 0x06: return 10;
      case 0x07: return 20;
      case 0x08: return 50;
      case 0x09: return 100;
      case 0x0b: return 200;
      default: return rateCode;
    }
  }

  return null;
}

export function parseTempResponse(frame: ArrayBuffer | Uint8Array): number | null {
  const data = frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;

  if (data.length < 8) return null;
  if (data[0] !== 0x55 || data[1] !== 0x71) return null;

  const startRegL = data[2];
  const startRegH = data[3];
  const startReg = startRegL | (startRegH << 8);

  if (startReg === 0x40) {
    const readInt16LE = (offset: number): number => {
      const value = data[offset] | (data[offset + 1] << 8);
      return value & 0x8000 ? value - 0x10000 : value;
    };
    const temp = readInt16LE(4) / 100;
    return temp;
  }

  return null;
}

export function parseBatteryResponse(frame: ArrayBuffer | Uint8Array): { voltage: number; percentage: number } | null {
  const data = frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame;

  if (data.length < 8) return null;
  if (data[0] !== 0x55 || data[1] !== 0x71) return null;

  const startRegL = data[2];
  const startRegH = data[3];
  const startReg = startRegL | (startRegH << 8);

  if (startReg === 0x64) {
    const readInt16LE = (offset: number): number => {
      const value = data[offset] | (data[offset + 1] << 8);
      return value & 0x8000 ? value - 0x10000 : value;
    };
    const rawValue = readInt16LE(4);
    const voltage = rawValue / 100;

    let percentage = 0;
    if (rawValue > 396) percentage = 100;
    else if (rawValue >= 393) percentage = 90;
    else if (rawValue >= 387) percentage = 75;
    else if (rawValue >= 382) percentage = 60;
    else if (rawValue >= 379) percentage = 50;
    else if (rawValue >= 377) percentage = 40;
    else if (rawValue >= 373) percentage = 30;
    else if (rawValue >= 370) percentage = 20;
    else if (rawValue >= 368) percentage = 15;
    else if (rawValue >= 350) percentage = 10;
    else if (rawValue >= 340) percentage = 5;
    else percentage = 0;

    return { voltage, percentage };
  }

  return null;
}
