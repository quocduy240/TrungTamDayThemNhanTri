import React, { useCallback, useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  clearGoogleDriveToken,
  connectGoogleDriveWithPopup,
  getGoogleDriveAccessToken,
  getGoogleDriveAccountEmail,
} from '../lib/firebase';
import {
  describeDriveMimeType,
  downloadDriveFileAsBrowserFile,
  downloadDriveImageAsDataUrl,
  formatDriveFileSize,
  listPersonalDriveFiles,
  type DriveFileFilterMode,
  type DriveFileItem,
} from '../lib/googleDriveClient';

export interface GoogleDrivePickerModalProps {
  open: boolean;
  mode: DriveFileFilterMode;
  title?: string;
  onSelectImage?: (dataUrl: string, fileName: string) => void;
  onSelectFile?: (file: File) => void;
  onClose: () => void;
}

export const GoogleDrivePickerModal: React.FC<GoogleDrivePickerModalProps> = ({
  open,
  mode,
  title,
  onSelectImage,
  onSelectFile,
  onClose,
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(() => getGoogleDriveAccessToken());
  const [accountEmail, setAccountEmail] = useState<string | null>(() =>
    getGoogleDriveAccountEmail(),
  );
  const [filterMode, setFilterMode] = useState<DriveFileFilterMode>(mode);
  const [searchQuery, setSearchQuery] = useState('');
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFilterMode(mode);
      setAccessToken(getGoogleDriveAccessToken());
      setAccountEmail(getGoogleDriveAccountEmail());
      setErrorMsg(null);
    }
  }, [open, mode]);

  const loadFiles = useCallback(
    async (token: string, activeFilter: DriveFileFilterMode, query: string, pageToken?: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await listPersonalDriveFiles({
          accessToken: token,
          mode: activeFilter,
          search: query,
          pageToken,
        });
        setFiles((prev) => (pageToken ? [...prev, ...res.files] : res.files));
        setNextPageToken(res.nextPageToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Không thể đọc dữ liệu Google Drive.';
        setErrorMsg(message);
        if (message.includes('hết hạn') || message.includes('chưa cấp quyền')) {
          clearGoogleDriveToken();
          setAccessToken(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open || !accessToken) return;
    const timer = window.setTimeout(() => {
      void loadFiles(accessToken, filterMode, searchQuery);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, accessToken, filterMode, searchQuery, loadFiles]);

  if (!open) return null;

  const handleConnectDrive = async () => {
    setConnecting(true);
    setErrorMsg(null);
    try {
      const result = await connectGoogleDriveWithPopup();
      setAccessToken(result.accessToken);
      setAccountEmail(result.email);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể kết nối Google Drive. Vui lòng thử lại và cho phép cửa sổ đăng nhập.',
      );
    } finally {
      setConnecting(false);
    }
  };

  const handlePickFile = async (file: DriveFileItem) => {
    if (!accessToken || downloadingId) return;
    setDownloadingId(file.id);
    setErrorMsg(null);
    try {
      if (mode === 'IMAGES' || (onSelectImage && file.mimeType.startsWith('image/'))) {
        const dataUrl = await downloadDriveImageAsDataUrl(accessToken, file);
        onSelectImage?.(dataUrl, file.name);
        onClose();
      } else if (onSelectFile) {
        const browserFile = await downloadDriveFileAsBrowserFile(accessToken, file);
        onSelectFile(browserFile);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không tải được tệp từ Google Drive.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-drive-picker-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 id="google-drive-picker-title" className="text-base font-extrabold text-slate-900">
                {title ||
                  (mode === 'IMAGES'
                    ? 'Chọn hình ảnh từ Google Drive cá nhân'
                    : 'Chọn danh sách / tài liệu từ Google Drive cá nhân')}
              </h3>
              <p className="text-xs text-slate-500">
                {accountEmail
                  ? `Đang kết nối: ${accountEmail} (Chỉ đọc · Lưu phiên tạm trong bộ nhớ)`
                  : 'Kết nối an toàn chỉ đọc (drive.readonly) để lấy ảnh bài viết, banner hoặc danh sách lớp.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
            aria-label="Đóng Google Drive"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {!accessToken ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-800">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h4 className="mt-4 text-lg font-extrabold text-slate-900">
              Kết nối Google Drive cá nhân của bạn
            </h4>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              Hệ thống chỉ yêu cầu quyền đọc file từ Google Drive để bạn chọn ảnh minh họa cho bài
              viết, banner quảng cáo hoặc file Excel / Google Sheets / PDF nhập liệu nhanh.
            </p>

            {/* Official Google Sign-In styled button */}
            <button
              type="button"
              disabled={connecting}
              onClick={handleConnectDrive}
              className="mt-6 inline-flex min-h-[44px] items-center gap-3 rounded-lg border border-[#747775] bg-white px-5 py-2.5 text-sm font-medium text-[#1F1F1F] shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {connecting ? (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.28 6.61l4 3.1c.95-2.84 3.6-4.95 6.72-4.95z"
                  />
                </svg>
              )}
              <span>
                {connecting ? 'Đang mở xác thực Google...' : 'Đăng nhập bằng Google để mở Drive'}
              </span>
            </button>

            {errorMsg && (
              <p className="mt-4 max-w-md rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
                {errorMsg}
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Search + Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên file trên Google Drive..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {mode === 'ALL' && (
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {(
                    [
                      ['ALL', 'Tất cả'],
                      ['IMAGES', 'Hình ảnh'],
                      ['LISTS', 'Danh sách & Tài liệu'],
                    ] as [DriveFileFilterMode, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilterMode(key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        filterMode === key
                          ? 'bg-blue-900 text-white'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadFiles(accessToken, filterMode, searchQuery)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  className="min-h-[40px] rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                >
                  Đổi tài khoản
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="mx-6 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* File grid */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loading && files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-slate-500">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
                  <p className="mt-2 text-sm font-medium">Đang tải danh sách tệp từ Google Drive...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-14 text-center">
                  <FolderOpen className="h-10 w-10 text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-700">
                    Không tìm thấy tệp phù hợp trên Google Drive
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Thử đổi từ khóa tìm kiếm hoặc tải tệp lên Google Drive cá nhân rồi bấm Làm mới.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {files.map((file) => {
                    const isImage = file.mimeType.startsWith('image/');
                    const isSheet =
                      file.mimeType.includes('spreadsheet') ||
                      file.mimeType.includes('excel') ||
                      file.mimeType === 'text/csv';
                    const isDownloading = downloadingId === file.id;

                    return (
                      <button
                        key={file.id}
                        type="button"
                        disabled={Boolean(downloadingId)}
                        onClick={() => void handlePickFile(file)}
                        className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-blue-500 hover:shadow-md disabled:opacity-60"
                      >
                        <div className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-slate-100">
                          {isImage && file.thumbnailLink ? (
                            <img
                              src={file.thumbnailLink}
                              alt={file.name}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            />
                          ) : isImage ? (
                            <ImageIcon className="h-10 w-10 text-blue-500" />
                          ) : isSheet ? (
                            <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
                          ) : (
                            <FileText className="h-10 w-10 text-indigo-600" />
                          )}
                          {isDownloading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/65 text-white">
                              <Loader2 className="h-6 w-6 animate-spin" />
                              <span className="mt-1 text-xs font-semibold">Đang tải về...</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col justify-between p-3">
                          <p className="line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-blue-800">
                            {file.name}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                            <span>{describeDriveMimeType(file.mimeType)}</span>
                            <span>{formatDriveFileSize(file.size)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {nextPageToken && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void loadFiles(accessToken, filterMode, searchQuery, nextPageToken)
                    }
                    className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {loading ? 'Đang tải thêm...' : 'Tải thêm tệp trên Drive'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
