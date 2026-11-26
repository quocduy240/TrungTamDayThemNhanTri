export interface OptimizedImageResult {
  dataUrl: string;
  mimeType: string;
  originalKB: number;
  compressedKB: number;
  width: number;
  height: number;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_RAW_BYTES = 15 * 1024 * 1024; // 15 MB

function supportsWebpEncode(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

export async function compressImageFile(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<OptimizedImageResult> {
  const maxDim = opts.maxDim ?? 1400;
  const quality = opts.quality ?? 0.82;

  const normalizedType = (file.type || '').toLowerCase();
  if (normalizedType && !ALLOWED_IMAGE_TYPES.has(normalizedType)) {
    throw new Error('Chỉ hỗ trợ ảnh định dạng JPG, PNG hoặc WebP.');
  }
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('Dung lượng ảnh gốc vượt quá 15 MB. Vui lòng chọn ảnh nhỏ hơn.');
  }

  const originalKB = Math.max(1, Math.round(file.size / 1024));
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không thể đọc tệp ảnh tải lên.'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Trình duyệt không hỗ trợ nén ảnh Canvas.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const outMime = supportsWebpEncode() ? 'image/webp' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(outMime, quality);
    const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const compressedBytes = Math.ceil((base64Part.length * 3) / 4);
    const compressedKB = Math.max(1, Math.round(compressedBytes / 1024));

    return {
      dataUrl,
      mimeType: outMime,
      originalKB,
      compressedKB,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
