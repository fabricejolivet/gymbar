export type MountPreset =
  | 'X_along_bar_Z_up'
  | 'Y_along_bar_Z_up'
  | 'Z_along_bar_X_forward';

export function presetRotation(preset: MountPreset): number[][] {
  switch (preset) {
    case 'X_along_bar_Z_up':
      return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ];

    case 'Y_along_bar_Z_up':
      return [
        [0, 1, 0],
        [-1, 0, 0],
        [0, 0, 1]
      ];

    case 'Z_along_bar_X_forward':
      return [
        [0, 0, 1],
        [0, 1, 0],
        [-1, 0, 0]
      ];
  }
}

export function presetInverse(preset: MountPreset): number[][] {
  const R = presetRotation(preset);
  return [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ];
}

export const DEFAULT_MOUNT_PRESET: MountPreset = 'X_along_bar_Z_up';
