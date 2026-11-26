import React, { useState } from 'react';
import {
  ArrowRight,
  GraduationCap,
  KeyRound,
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import type { AuthPolicy, SiteConfig, UserRole } from '../types';

export interface StudentCandidate {
  id: string;
  code: string;
  fullName: string;
  centerClass: string;
  grade: number;
  school: string;
}

export interface StudentLoginResult {
  requiresChildSelection?: boolean;
  candidates?: StudentCandidate[];
}

interface ParentAuthGateProps {
  policy: AuthPolicy;
  siteConfig: SiteConfig;
  authBusy: boolean;
  onParentPhoneLogin: (phone: string, secret: string) => Promise<void>;
  onSignInGmail: (intent?: 'PARENT' | 'STUDENT' | 'TEACHER' | 'AUTO', studentId?: string) => Promise<StudentLoginResult | void>;
  onOpenRoleModal: () => void;
  onQuickPreviewRole?: (role: UserRole) => Promise<void>;
}

export const ParentAuthGate: React.FC<ParentAuthGateProps> = ({
  policy,
  siteConfig,
  authBusy,
  onParentPhoneLogin,
  onSignInGmail,
  onOpenRoleModal,
  onQuickPreviewRole,
}) => {
  const defaultTab = policy.allowParentPhoneLogin ? 'PHONE' : 'GMAIL';
  const [tab, setTab] = useState<'PHONE' | 'GMAIL'>(defaultTab);
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      await onParentPhoneLogin(phone, secret);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Xác thực Phụ huynh chưa thành công.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGmailClick() {
    setErrorMsg('');
    try {
      await onSignInGmail('PARENT');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập Gmail chưa thành công.';
      if (!msg.includes('popup-closed-by-user')) setErrorMsg(msg);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-7 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Xác thực Cổng Phụ huynh · Bảo mật Học bạ &amp; Học phí</span>
          </p>
          <h2 className="text-lg font-bold text-slate-950">
            Đăng nhập theo SĐT hoặc Gmail đã đăng ký với Trung tâm
          </h2>
        </div>

        <div className="inline-flex p-1 bg-slate-100 rounded-lg shrink-0">
          {policy.allowParentPhoneLogin && (
            <button
              type="button"
              onClick={() => {
                setTab('PHONE');
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'PHONE' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>SĐT Phụ huynh</span>
            </button>
          )}
          {policy.allowParentGmailLogin && (
            <button
              type="button"
              onClick={() => {
                setTab('GMAIL');
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'GMAIL' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Gmail Phụ huynh</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {tab === 'PHONE' && policy.allowParentPhoneLogin ? (
        <form onSubmit={handlePhoneSubmit} className="mt-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Số điện thoại Phụ huynh (Zalo) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0918204412"
                className="w-full h-10 px-3 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
              />
            </div>

            {policy.requireParentPinOrCode && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mã PIN gia đình hoặc Mã số học sinh con *
                </label>
                <input
                  type="text"
                  required
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="VD: 123456 hoặc NT-6A1-01"
                  className="w-full h-10 px-3 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting || authBusy}
              className="inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <UserCheck className="w-4 h-4" />
              <span>{submitting ? 'Đang xác thực...' : 'Xác thực & Xem Học bạ con'}</span>
            </button>

            {policy.allowDemoPreview && (
              <button
                type="button"
                onClick={() => {
                  setPhone('0918204412');
                  setSecret('123456');
                }}
                className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
              >
                Điền mẫu thử (0918204412 · PIN 123456)
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Sử dụng tài khoản Google (Gmail) đã cung cấp cho Trung tâm Nhân Trí khi nhập học. Hệ thống tự động liên kết toàn bộ hồ sơ các con trong cùng gia đình để Phụ huynh theo dõi điểm số, chuyên cần và học phí VietQR.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={authBusy}
              onClick={handleGmailClick}
              className="inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>{authBusy ? 'Đang mở xác thực Google...' : 'Đăng nhập bằng Gmail Phụ huynh'}</span>
            </button>
            {policy.allowDemoPreview && onQuickPreviewRole && (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => onQuickPreviewRole('PARENT')}
                className="inline-flex items-center gap-1.5 px-4 h-10 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <span>Xem mẫu Học bạ Phụ huynh</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          Chưa có Mã PIN hoặc cần gắn SĐT/Gmail? Nhắn Zalo{' '}
          <strong className="font-mono-num text-slate-800">{siteConfig.hotlineZalo}</strong>.
        </span>
        {policy.allowDemoPreview && (
          <button
            type="button"
            onClick={onOpenRoleModal}
            className="font-semibold text-blue-900 hover:underline cursor-pointer"
          >
            Chọn vai trò khác
          </button>
        )}
      </div>
    </div>
  );
};

interface ClassroomAuthGateProps {
  policy: AuthPolicy;
  siteConfig: SiteConfig;
  authBusy: boolean;
  onStudentLogin: (payload: {
    method: 'STUDENT_CODE' | 'PARENT_PHONE';
    studentCode?: string;
    phoneLast4?: string;
    phone?: string;
    secret?: string;
    studentId?: string;
  }) => Promise<StudentLoginResult>;
  onSignInGmail: (
    intent?: 'PARENT' | 'STUDENT' | 'TEACHER' | 'AUTO',
    studentId?: string,
  ) => Promise<StudentLoginResult | void>;
  onQuickPreviewRole?: (role: UserRole) => Promise<void>;
}

export const ClassroomAuthGate: React.FC<ClassroomAuthGateProps> = ({
  policy,
  siteConfig,
  authBusy,
  onStudentLogin,
  onSignInGmail,
  onQuickPreviewRole,
}) => {
  const [audience, setAudience] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [studentMethod, setStudentMethod] = useState<'STUDENT_CODE' | 'PARENT_PHONE' | 'GMAIL'>('STUDENT_CODE');

  const [studentCode, setStudentCode] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentSecret, setParentSecret] = useState('');

  const [candidates, setCandidates] = useState<StudentCandidate[]>([]);
  const [candidateSource, setCandidateSource] = useState<'PARENT_PHONE' | 'GMAIL' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleStudentCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      await onStudentLogin({
        method: 'STUDENT_CODE',
        studentCode,
        phoneLast4: policy.requirePhoneLast4ForStudentCode ? phoneLast4 : undefined,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xác thực Mã số học sinh.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStudentPhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await onStudentLogin({
        method: 'PARENT_PHONE',
        phone: parentPhone,
        secret: parentSecret,
      });
      if (res.requiresChildSelection && res.candidates && res.candidates.length > 0) {
        setCandidates(res.candidates);
        setCandidateSource('PARENT_PHONE');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xác thực SĐT Phụ huynh.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePickSibling(studentId: string) {
    setSubmitting(true);
    setErrorMsg('');
    try {
      if (candidateSource === 'PARENT_PHONE') {
        await onStudentLogin({
          method: 'PARENT_PHONE',
          phone: parentPhone,
          secret: parentSecret,
          studentId,
        });
      } else if (candidateSource === 'GMAIL') {
        await onSignInGmail('STUDENT', studentId);
      }
      setCandidates([]);
      setCandidateSource(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể vào lớp cho học sinh đã chọn.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStudentGmailClick() {
    setErrorMsg('');
    try {
      const res = await onSignInGmail('STUDENT');
      if (res && res.requiresChildSelection && res.candidates && res.candidates.length > 0) {
        setCandidates(res.candidates);
        setCandidateSource('GMAIL');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập Gmail vào lớp chưa thành công.';
      if (!msg.includes('popup-closed-by-user')) setErrorMsg(msg);
    }
  }

  async function handleTeacherGmailClick() {
    setErrorMsg('');
    try {
      await onSignInGmail('TEACHER');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập Gmail Giáo viên chưa thành công.';
      if (!msg.includes('popup-closed-by-user')) setErrorMsg(msg);
    }
  }

  return (
    <section className="max-w-4xl mx-auto px-6 py-12 lg:py-16">
      <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
        {/* Gate Header + Audience Switch */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Cổng Xác thực Vào Lớp · Trung Tâm Nhân Trí</span>
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-950">
              Xác nhận danh tính trước khi vào Thời khóa biểu &amp; Kho đề
            </h1>
          </div>

          <div className="inline-flex p-1 bg-slate-100 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => {
                setAudience('STUDENT');
                setErrorMsg('');
                setCandidates([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                audience === 'STUDENT'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Học sinh vào lớp</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAudience('TEACHER');
                setErrorMsg('');
                setCandidates([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                audience === 'TEACHER'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Giáo viên / Quản trị</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* Sibling Selection Step when Parent Phone / Parent Gmail has multiple children */}
        {candidates.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-950">
                  Tìm thấy {candidates.length} học sinh cùng gia đình — Em chọn tên của mình để vào lớp:
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hệ thống tự động lọc Thời khóa biểu và kho đề GDPT 2018 theo đúng lớp của em.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCandidates([]);
                  setCandidateSource(null);
                }}
                className="text-xs font-semibold text-slate-600 hover:text-slate-950 cursor-pointer whitespace-nowrap"
              >
                Quay lại
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {candidates.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => handlePickSibling(cand.id)}
                  className="text-left p-4 border border-slate-200 hover:border-blue-900 hover:bg-blue-50/40 rounded-xl transition-colors flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-mono-num font-semibold text-blue-900">
                      {cand.code} · {cand.centerClass}
                    </p>
                    <p className="text-sm font-bold text-slate-950 mt-0.5">{cand.fullName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Khối {cand.grade} · {cand.school}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-blue-900 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : audience === 'STUDENT' ? (
          <div className="space-y-5">
            {/* Student Method Tabs */}
            <div className="flex flex-wrap gap-2">
              {policy.allowStudentCodeLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setStudentMethod('STUDENT_CODE');
                    setErrorMsg('');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    studentMethod === 'STUDENT_CODE'
                      ? 'bg-blue-50 text-blue-950 border-blue-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Mã số học sinh</span>
                </button>
              )}
              {policy.allowStudentParentPhoneLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setStudentMethod('PARENT_PHONE');
                    setErrorMsg('');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    studentMethod === 'PARENT_PHONE'
                      ? 'bg-blue-50 text-blue-950 border-blue-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>SĐT Phụ huynh</span>
                </button>
              )}
              {(policy.allowStudentParentGmailLogin || policy.allowStudentPersonalGmail) && (
                <button
                  type="button"
                  onClick={() => {
                    setStudentMethod('GMAIL');
                    setErrorMsg('');
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    studentMethod === 'GMAIL'
                      ? 'bg-blue-50 text-blue-950 border-blue-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Gmail (Phụ huynh / Cá nhân)</span>
                </button>
              )}
            </div>

            {/* Method 1: Student Code */}
            {studentMethod === 'STUDENT_CODE' && policy.allowStudentCodeLogin && (
              <form onSubmit={handleStudentCodeSubmit} className="space-y-4">
                <div className={`grid gap-4 ${policy.requirePhoneLast4ForStudentCode ? 'sm:grid-cols-2' : 'sm:grid-cols-1 max-w-md'}`}>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Mã số học sinh hoặc Mã liên kết nhanh *
                    </label>
                    <input
                      type="text"
                      required
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                      placeholder="VD: NT-6A1-01 hoặc NT6A1H"
                      className="w-full h-10 px-3 text-sm font-mono-num uppercase border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  {policy.requirePhoneLast4ForStudentCode && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        4 số cuối SĐT Phụ huynh *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={phoneLast4}
                        onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, ''))}
                        placeholder="VD: 4412"
                        className="w-full h-10 px-3 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>{submitting ? 'Đang kiểm tra...' : 'Xác nhận & Vào lớp'}</span>
                  </button>
                  {policy.allowDemoPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setStudentCode('NT-6A1-01');
                        setPhoneLast4('4412');
                      }}
                      className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
                    >
                      Điền mẫu thử: NT-6A1-01 (Nguyễn Phúc Hòa · 6A1)
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Method 2: Parent Phone */}
            {studentMethod === 'PARENT_PHONE' && policy.allowStudentParentPhoneLogin && (
              <form onSubmit={handleStudentPhoneSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Số điện thoại Phụ huynh đã đăng ký *
                    </label>
                    <input
                      type="tel"
                      required
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="VD: 0918204412"
                      className="w-full h-10 px-3 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  {policy.requireParentPinOrCode && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Mã PIN gia đình hoặc Mã HS *
                      </label>
                      <input
                        type="text"
                        required
                        value={parentSecret}
                        onChange={(e) => setParentSecret(e.target.value)}
                        placeholder="VD: 123456"
                        className="w-full h-10 px-3 text-sm font-mono-num border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Phone className="w-4 h-4" />
                    <span>{submitting ? 'Đang kiểm tra...' : 'Tìm hồ sơ & Vào lớp'}</span>
                  </button>
                  {policy.allowDemoPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setParentPhone('0918204412');
                        setParentSecret('123456');
                      }}
                      className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
                    >
                      Điền mẫu thử 2 anh em (0918204412 · PIN 123456)
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Method 3: Gmail (Parent Gmail or Age-Verified Personal Student Gmail) */}
            {studentMethod === 'GMAIL' && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1.5 leading-relaxed">
                  <p className="font-bold text-slate-900">Quy định sử dụng Gmail vào lớp tại Nhân Trí:</p>
                  <p>
                    • <strong>Gmail Phụ huynh:</strong> Áp dụng cho mọi khối lớp (nếu gia đình có nhiều con, hệ thống sẽ hiện danh sách để chọn tên).
                  </p>
                  <p>
                    • <strong>Gmail cá nhân Học sinh:</strong>{' '}
                    {policy.allowStudentPersonalGmail
                      ? `Áp dụng cho học sinh từ Lớp ${policy.minGradeForPersonalGmail} trở lên (đã gắn Gmail trong hồ sơ) hoặc được Admin cấp ngoại lệ.`
                      : 'Hiện đang tắt bởi SuperAdmin; học sinh vui lòng dùng Mã số học sinh hoặc Gmail Phụ huynh.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={handleStudentGmailClick}
                    className="inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{authBusy ? 'Đang kết nối Google...' : 'Đăng nhập Gmail để vào lớp'}</span>
                  </button>
                  {policy.allowDemoPreview && onQuickPreviewRole && (
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={() => onQuickPreviewRole('STUDENT')}
                      className="inline-flex items-center gap-1.5 px-4 h-10 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      <span>Xem thử vai trò Học sinh</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Teacher / Staff Sign-In Tab */
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Giáo viên bộ môn, Admin Vận hành và SuperAdmin sử dụng tài khoản Gmail đã được cấp quyền trên hệ thống để mở Thời khóa biểu đứng lớp, điểm danh tự động và quản trị học vụ CMS.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={authBusy}
                onClick={handleTeacherGmailClick}
                className="inline-flex items-center gap-2 px-5 h-10 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                <span>{authBusy ? 'Đang mở xác thực Google...' : 'Đăng nhập Gmail Giáo viên / Quản trị'}</span>
              </button>
              {policy.allowDemoPreview && onQuickPreviewRole && (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={() => onQuickPreviewRole('TEACHER')}
                  className="inline-flex items-center gap-1.5 px-4 h-10 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <span>Xem thử vai trò Giáo viên</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            Cần cấp lại Mã HS hoặc Mã PIN? Liên hệ Zalo{' '}
            <strong className="font-mono-num text-slate-800">{siteConfig.hotlineZalo}</strong>.
          </span>
          <span className="font-mono-num text-slate-400">
            Ngưỡng Gmail cá nhân HS: Lớp {policy.minGradeForPersonalGmail}+
          </span>
        </div>
      </div>
    </section>
  );
};
