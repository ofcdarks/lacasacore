import argparse
import os
import cv2
import torch
import numpy as np

def load_midas(device):
    model_type = 'DPT_Large'
    midas = torch.hub.load('intel-isl/MiDaS', model_type)
    midas.to(device)
    midas.eval()
    transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
    transform = transforms.dpt_transform if model_type.startswith('DPT') else transforms.small_transform
    return midas, transform

def estimate_depth(img_bgr, midas, transform, device):
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    input_batch = transform(img_rgb).to(device)
    with torch.no_grad():
        prediction = midas(input_batch)
        depth = torch.nn.functional.interpolate(
            prediction.unsqueeze(1), size=img_rgb.shape[:2], mode='bilinear', align_corners=False
        ).squeeze().cpu().numpy()
    # normalize 0-1
    dmin, dmax = depth.min(), depth.max()
    depth = (depth - dmin) / (dmax - dmin + 1e-8)
    return depth

def parallax_frames(img, depth, duration=5, fps=25, max_shift=12):
    h, w = img.shape[:2]
    total = int(duration * fps)
    frames = []
    # center depth to emphasize subject (invert so closer regions move more)
    d = 1.0 - depth
    # create displacement fields over time (subtle x/y and slight scale)
    for i in range(total):
        t = i / max(total - 1, 1)
        # ease in-out
        ease = 0.5 - 0.5 * np.cos(np.pi * t)
        shift_x = (ease - 0.5) * 2 * max_shift
        shift_y = (0.5 - ease) * 2 * (max_shift * 0.6)
        # per-pixel parallax scaled by depth
        dx = (d * shift_x).astype(np.float32)
        dy = (d * shift_y).astype(np.float32)
        # generate map for remap
        map_x, map_y = np.meshgrid(np.arange(w), np.arange(h))
        map_x = (map_x + dx).astype(np.float32)
        map_y = (map_y + dy).astype(np.float32)
        warped = cv2.remap(img, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        frames.append(warped)
    return frames

def write_mp4(frames, out_path, fps=25):
    h, w = frames[0].shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_path, fourcc, fps, (w, h))
    for f in frames:
        writer.write(f)
    writer.release()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--duration', type=int, default=5)
    parser.add_argument('--fps', type=int, default=25)
    parser.add_argument('--max_shift', type=int, default=12)
    args = parser.parse_args()

    img = cv2.imread(args.input)
    if img is None:
        raise RuntimeError('Falha ao ler imagem')

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    midas, transform = load_midas(device)
    depth = estimate_depth(img, midas, transform, device)
    frames = parallax_frames(img, depth, duration=args.duration, fps=args.fps, max_shift=args.max_shift)
    write_mp4(frames, args.output, fps=args.fps)

if __name__ == '__main__':
    main()
