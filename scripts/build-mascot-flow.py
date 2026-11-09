# Run with: uv run --with opencv-python-headless --with numpy scripts/build-mascot-flow.py
# Measures displacement only; the approved sprite PNG is never modified.
from pathlib import Path
import json
import cv2
import numpy as np

root = Path(__file__).resolve().parents[1] / 'public' / 'mascot'
sheet = cv2.imread(str(root / 'sprites.png'), cv2.IMREAD_UNCHANGED)
height, width = sheet.shape[:2]
size, grid = 320, 64
frames = []
for row in range(4):
    frames.append([])
    for col in range(4):
        cell = sheet[round(row*height/4):round((row+1)*height/4), round(col*width/4):round((col+1)*width/4)]
        cell = cv2.resize(cell, (size, size), interpolation=cv2.INTER_AREA)
        alpha = cell[:, :, 3:4].astype(np.float32)/255
        rgb = cell[:, :, :3]*alpha + 245*(1-alpha)
        gray = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_BGR2GRAY)
        frames[-1].append(gray)

fields = []
max_displacement = []
for row in range(4):
    for col in range(4):
        a, b = frames[row][col], frames[row][(col+1)%4]
        forward = cv2.calcOpticalFlowFarneback(a, b, None, .5, 5, 31, 6, 7, 1.5, 0)
        backward = cv2.calcOpticalFlowFarneback(b, a, None, .5, 5, 31, 6, 7, 1.5, 0)
        pair = np.concatenate([forward, backward], axis=2)
        pair = cv2.resize(pair, (grid, grid), interpolation=cv2.INTER_AREA)/size
        fields.append(pair.astype('<f4'))
        max_displacement.append(round(float(np.max(np.abs(pair))), 4))
payload = np.stack(fields).astype('<f4')
(root / 'flow.bin').write_bytes(payload.tobytes())
(root / 'flow.json').write_text(json.dumps({
    'grid': grid, 'rows': 4, 'columns': 4, 'channels': ['forward_x','forward_y','backward_x','backward_y'],
    'format': 'little-endian float32, normalized cell coordinates, row-major',
    'bytes': payload.nbytes, 'max_displacement': max_displacement,
    'source': 'sprites.png', 'method': 'bidirectional Farneback optical flow; runtime interpolation'
}, indent=2)+'\n')
print(f'Measured 16 frame pairs: {payload.nbytes} bytes; original sprite unchanged.')
