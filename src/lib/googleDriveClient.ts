export type DriveFileFilterMode = 'ALL' | 'IMAGES' | 'LISTS';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
  webViewLink?: string;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

const LIST_MIME_TYPES = [
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
];

function escapeDriveQuery(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function listPersonalDriveFiles(params: {
  accessToken: string;
  mode: DriveFileFilterMode;
  search?: string;
  pageToken?: string;
}): Promise<{ files: DriveFileItem[]; nextPageToken?: string }> {
  const clauses: string[] = ['trashed = false'];

  if (params.mode === 'IMAGES') {
    clauses.push("mimeType contains 'image/'");
  } else if (params.mode === 'LISTS') {
    const mimeClause = LIST_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(' or ');
    clauses.push(`(${mimeClause} or mimeType contains 'image/')`);
  } else {
    const mimeClause = LIST_MIME_TYPES.map((m) => `mimeType = '${m}'`).join(' or ');
    clauses.push(`(mimeType contains 'image/' or ${mimeClause})`);
  }

  const trimmed = (params.search || '').trim();
  if (trimmed) {
    clauses.push(`name contains '${escapeDriveQuery(trimmed)}'`);
  }

  const qs = new URLSearchParams({
    q: clauses.join(' and '),
    pageSize: '24',
    orderBy: 'modifiedTime desc',
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink, iconLink, webViewLink)',
  });
  if (params.pageToken) {
    qs.set('pageToken', params.pageToken);
  }

  const res = await fetch(`${DRIVE_API_BASE}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('Phiên kết nối Google Drive đã hết hạn hoặc chưa cấp quyền đọc file. Vui lòng kết nối lại Google Drive.');
  }
  if (!res.ok) {
    throw new Error(`Không tải được danh sách Google Drive (mã ${res.status}).`);
  }

  const data = (await res.json()) as { files?: DriveFileItem[]; nextPageToken?: string };
  return {
    files: Array.isArray(data.files) ? data.files : [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Downloads an image from personal Google Drive and compresses/resizes it smoothly via Canvas
 * into a lightweight data URL (max 1400px wide) so articles & banners load instantaneously.
 */
export async function downloadDriveImageAsDataUrl(
  accessToken: string,
  file: DriveFileItem,
  maxWidth = 1400,
): Promise<string> {
  const res = await fetch(`${DRIVE_API_BASE}/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Không tải được ảnh "${file.name}" từ Google Drive.`);
  }
  const blob = await res.blob();
  if (blob.size > 15 * 1024 * 1024) {
    throw new Error('Ảnh vượt quá giới hạn 15MB. Vui lòng chọn ảnh nhẹ hơn.');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không đọc được định dạng ảnh từ Google Drive.'));
      el.src = objectUrl;
    });

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Không chuyển đổi được ảnh.'));
        reader.readAsDataURL(blob);
      });
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const outType = file.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outType, 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Downloads a spreadsheet/document/PDF/image file from Google Drive and converts native Google Sheets/Docs
 * into CSV/plain text File objects ready to feed directly into UniversalSmartImportModal.
 */
export async function downloadDriveFileAsBrowserFile(
  accessToken: string,
  file: DriveFileItem,
): Promise<File> {
  let url = `${DRIVE_API_BASE}/${encodeURIComponent(file.id)}?alt=media`;
  let outMime = file.mimeType || 'application/octet-stream';
  let outName = file.name;

  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `${DRIVE_API_BASE}/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/csv')}`;
    outMime = 'text/csv';
    if (!outName.toLowerCase().endsWith('.csv')) outName = `${outName}.csv`;
  } else if (file.mimeType === 'application/vnd.google-apps.document') {
    url = `${DRIVE_API_BASE}/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`;
    outMime = 'text/plain';
    if (!outName.toLowerCase().endsWith('.txt')) outName = `${outName}.txt`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Không tải được file "${file.name}" từ Google Drive (mã ${res.status}).`);
  }
  const blob = await res.blob();
  if (blob.size > 20 * 1024 * 1024) {
    throw new Error('File vượt quá 20MB. Vui lòng chọn file nhỏ hơn.');
  }
  return new File([blob], outName, { type: outMime });
}

export function formatDriveFileSize(sizeStr?: string): string {
  const bytes = Number(sizeStr || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Google Workspace';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function describeDriveMimeType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Hình ảnh';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheets';
  if (mimeType === 'application/vnd.google-apps.document') return 'Google Docs';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Excel (.xlsx)';
  if (mimeType === 'text/csv') return 'CSV';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word')) return 'Word (.docx)';
  return 'Tài liệu';
}
