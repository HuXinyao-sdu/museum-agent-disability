"""批量抠图：把皮影人物 PNG 的暖黄幕布背景变透明，保留黑色人物剪影。
黑色人物 alpha=255，亮黄背景 alpha=0，中间按亮度渐变。"""
from pathlib import Path
from PIL import Image
import numpy as np

src_dir = Path(r"D:\3th\人工智能应用实践\new\3d-museum\public\figures")

for png in src_dir.glob("*.png"):
    img = Image.open(png).convert("RGBA")
    arr = np.array(img)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    # 亮度：暖色幕布高亮度，黑色人物低亮度
    # 用相对亮度
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    # 阈值：luminance < 100 → 保留（黑色人物）；> 180 → 透明（幕布）
    # 中间渐变
    new_alpha = np.clip((180 - luminance) * 255 / 80, 0, 255).astype(np.uint8)
    # 已经是透明的保持透明
    new_alpha = np.minimum(new_alpha, a)
    arr[..., 3] = new_alpha
    # RGB 统一压成深棕黑，避免残留黄色杂边
    arr[..., 0] = (arr[..., 0] * 0.3).astype(np.uint8)
    arr[..., 1] = (arr[..., 1] * 0.2).astype(np.uint8)
    arr[..., 2] = (arr[..., 2] * 0.1).astype(np.uint8)
    out = Image.fromarray(arr, "RGBA")
    out.save(png)
    print(f"OK {png.name}")
print("done")
