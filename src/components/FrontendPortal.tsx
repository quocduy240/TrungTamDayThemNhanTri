import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  FileBarChart2,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  Pencil,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  CoursePackage,
  DayOfWeek,
  FrontendMode,
  Language,
  NationalExam,
  SiteConfig,
  TimetableSlot,
} from '../types';
import {
  apiRequest,
  buildZaloReportText,
  downloadStudentIcs,
  formatVnd,
  isAdminOrSuper,
  roleLabel,
  type BootstrapPayload,
  type WorkspacePayload,
} from '../lib/api';
import { InlineEditable } from './InlineEditable';

interface FrontendPortalProps {
  bootstrap: BootstrapPayload;
  workspace: WorkspacePayload | null;
  siteConfig: SiteConfig;
  courses: CoursePackage[];
  currentUser: AuthUser | null;
  frontendMode: FrontendMode;
  onChangeFrontendMode: (mode: FrontendMode) => void;
  lang: Language;
  onToggleLang: () => void;
  editMode: boolean;
  onToggleEditMode: () => void;
  onQuickSaveConfig: (patch: Partial<SiteConfig>) => Promise<void>;
  onQuickSaveCourse: (course: CoursePackage) => Promise<void>;
  onSignInGmail: () => Promise<void>;
  onOpenRoleModal: () => void;
  onOpenCms: (tab?: string) => void;
  authBusy: boolean;
}

const MODE_OPTIONS: {
  id: FrontendMode;
  labelVi: string;
  labelEn: string;
  descVi: string;
  shortVi: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'TEACHER_STUDENT',
    labelVi: 'Giáo viên & Học sinh',
    labelEn: 'Teachers & Students',
    descVi: 'Mặc định · Lịch học tuần, Kho đề GDPT 2018 & Quét bài AI',
    shortVi: 'GV & Học sinh',
    icon: <GraduationCap className="w-3.5 h-3.5" />,
  },
  {
    id: 'PARENT',
    labelVi: 'Phụ huynh',
    labelEn: 'Parents',
    descVi: 'Học bạ Online, Điểm danh, Lịch bù Thể dục & Đóng học phí QR',
    shortVi: 'Phụ huynh',
    icon: <Users className="w-3.5 h-3.5" />,
  },
  {
    id: 'NEW_CUSTOMER',
    labelVi: 'Khách hàng mới',
    labelEn: 'New Families',
    descVi: 'Khóa học Cấp 1–2–3, Dự toán học phí, Ảnh cơ sở & Tư vấn 24/7',
    shortVi: 'Khách hàng mới',
    icon: <Sparkles className="w-3.5 h-3.5" />,
  },
];

const DAYS: DayOfWeek[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAY_LABELS: Record<DayOfWeek, string> = {
  T2: 'Thứ 2',
  T3: 'Thứ 3',
  T4: 'Thứ 4',
  T5: 'Thứ 5',
  T6: 'Thứ 6',
  T7: 'Thứ 7',
};

export const FrontendPortal: React.FC<FrontendPortalProps> = ({
  bootstrap,
  workspace,
  siteConfig,
  courses,
  currentUser,
  frontendMode,
  onChangeFrontendMode,
  lang,
  onToggleLang,
  editMode,
  onToggleEditMode,
  onQuickSaveConfig,
  onQuickSaveCourse,
  onSignInGmail,
  onOpenRoleModal,
  onOpenCms,
  authBusy,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canInlineEdit = isAdminOrSuper(currentUser?.role);
  const isEditingActive = canInlineEdit && editMode;

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // --- Shared Enrollment & AI Advisor State (Mode 3: New Customer) ---
  const [selectedCourse, setSelectedCourse] = useState<CoursePackage | null>(null);
  const [enrollForm, setEnrollForm] = useState({
    studentName: '',
    parentName: '',
    parentPhone: '',
    grade: 6,
    school: 'THCS Lý Thường Kiệt',
    selectedSubjects: ['Toán', 'Ngữ Văn', 'Tiếng Anh'],
    hasBoarding: true,
    hasShuttle: false,
    annualPrepaid: true,
    peConflictDay: '' as '' | DayOfWeek,
  });
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollResult, setEnrollResult] = useState<{ message: string; total: number } | null>(null);
  const [enrollError, setEnrollError] = useState('');

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Quick tuition estimator
  const [calcLevel, setCalcLevel] = useState<'CAP_1' | 'CAP_2' | 'CAP_3'>('CAP_2');
  const [calcSubjectsCount, setCalcSubjectsCount] = useState(3);
  const [calcBoarding, setCalcBoarding] = useState(true);
  const [calcShuttle, setCalcShuttle] = useState(false);
  const [calcAnnual, setCalcAnnual] = useState(true);

  // --- Mode 1 (Teacher & Student) State ---
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterPeriod, setFilterPeriod] = useState<'ALL' | 'SANG' | 'CHIEU' | 'TOI'>('ALL');
  const [activeExam, setActiveExam] = useState<NationalExam | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<number, number>>({});
  const [examResult, setExamResult] = useState<{ correct: number; total: number; score: number } | null>(null);

  // --- Mode 2 (Parent) State ---
  const [parentQuery, setParentQuery] = useState('');
  const [zaloCopied, setZaloCopied] = useState(false);
  const [parentFeedbackSent, setParentFeedbackSent] = useState('');
  const [parentFeedbackForm, setParentFeedbackForm] = useState({
    authorName: '',
    phone: '',
    subject: '',
    message: '',
  });

  const liveTimetable: TimetableSlot[] = useMemo(() => {
    return workspace?.timetable || bootstrap.timetable || [];
  }, [workspace, bootstrap]);

  const liveExams: NationalExam[] = useMemo(() => {
    return workspace?.exams || bootstrap.exams || [];
  }, [workspace, bootstrap]);

  const classOptions = useMemo(() => {
    const set = new Set(liveTimetable.map((s) => s.centerClass));
    return Array.from(set).sort();
  }, [liveTimetable]);

  const filteredTimetable = useMemo(() => {
    return liveTimetable.filter((slot) => {
      if (filterClass !== 'ALL' && slot.centerClass !== filterClass) return false;
      if (filterPeriod !== 'ALL' && slot.period !== filterPeriod) return false;
      return true;
    });
  }, [liveTimetable, filterClass, filterPeriod]);

  const estimatedFee = useMemo(() => {
    const course = courses.find((c) => c.level === calcLevel) || courses[1] || courses[0];
    if (!course) {
      return { base: 0, boarding: 0, shuttle: 0, discount: 0, monthlyFinal: 0, annualTotal: 0 };
    }
    const base =
      course.billingModel === 'PER_SUBJECT'
        ? course.monthlyPrice * calcSubjectsCount
        : course.monthlyPrice;
    const boarding = calcBoarding && course.boardingAddonPrice ? course.boardingAddonPrice : 0;
    const shuttle = calcShuttle && course.shuttleAddonPrice ? course.shuttleAddonPrice : 0;
    const sub = base + boarding + shuttle;
    const discPct = siteConfig.annualDiscountPercent ?? course.annualDiscountPercent ?? 10;
    const discount = calcAnnual ? Math.round(sub * (discPct / 100)) : 0;
    return {
      base,
      boarding,
      shuttle,
      discount,
      monthlyFinal: sub - discount,
      annualTotal: (sub - discount) * 9,
    };
  }, [courses, calcLevel, calcSubjectsCount, calcBoarding, calcShuttle, calcAnnual, siteConfig.annualDiscountPercent]);

  const modalEstimatedFee = useMemo(() => {
    if (!selectedCourse) return 0;
    const base =
      selectedCourse.billingModel === 'PER_SUBJECT'
        ? selectedCourse.monthlyPrice * Math.max(1, enrollForm.selectedSubjects.length)
        : selectedCourse.monthlyPrice;
    const boarding =
      enrollForm.hasBoarding && selectedCourse.boardingAddonPrice
        ? selectedCourse.boardingAddonPrice
        : 0;
    const shuttle =
      enrollForm.hasShuttle && selectedCourse.shuttleAddonPrice
        ? selectedCourse.shuttleAddonPrice
        : 0;
    const sub = base + boarding + shuttle;
    const discount = enrollForm.annualPrepaid
      ? Math.round(sub * ((siteConfig.annualDiscountPercent ?? 10) / 100))
      : 0;
    return sub - discount;
  }, [selectedCourse, enrollForm, siteConfig.annualDiscountPercent]);

  // Parent portal active student (from signed-in workspace or sample preview)
  const parentStudents = useMemo(() => {
    const list = workspace?.students || [];
    if (!parentQuery.trim()) return list;
    const q = parentQuery.trim().toLowerCase();
    return list.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.centerClass.toLowerCase().includes(q),
    );
  }, [workspace, parentQuery]);

  const focusedStudent = parentStudents[0] || null;
  const focusedScores = useMemo(() => {
    if (!focusedStudent || !workspace) return [];
    return workspace.scores.filter((sc) => sc.studentId === focusedStudent.id);
  }, [focusedStudent, workspace]);
  const focusedAttendance = useMemo(() => {
    if (!focusedStudent || !workspace) return [];
    return workspace.attendance.filter((a) => a.studentId === focusedStudent.id);
  }, [focusedStudent, workspace]);
  const focusedTuition = useMemo(() => {
    if (!focusedStudent || !workspace) return [];
    return workspace.tuition.filter((t) => t.studentId === focusedStudent.id);
  }, [focusedStudent, workspace]);

  function openCourseModal(course: CoursePackage) {
    const defaultGrade = course.level === 'CAP_1' ? 5 : course.level === 'CAP_2' ? 7 : 10;
    setSelectedCourse(course);
    setEnrollResult(null);
    setEnrollError('');
    setEnrollForm({
      studentName: '',
      parentName: '',
      parentPhone: '',
      grade: defaultGrade,
      school:
        course.level === 'CAP_1'
          ? 'Tiểu học Nguyễn Du'
          : course.level === 'CAP_2'
            ? 'THCS Lý Thường Kiệt'
            : 'THPT Thoại Ngọc Hầu',
      selectedSubjects: course.subjects.slice(0, course.level === 'CAP_3' ? 2 : 4),
      hasBoarding: course.level === 'CAP_2',
      hasShuttle: false,
      annualPrepaid: true,
      peConflictDay: '',
    });
  }

  async function handleEnrollSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourse) return;
    setEnrollSubmitting(true);
    setEnrollError('');
    try {
      const res = await apiRequest<{ student: { fullName: string }; tuition: { totalAmount: number } }>(
        '/api/v1/enrollments',
        {
          method: 'POST',
          body: JSON.stringify({
            ...enrollForm,
            courseId: selectedCourse.id,
          }),
        },
      );
      setEnrollResult({
        message: `Đã ghi nhận hồ sơ em ${res.student.fullName} vào hệ thống Trung Tâm Nhân Trí. Ban học vụ sẽ gửi TKB cá nhân qua Zalo ngay.`,
        total: res.tuition.totalAmount,
      });
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : 'Không thể gửi đăng ký.');
    } finally {
      setEnrollSubmitting(false);
    }
  }

  async function handleAskAdvisor(preset?: string) {
    const q = (preset ?? aiQuestion).trim();
    if (!q) return;
    setAiQuestion(q);
    setAiLoading(true);
    setAiError('');
    try {
      const res = await apiRequest<{ answer: string }>('/api/v1/ai/consult', {
        method: 'POST',
        body: JSON.stringify({ question: q, language: lang }),
      });
      setAiAnswer(res.answer);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Trợ lý AI tạm thời không phản hồi.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleSubmitQuickExam() {
    if (!activeExam) return;
    let correct = 0;
    activeExam.questions.forEach((q, idx) => {
      if (examAnswers[idx] === q.correctIndex) correct += 1;
    });
    const score = Math.round(((correct / activeExam.questions.length) * 10) * 100) / 100;
    setExamResult({ correct, total: activeExam.questions.length, score });
  }

  async function handleSendParentFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!parentFeedbackForm.authorName || !parentFeedbackForm.message) return;
    try {
      await apiRequest('/api/v1/tickets', {
        method: 'POST',
        body: JSON.stringify({
          authorName: parentFeedbackForm.authorName,
          phone: parentFeedbackForm.phone,
          category: 'FEEDBACK',
          subject: parentFeedbackForm.subject || 'Góp ý / Trao đổi từ Cổng Phụ huynh',
          message: parentFeedbackForm.message,
        }),
      });
      setParentFeedbackSent('Đã gửi thông điệp tới Ban Học vụ Trung Tâm Nhân Trí.');
      setParentFeedbackForm({ authorName: '', phone: '', subject: '', message: '' });
    } catch {
      setParentFeedbackSent('Không thể gửi ngay lúc này, vui lòng liên hệ trực tiếp Zalo trung tâm.');
    }
  }

  const activeModeMeta = MODE_OPTIONS.find((m) => m.id === frontendMode) || MODE_OPTIONS[0];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Optional Slim Top Announcement Bar (1-Click Editable) */}
      {siteConfig.showAnnouncement && siteConfig.announcementBanner && (
        <div className="bg-blue-950 text-blue-50 border-b border-blue-900">
          <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-num text-[11px] font-semibold text-blue-300 shrink-0">
                {siteConfig.domain}
              </span>
              <span aria-hidden="true" className="text-blue-700">·</span>
              <InlineEditable
                value={siteConfig.announcementBanner}
                editMode={isEditingActive}
                darkSurface
                onSave={(val) => onQuickSaveConfig({ announcementBanner: val })}
                className="truncate text-blue-50"
              />
            </div>
            <a
              href={siteConfig.zaloUrl || `tel:${siteConfig.hotlineZalo.replace(/\s+/g, '')}`}
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-200 hover:text-white shrink-0 whitespace-nowrap"
            >
              <Phone className="w-3 h-3" />
              <span>Zalo: {siteConfig.hotlineZalo}</span>
            </a>
          </div>
        </div>
      )}

      {/* Strict 3-Zone Top Bar with Ultra-Slim 3-Mode Frontend Dropdown */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Mark */}
          <div className="flex items-center gap-2.5 shrink-0 min-w-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-900 text-white font-bold text-sm shrink-0">
              NT
            </span>
            <div className="leading-tight">
              <InlineEditable
                value={siteConfig.shortName}
                editMode={isEditingActive}
                onSave={(val) => onQuickSaveConfig({ shortName: val })}
                className="text-sm sm:text-base font-extrabold tracking-tight text-blue-950 block"
              />
              <span className="text-[11px] text-slate-500 hidden sm:block font-mono-num">
                {siteConfig.domain}
              </span>
            </div>
          </div>

          {/* Zone 2: Ultra-Slim Dropdown Switcher for 3 Refined Frontend Display Modes */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              aria-expanded={dropdownOpen}
              className="inline-flex items-center gap-2 h-9 px-3.5 text-xs sm:text-sm font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <span className="text-blue-900">{activeModeMeta.icon}</span>
              <span className="text-slate-400 hidden md:inline text-xs font-normal">Giao diện:</span>
              <span className="font-semibold text-slate-950">
                {lang === 'vi' ? activeModeMeta.labelVi : activeModeMeta.labelEn}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50">
                <p className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Chọn chế độ hiển thị Frontend
                </p>
                {MODE_OPTIONS.map((opt) => {
                  const isActive = opt.id === frontendMode;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChangeFrontendMode(opt.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5 cursor-pointer ${
                        isActive ? 'bg-blue-50/90 text-blue-950' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span
                        className={`mt-0.5 shrink-0 ${
                          isActive ? 'text-blue-900' : 'text-slate-400'
                        }`}
                      >
                        {opt.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">
                            {lang === 'vi' ? opt.labelVi : opt.labelEn}
                          </span>
                          {isActive && <Check className="w-3.5 h-3.5 text-blue-900 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {opt.descVi}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Zone 3: Language + Gmail Sign-In / CMS Entry */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLang}
              className="hidden sm:inline-flex items-center justify-center h-9 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              {lang === 'vi' ? 'EN' : 'VI'}
            </button>

            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenCms('overview')}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs sm:text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>{isAdminOrSuper(currentUser.role) ? 'Backend CMS' : 'Cổng CMS'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={onSignInGmail}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs sm:text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{authBusy ? 'Đang kết nối...' : 'Đăng nhập Gmail'}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenRoleModal}
                  className="hidden md:inline-flex items-center h-9 px-3 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Dùng thử vai trò
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* MODE 1 (DEFAULT): GIÁO VIÊN & HỌC SINH                                */}
      {/* ===================================================================== */}
      {frontendMode === 'TEACHER_STUDENT' && (
        <main>
          {/* Compact Academic Hero */}
          <section className="bg-slate-50 border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-6 py-10 lg:py-12">
              <div className="grid lg:grid-cols-12 gap-8 items-stretch">
                <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-blue-900 flex items-center gap-2">
                      <span>Cổng Giáo viên &amp; Học sinh (Mặc định)</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <InlineEditable
                        value={siteConfig.slogan}
                        editMode={isEditingActive}
                        onSave={(val) => onQuickSaveConfig({ slogan: val })}
                        className="text-slate-500 font-medium"
                      />
                    </p>
                    <InlineEditable
                      as="h1"
                      value={siteConfig.heroTitleTeacherStudent}
                      editMode={isEditingActive}
                      onSave={(val) => onQuickSaveConfig({ heroTitleTeacherStudent: val })}
                      className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-950 leading-[1.18]"
                    />
                    <InlineEditable
                      as="p"
                      multiline
                      value={siteConfig.heroSubtitleTeacherStudent}
                      editMode={isEditingActive}
                      onSave={(val) => onQuickSaveConfig({ heroSubtitleTeacherStudent: val })}
                      className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <a
                      href="#tkb-tuan"
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg transition-colors"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Xem Thời khóa biểu Tuần</span>
                    </a>
                    <a
                      href="#luyen-de-gdpt"
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-blue-900" />
                      <span>Luyện đề GDPT 2018</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => (currentUser ? onOpenCms('scores') : onSignInGmail())}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Chụp bài kiểm tra quét AI</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-200/80 text-xs">
                    <div>
                      <p className="font-mono-num text-lg font-bold text-blue-950">
                        {liveTimetable.length} ca học
                      </p>
                      <p className="text-slate-500">Sáng · Chiều · Tối đồng bộ</p>
                    </div>
                    <div>
                      <p className="font-mono-num text-lg font-bold text-blue-950">
                        {bootstrap.teachers.length} giáo viên
                      </p>
                      <p className="text-slate-500">Đứng lớp &amp; Trả bài trực tiếp</p>
                    </div>
                    <div>
                      <p className="font-mono-num text-lg font-bold text-red-700">
                        {liveExams.length} bộ đề
                      </p>
                      <p className="text-slate-500">Chuẩn quốc gia GDPT 2018</p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5">
                  <div className="relative h-full min-h-[250px] rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
                    <img
                      src={siteConfig.heroImageUrl || '/assets/aistudio/IMG_9559_62d21d91.JPG'}
                      alt={siteConfig.centerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-4 text-white">
                      <p className="text-xs font-semibold">{siteConfig.centerName}</p>
                      <InlineEditable
                        value={siteConfig.heroCaption}
                        editMode={isEditingActive}
                        darkSurface
                        onSave={(val) => onQuickSaveConfig({ heroCaption: val })}
                        className="text-[11px] text-slate-200 mt-0.5 block"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Live Dynamic Weekly Timetable Viewer */}
          <section id="tkb-tuan" className="max-w-7xl mx-auto px-6 py-12 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-900">Đồng bộ lịch giáo viên &amp; lịch học sinh</p>
                <h2 className="text-2xl font-bold tracking-tight text-slate-950 mt-0.5">
                  Thời khóa biểu động tuần hiện tại
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="h-9 px-3 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                >
                  <option value="ALL">Tất cả khối lớp ({classOptions.length})</option>
                  {classOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <div className="inline-flex border border-slate-200 rounded-lg overflow-hidden text-xs font-medium">
                  {[
                    { id: 'ALL', label: 'Cả ngày' },
                    { id: 'SANG', label: 'Sáng' },
                    { id: 'CHIEU', label: 'Chiều' },
                    { id: 'TOI', label: 'Tối / Bù TD' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setFilterPeriod(p.id as 'ALL' | 'SANG' | 'CHIEU' | 'TOI')}
                      className={`px-3 h-9 cursor-pointer transition-colors ${
                        filterPeriod === p.id
                          ? 'bg-blue-900 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {currentUser && (
                  <button
                    type="button"
                    onClick={() => onOpenCms('timetable')}
                    className="h-9 px-3 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                  >
                    Xếp lịch / Dạy thay
                  </button>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {DAYS.map((day) => {
                const daySlots = filteredTimetable.filter((s) => s.day === day);
                return (
                  <div
                    key={day}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                  >
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-950">{DAY_LABELS[day]}</span>
                      <span className="font-mono-num text-[11px] text-slate-500">
                        {daySlots.length} ca
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 flex-1">
                      {daySlots.length === 0 ? (
                        <p className="p-4 text-xs text-slate-400">Không có lịch theo bộ lọc hiện tại.</p>
                      ) : (
                        daySlots.map((slot) => (
                          <div key={slot.id} className="p-3.5 space-y-1 hover:bg-slate-50/70">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-mono-num font-semibold text-blue-900">
                                {slot.timeRange}
                              </span>
                              <span className="font-semibold text-slate-700">{slot.centerClass}</span>
                            </div>
                            <p className="text-sm font-bold text-slate-950">{slot.subject}</p>
                            <p className="text-xs text-slate-600">
                              {slot.teacherName} · {slot.room}
                              {slot.slotType === 'BU_THE_DUC' && (
                                <span className="text-red-700 font-semibold"> · Học bù Thể dục</span>
                              )}
                            </p>
                            {slot.note && (
                              <p className="text-[11px] text-slate-500 italic">{slot.note}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Interactive National GDPT 2018 Exam Practice */}
          {siteConfig.enableOnlineExams && (
            <section id="luyen-de-gdpt" className="bg-slate-50 border-y border-slate-200 py-12">
              <div className="max-w-7xl mx-auto px-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-blue-900">Thực hành trực tiếp &amp; Chấm điểm tức thì</p>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-950 mt-0.5">
                      Thư viện Đề chuẩn Quốc gia (GDPT 2018)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-600">
                    Học sinh có thể làm bài ngay tại đây; đăng nhập Gmail để tự động lưu điểm vào Học bạ Online.
                  </p>
                </div>

                {activeExam ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                      <div>
                        <p className="text-xs text-blue-900 font-semibold">
                          Khối {activeExam.grade} · {activeExam.subject} · {activeExam.durationMinutes} phút
                        </p>
                        <h3 className="text-lg font-bold text-slate-950 mt-0.5">{activeExam.title}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExam(null);
                          setExamResult(null);
                          setExamAnswers({});
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                      >
                        Quay lại danh sách đề
                      </button>
                    </div>

                    <div className="space-y-5">
                      {activeExam.questions.map((q, idx) => (
                        <div key={q.id} className="space-y-2.5">
                          <p className="text-sm font-semibold text-slate-950">
                            Câu {idx + 1}. {q.prompt}
                          </p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {q.options.map((opt, optIdx) => {
                              const picked = examAnswers[idx] === optIdx;
                              const showGrading = examResult !== null;
                              const isRight = optIdx === q.correctIndex;
                              let cls = 'border-slate-200 hover:border-blue-400 bg-white text-slate-800';
                              if (showGrading && isRight) {
                                cls = 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold';
                              } else if (showGrading && picked && !isRight) {
                                cls = 'border-red-500 bg-red-50 text-red-900';
                              } else if (picked) {
                                cls = 'border-blue-900 bg-blue-50 text-blue-950 font-semibold';
                              }
                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  disabled={showGrading}
                                  onClick={() => setExamAnswers((prev) => ({ ...prev, [idx]: optIdx }))}
                                  className={`text-left px-3.5 py-2.5 text-xs border rounded-lg transition-colors cursor-pointer ${cls}`}
                                >
                                  <span className="font-mono-num font-bold mr-2">
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                          {examResult && (
                            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                              Giải thích: {q.explanation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
                      {examResult ? (
                        <div className="text-sm">
                          <span className="text-slate-600">Kết quả: </span>
                          <span className="font-mono-num font-bold text-blue-950 text-base">
                            {examResult.score}/10
                          </span>
                          <span className="text-slate-500 ml-2">
                            (Đúng {examResult.correct}/{examResult.total} câu)
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Đã chọn {Object.keys(examAnswers).length}/{activeExam.questions.length} câu hỏi.
                        </p>
                      )}
                      {!examResult && (
                        <button
                          type="button"
                          onClick={handleSubmitQuickExam}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                        >
                          Nộp bài &amp; Xem đáp án
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {liveExams.map((ex) => (
                      <div
                        key={ex.id}
                        className="p-5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500">
                            Khối {ex.grade} · {ex.subject} · {ex.durationMinutes} phút · {ex.questions.length} câu
                          </p>
                          <h3 className="text-sm font-bold text-slate-950">{ex.title}</h3>
                          <p className="text-xs text-slate-600">{ex.curriculumStandard}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveExam(ex);
                            setExamAnswers({});
                            setExamResult(null);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Làm bài ngay
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      )}

      {/* ===================================================================== */}
      {/* MODE 2: PHỤ HUYNH (PARENT PORTAL)                                     */}
      {/* ===================================================================== */}
      {frontendMode === 'PARENT' && (
        <main>
          <section className="bg-slate-50 border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-6 py-10 lg:py-12 space-y-6">
              <div className="max-w-3xl space-y-2.5">
                <p className="text-xs font-semibold text-blue-900">
                  Cổng Phụ huynh · Học bạ Online &amp; Thanh toán học phí
                </p>
                <InlineEditable
                  as="h1"
                  value={siteConfig.heroTitleParent}
                  editMode={isEditingActive}
                  onSave={(val) => onQuickSaveConfig({ heroTitleParent: val })}
                  className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-950 leading-[1.18]"
                />
                <InlineEditable
                  as="p"
                  multiline
                  value={siteConfig.heroSubtitleParent}
                  editMode={isEditingActive}
                  onSave={(val) => onQuickSaveConfig({ heroSubtitleParent: val })}
                  className="text-sm sm:text-base text-slate-600 leading-relaxed"
                />
              </div>

              {!workspace ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-950 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-900" />
                      <span>Bảo mật hồ sơ học tập &amp; học phí của con em</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Vui lòng đăng nhập bằng Gmail Phụ huynh (hoặc chọn dùng thử vai trò Phụ huynh) để xem Học bạ Online, điểm danh, tải TKB Google Calendar và thanh toán học phí.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={onSignInGmail}
                      className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                    >
                      Đăng nhập Gmail Phụ huynh
                    </button>
                    <button
                      type="button"
                      onClick={onOpenRoleModal}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Xem mẫu Học bạ Phụ huynh
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Search / Student Switcher */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-3 flex-1">
                      <input
                        type="text"
                        value={parentQuery}
                        onChange={(e) => setParentQuery(e.target.value)}
                        placeholder="Tìm theo họ tên học sinh, mã HS hoặc lớp (VD: Phúc Hòa, 6A1)..."
                        className="w-full max-w-md h-9 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                      />
                    </div>
                    {focusedStudent && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            downloadStudentIcs(focusedStudent.id, `TKB-NhanTri-${focusedStudent.code}.ics`)
                          }
                          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải Google Calendar (.ics)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const txt = buildZaloReportText(
                              focusedStudent,
                              workspace.scores,
                              workspace.timetable,
                              workspace.attendance,
                            );
                            navigator.clipboard?.writeText(txt);
                            setZaloCopied(true);
                            setTimeout(() => setZaloCopied(false), 2500);
                          }}
                          className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{zaloCopied ? 'Đã sao chép mẫu Zalo' : 'Sao chép báo cáo Zalo'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {focusedStudent && (
                    <div className="grid lg:grid-cols-12 gap-6">
                      {/* Left: Học bạ & Chuyên cần */}
                      <div className="lg:col-span-7 space-y-6">
                        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                            <div>
                              <p className="text-xs font-mono-num text-blue-900 font-semibold">
                                {focusedStudent.code} · {focusedStudent.centerClass} · {focusedStudent.school}
                              </p>
                              <h2 className="text-lg font-bold text-slate-950 mt-0.5">
                                {focusedStudent.fullName}
                              </h2>
                              <p className="text-xs text-slate-500">
                                Giáo viên quản nhiệm: {focusedStudent.homeroomTeacher} ({focusedStudent.room})
                              </p>
                            </div>
                            {focusedStudent.eveningMakeupSlot && (
                              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                                {focusedStudent.eveningMakeupSlot}
                              </div>
                            )}
                          </div>

                          <div>
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                              Học bạ Online gần đây
                            </h3>
                            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                              {focusedScores.length === 0 ? (
                                <p className="p-4 text-xs text-slate-400">Chưa có cột điểm mới.</p>
                              ) : (
                                focusedScores.map((sc) => (
                                  <div key={sc.id} className="p-3.5 flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                      <p className="text-sm font-bold text-slate-950">
                                        {sc.subject}{' '}
                                        <span className="text-xs font-normal text-slate-500">
                                          · {sc.date}
                                        </span>
                                      </p>
                                      {sc.aiSummary && (
                                        <p className="text-xs text-slate-600">{sc.aiSummary}</p>
                                      )}
                                    </div>
                                    <span className="font-mono-num text-lg font-extrabold text-blue-950 shrink-0">
                                      {sc.score.toFixed(1)}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                              Nhật ký Điểm danh
                            </h3>
                            <div className="space-y-2">
                              {focusedAttendance.length === 0 ? (
                                <p className="text-xs text-slate-400">Đi học đầy đủ các ca trong tuần.</p>
                              ) : (
                                focusedAttendance.slice(0, 4).map((a) => (
                                  <div
                                    key={a.id}
                                    className="flex items-center justify-between text-xs p-2.5 bg-slate-50 rounded-lg"
                                  >
                                    <div>
                                      <span className="font-mono-num font-semibold text-slate-800">{a.date}</span>
                                      <span className="text-slate-500 ml-2">{a.shiftLabel}</span>
                                    </div>
                                    <span className="font-semibold text-blue-900">{a.status}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Học phí VietQR + Góp ý phụ huynh */}
                      <div className="lg:col-span-5 space-y-6">
                        {siteConfig.enableOnlinePayment && (
                          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-blue-900" />
                                <span>Học phí &amp; Chuyển khoản VietQR</span>
                              </h3>
                              <button
                                type="button"
                                onClick={() => onOpenCms('tuition')}
                                className="text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
                              >
                                Chi tiết
                              </button>
                            </div>

                            {focusedTuition.map((t) => (
                              <div
                                key={t.id}
                                className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs"
                              >
                                <div className="flex justify-between">
                                  <span className="font-semibold text-slate-800">{t.monthLabel}</span>
                                  <span
                                    className={`font-bold ${
                                      t.status === 'PAID'
                                        ? 'text-emerald-700'
                                        : t.status === 'OVERDUE'
                                          ? 'text-red-700'
                                          : 'text-amber-700'
                                    }`}
                                  >
                                    {t.status === 'PAID'
                                      ? 'Đã hoàn tất'
                                      : t.status === 'OVERDUE'
                                        ? 'Quá hạn'
                                        : 'Sắp đến hạn'}
                                  </span>
                                </div>
                                <div className="flex justify-between font-mono-num text-sm font-bold text-slate-950">
                                  <span>Tổng học phí:</span>
                                  <span>{formatVnd(t.totalAmount)}</span>
                                </div>
                              </div>
                            ))}

                            <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-lg text-xs space-y-1 text-slate-700">
                              <p className="font-bold text-blue-950">Thông tin chuyển khoản chính thức</p>
                              <p>Ngân hàng: <span className="font-semibold">{siteConfig.bankName}</span></p>
                              <p>Số tài khoản: <span className="font-mono-num font-bold text-slate-950">{siteConfig.bankAccount}</span></p>
                              <p>Chủ tài khoản: <span className="font-semibold">{siteConfig.bankOwner}</span></p>
                              <p>Ví MoMo / ZaloPay: <span className="font-mono-num font-semibold">{siteConfig.momoPhone}</span></p>
                            </div>
                          </div>
                        )}

                        <form
                          onSubmit={handleSendParentFeedback}
                          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                        >
                          <h3 className="text-sm font-bold text-slate-950">
                            Gửi góp ý / Xin phép nghỉ / Đổi ca học
                          </h3>
                          <div className="grid grid-cols-2 gap-2.5">
                            <input
                              required
                              type="text"
                              value={parentFeedbackForm.authorName}
                              onChange={(e) =>
                                setParentFeedbackForm({ ...parentFeedbackForm, authorName: e.target.value })
                              }
                              placeholder="Họ tên phụ huynh *"
                              className="h-9 px-3 text-xs border border-slate-300 rounded-lg"
                            />
                            <input
                              type="tel"
                              value={parentFeedbackForm.phone}
                              onChange={(e) =>
                                setParentFeedbackForm({ ...parentFeedbackForm, phone: e.target.value })
                              }
                              placeholder="SĐT Zalo"
                              className="h-9 px-3 text-xs border border-slate-300 rounded-lg"
                            />
                          </div>
                          <input
                            type="text"
                            value={parentFeedbackForm.subject}
                            onChange={(e) =>
                              setParentFeedbackForm({ ...parentFeedbackForm, subject: e.target.value })
                            }
                            placeholder="Tiêu đề (VD: Xin học bù tối thứ 4)"
                            className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
                          />
                          <textarea
                            required
                            rows={2}
                            value={parentFeedbackForm.message}
                            onChange={(e) =>
                              setParentFeedbackForm({ ...parentFeedbackForm, message: e.target.value })
                            }
                            placeholder="Nội dung nhắn gửi tới thầy cô..."
                            className="w-full p-3 text-xs border border-slate-300 rounded-lg"
                          />
                          {parentFeedbackSent && (
                            <p className="text-xs text-emerald-700 font-medium">{parentFeedbackSent}</p>
                          )}
                          <button
                            type="submit"
                            className="w-full py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                          >
                            Gửi tới Ban Học vụ
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* ===================================================================== */}
      {/* MODE 3: KHÁCH HÀNG MỚI (PROSPECTIVE STOREFRONT & 24/7 ADVISOR)        */}
      {/* ===================================================================== */}
      {frontendMode === 'NEW_CUSTOMER' && (
        <main>
          {/* Hero Split */}
          <section id="top" className="bg-slate-50 border-b border-slate-200">
            <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
              <div className="grid lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-slate-500">
                      <InlineEditable
                        value={siteConfig.campus1}
                        editMode={isEditingActive}
                        onSave={(val) => onQuickSaveConfig({ campus1: val })}
                      />
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num text-blue-900 font-semibold">{siteConfig.domain}</span>
                    </div>

                    <InlineEditable
                      as="h1"
                      value={siteConfig.heroTitleCustomer}
                      editMode={isEditingActive}
                      onSave={(val) => onQuickSaveConfig({ heroTitleCustomer: val })}
                      className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-950 leading-[1.15]"
                    />

                    <InlineEditable
                      as="p"
                      multiline
                      value={siteConfig.heroSubtitleCustomer}
                      editMode={isEditingActive}
                      onSave={(val) => onQuickSaveConfig({ heroSubtitleCustomer: val })}
                      className="text-base text-slate-600 leading-relaxed max-w-xl"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <a
                      href="#khoa-hoc"
                      className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors"
                    >
                      <span>Xem khóa học &amp; học phí</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onChangeFrontendMode('PARENT')}
                      className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <span>Cổng Phụ huynh</span>
                    </button>
                  </div>

                  <InlineEditable
                    as="p"
                    value={siteConfig.philosophy}
                    editMode={isEditingActive}
                    onSave={(val) => onQuickSaveConfig({ philosophy: val })}
                    className="pt-2 text-xs text-slate-500"
                  />
                </div>

                <div className="lg:col-span-6">
                  <div className="relative h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
                    <img
                      src={siteConfig.heroImageUrl || '/assets/aistudio/IMG_9559_62d21d91.JPG'}
                      alt={siteConfig.centerName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-5 text-white">
                      <InlineEditable
                        value={siteConfig.centerName}
                        editMode={isEditingActive}
                        darkSurface
                        onSave={(val) => onQuickSaveConfig({ centerName: val })}
                        className="text-sm font-semibold block"
                      />
                      <InlineEditable
                        value={siteConfig.heroCaption}
                        editMode={isEditingActive}
                        darkSurface
                        onSave={(val) => onQuickSaveConfig({ heroCaption: val })}
                        className="text-xs text-slate-200 mt-0.5 block"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-8 border-t border-slate-200">
                <div>
                  <p className="font-mono-num text-2xl font-bold text-blue-950">3 Cấp học</p>
                  <p className="text-xs text-slate-600 mt-1">Tiểu học (3–5) · THCS (6–9) · THPT (10–12)</p>
                </div>
                <div>
                  <p className="font-mono-num text-2xl font-bold text-blue-950">
                    {bootstrap.stats.teachersCount} Giáo viên
                  </p>
                  <p className="text-xs text-slate-600 mt-1">Thạc sĩ, Cử nhân tận tâm đứng lớp</p>
                </div>
                <div>
                  <p className="font-mono-num text-2xl font-bold text-blue-950">6 Ca / ngày</p>
                  <p className="text-xs text-slate-600 mt-1">Sáng · Chiều · Tối đồng bộ lịch Thể dục</p>
                </div>
                <div>
                  <p className="font-mono-num text-2xl font-bold text-red-700">
                    -{siteConfig.annualDiscountPercent}% Học phí
                  </p>
                  <p className="text-xs text-slate-600 mt-1">Ưu đãi khi đóng trước nguyên năm học</p>
                </div>
              </div>
            </div>
          </section>

          {/* Course Storefront (1-Click Editable Course Titles & Monthly Prices!) */}
          <section id="khoa-hoc" className="max-w-7xl mx-auto px-6 py-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-semibold text-blue-900">Chương trình chuẩn GDPT 2018</p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mt-1">
                  Các gói khóa học tại Trung Tâm Nhân Trí
                </h2>
              </div>
              <p className="text-sm text-slate-600 max-w-md">
                Chọn đúng lộ trình theo cấp học. Đăng ký trực tuyến để nhận ngay Thời khóa biểu cá nhân hóa qua Zalo.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <article
                  key={course.id}
                  className="flex flex-col justify-between bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 transition-colors"
                >
                  <div>
                    <div className="aspect-[16/10] bg-slate-100 overflow-hidden border-b border-slate-100">
                      <img
                        src={course.imageUrl}
                        alt={course.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="font-semibold text-blue-900">{course.grades}</span>
                        <span aria-hidden="true">·</span>
                        <span>Ưu đãi năm -{siteConfig.annualDiscountPercent}%</span>
                      </div>

                      <InlineEditable
                        as="h3"
                        value={course.title}
                        editMode={isEditingActive}
                        onSave={(val) => onQuickSaveCourse({ ...course, title: val })}
                        className="text-lg font-bold text-slate-950 block"
                      />

                      <div className="pb-4 border-b border-slate-100">
                        <div className="flex items-baseline gap-1.5">
                          <InlineEditable
                            value={String(course.monthlyPrice)}
                            inputType="number"
                            editMode={isEditingActive}
                            displayFormatter={(v) => formatVnd(Number(v) || 0)}
                            onSave={(val) =>
                              onQuickSaveCourse({
                                ...course,
                                monthlyPrice: Math.max(0, Number(val) || course.monthlyPrice),
                              })
                            }
                            className="font-mono-num text-2xl font-bold text-slate-950"
                          />
                          <span className="text-xs text-slate-500">
                            {course.billingModel === 'PER_SUBJECT' ? '/ môn / tháng' : '/ tháng'}
                          </span>
                        </div>
                        {course.boardingAddonPrice && (
                          <p className="text-xs text-slate-500 mt-1 font-mono-num">
                            Bán trú cơm nước: +{formatVnd(course.boardingAddonPrice)} · Đưa rước: +
                            {formatVnd(course.shuttleAddonPrice || 0)}
                          </p>
                        )}
                      </div>

                      <ul className="space-y-2.5 text-sm text-slate-700">
                        {course.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <Check className="w-4 h-4 text-blue-900 shrink-0 mt-0.5" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>

                      <p className="text-xs text-slate-500 pt-2">
                        Môn học: {course.subjects.join(' · ')}
                      </p>
                    </div>
                  </div>

                  <div className="px-6 pb-6">
                    <button
                      type="button"
                      onClick={() => openCourseModal(course)}
                      className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
                    >
                      Đăng ký &amp; Tính học phí
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Teaching Process & Authentic Center Gallery */}
          <section id="quy-trinh" className="bg-slate-50 border-y border-slate-200 py-16">
            <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-5 space-y-6">
                <div>
                  <p className="text-xs font-semibold text-red-700">Quy trình Dạy &amp; Học tại Nhân Trí</p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mt-1">
                    Soạn bài, trả bài và theo sát tiến bộ từng ngày
                  </h2>
                </div>
                <ol className="space-y-5">
                  {[
                    {
                      step: '01',
                      title: 'Đánh giá đầu vào & Xếp lớp đúng năng lực',
                      desc: 'Phân nhóm theo lớp trường (THCS Lý Thường Kiệt, Nguyễn Trãi, Bình Khánh, THSP...) và trình độ thực tế.',
                    },
                    {
                      step: '02',
                      title: 'Lập Thời khóa biểu cá nhân & Đồng bộ Google Calendar',
                      desc: 'Khớp lịch Sáng/Chiều/Tối tránh xung đột, tự động bố trí ca tối 17h30–19h00 học bù khi trùng lịch Thể dục.',
                    },
                    {
                      step: '03',
                      title: 'Giảng dạy bộ môn + Ca Trả bài & Soạn bài hằng ngày',
                      desc: 'Thầy cô chuyên môn đứng lớp giảng bài mới; giáo viên quản nhiệm kiểm tra bài cũ và hướng dẫn làm bài tập.',
                    },
                    {
                      step: '04',
                      title: 'Chụp bài kiểm tra phân tích AI & Báo cáo Zalo định kỳ',
                      desc: 'Tải bài kiểm tra lên Học bạ Online, AI phân tích lỗi sai và gửi báo cáo chi tiết cho phụ huynh.',
                    },
                  ].map((item) => (
                    <li key={item.step} className="flex gap-4">
                      <span className="font-mono-num text-sm font-bold text-blue-900 pt-0.5 shrink-0">
                        {item.step}.
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-950">{item.title}</h3>
                        <p className="text-sm text-slate-600 mt-1">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
                {bootstrap.gallery.slice(1, 5).map((photo) => (
                  <figure key={photo.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                      <img
                        src={photo.url}
                        alt={photo.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <figcaption className="p-4">
                      <p className="text-sm font-semibold text-slate-950">{photo.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{photo.caption}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>

          {/* Faculty Directory */}
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <p className="text-xs font-semibold text-blue-900">Tốt nghiệp Thạc sĩ, Cử nhân · Tận tâm, tận lực</p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mt-1">
                  Đội ngũ Giáo viên đứng lớp
                </h2>
              </div>
              <p className="text-sm text-slate-600">
                {bootstrap.teachers.length} thầy cô phụ trách chuyên môn và trả bài tại Cơ sở 1 &amp; Cơ sở 2.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {bootstrap.teachers.slice(0, 8).map((t) => (
                <div key={t.id} className="p-5 bg-white border border-slate-200 rounded-xl">
                  <p className="text-base font-bold text-slate-950">{t.name}</p>
                  <p className="text-xs text-blue-900 font-medium mt-0.5">{t.subjects.join(' · ')}</p>
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                    <p>{t.degree}</p>
                    <p className="font-mono-num">
                      {t.experienceYears} năm kinh nghiệm · {t.roomDefault}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Fee Estimator + 24/7 AI Consultation */}
          <section id="tu-van" className="bg-slate-950 text-white py-16">
            <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10">
              <div className="lg:col-span-6 space-y-6">
                <div>
                  <p className="text-xs font-semibold text-blue-300">Tư vấn nhanh tự động trước khi gọi Zalo</p>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                    Dự toán học phí &amp; lộ trình trong 30 giây
                  </h2>
                </div>

                <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-2">Chọn cấp học</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'CAP_1', label: 'Cấp 1 (3–5)' },
                        { id: 'CAP_2', label: 'Cấp 2 (6–9)' },
                        { id: 'CAP_3', label: 'Cấp 3 (10–12)' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setCalcLevel(opt.id as 'CAP_1' | 'CAP_2' | 'CAP_3')}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            calcLevel === opt.id
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {calcLevel === 'CAP_3' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-2">
                        Số môn đăng ký: <span className="font-mono-num text-white">{calcSubjectsCount} môn</span>
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={calcSubjectsCount}
                        onChange={(e) => setCalcSubjectsCount(Number(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  )}

                  {calcLevel !== 'CAP_3' && (
                    <div className="grid sm:grid-cols-2 gap-3 pt-1">
                      <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={calcBoarding}
                          onChange={(e) => setCalcBoarding(e.target.checked)}
                          className="rounded accent-blue-500"
                        />
                        <span>Bán trú cơm nước</span>
                      </label>
                      <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={calcShuttle}
                          onChange={(e) => setCalcShuttle(e.target.checked)}
                          className="rounded accent-blue-500"
                        />
                        <span>Đưa rước học sinh</span>
                      </label>
                    </div>
                  )}

                  <label className="flex items-center gap-2.5 text-sm text-amber-300 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={calcAnnual}
                      onChange={(e) => setCalcAnnual(e.target.checked)}
                      className="rounded accent-amber-400"
                    />
                    <span>Đóng trước nguyên năm học (Ưu đãi -{siteConfig.annualDiscountPercent}%)</span>
                  </label>

                  <div className="pt-4 border-t border-slate-800 space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-300">
                      <span>Học phí chính khóa</span>
                      <span className="font-mono-num">{formatVnd(estimatedFee.base)}</span>
                    </div>
                    {estimatedFee.boarding > 0 && (
                      <div className="flex justify-between text-slate-300">
                        <span>Bán trú cơm nước</span>
                        <span className="font-mono-num">{formatVnd(estimatedFee.boarding)}</span>
                      </div>
                    )}
                    {estimatedFee.shuttle > 0 && (
                      <div className="flex justify-between text-slate-300">
                        <span>Đưa rước tận nơi</span>
                        <span className="font-mono-num">{formatVnd(estimatedFee.shuttle)}</span>
                      </div>
                    )}
                    {estimatedFee.discount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Ưu đãi nguyên năm (-{siteConfig.annualDiscountPercent}%)</span>
                        <span className="font-mono-num">-{formatVnd(estimatedFee.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                      <span className="font-semibold text-white">Học phí thực đóng / tháng</span>
                      <span className="font-mono-num text-xl font-bold text-white">
                        {formatVnd(estimatedFee.monthlyFinal)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const c = courses.find((x) => x.level === calcLevel) || courses[0];
                        if (c) openCourseModal(c);
                      }}
                      className="flex-1 py-2.5 px-4 bg-white text-slate-950 font-semibold text-sm rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      Đăng ký giữ chỗ ngay
                    </button>
                    <a
                      href={`tel:${siteConfig.hotlineZalo.replace(/\s+/g, '')}`}
                      className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700"
                    >
                      <Phone className="w-4 h-4" />
                      <span>Zalo: {siteConfig.hotlineZalo}</span>
                    </a>
                  </div>
                </div>
              </div>

              {siteConfig.enableAiAdvisor && (
                <div className="lg:col-span-6 flex flex-col justify-between bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold">
                      <Sparkles className="w-4 h-4" />
                      <span>Trợ lý Tư vấn &amp; Giải đáp 24/7 (AI)</span>
                    </div>
                    <h3 className="text-xl font-bold">Hỏi nhanh lịch học, bán trú hoặc bài tập</h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      'Gói lớp 7 trọn gói có bán trú cơm nước bao nhiêu?',
                      'Con bị trùng tiết Thể dục sáng thứ 4 thì học bù thế nào?',
                      'Lớp 11 đăng ký Toán và Lý đóng nguyên năm có giảm không?',
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => handleAskAdvisor(q)}
                        className="text-left text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 min-h-[150px] bg-slate-950/70 border border-slate-800 rounded-lg p-4 text-sm text-slate-200 whitespace-pre-line overflow-y-auto max-h-64">
                    {aiLoading ? (
                      <p className="text-slate-400">Đang tổng hợp câu trả lời từ dữ liệu Trung Tâm Nhân Trí...</p>
                    ) : aiError ? (
                      <p className="text-red-400">{aiError}</p>
                    ) : aiAnswer ? (
                      aiAnswer
                    ) : (
                      <p className="text-slate-400">
                        Chọn câu hỏi mẫu phía trên hoặc nhập thắc mắc của Quý Phụ huynh / Học sinh bên dưới.
                      </p>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAskAdvisor();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={aiQuestion}
                      onChange={(e) => setAiQuestion(e.target.value)}
                      placeholder="Nhập câu hỏi tư vấn hoặc bài tập cần giải đáp..."
                      className="flex-1 px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={aiLoading}
                      className="px-4 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span>Gửi</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* Unified Clean Footer */}
      <footer className="bg-white border-t border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-slate-600">
          <div>
            <InlineEditable
              value={siteConfig.centerName}
              editMode={isEditingActive}
              onSave={(val) => onQuickSaveConfig({ centerName: val })}
              className="font-bold text-slate-950 block"
            />
            <p className="text-xs text-slate-500 mt-1">
              {siteConfig.campus1} · {siteConfig.campus2}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <span className="font-mono-num font-semibold text-blue-900">{siteConfig.domain}</span>
            <span>
              Zalo:{' '}
              <InlineEditable
                value={siteConfig.hotlineZalo}
                editMode={isEditingActive}
                onSave={(val) => onQuickSaveConfig({ hotlineZalo: val })}
                className="font-semibold text-slate-900"
              />
            </span>
            <span>
              Email:{' '}
              <InlineEditable
                value={siteConfig.contactEmail}
                editMode={isEditingActive}
                onSave={(val) => onQuickSaveConfig({ contactEmail: val })}
              />
            </span>
          </div>
        </div>
      </footer>

      {/* Slim Floating 1-Click Visual Inline Editor Bar (SuperAdmin & Admin Only) */}
      {canInlineEdit && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-slate-950/95 text-white border border-slate-700 rounded-xl px-3.5 py-2 shadow-xl">
          <div className="text-[11px] pr-2 border-r border-slate-700 hidden sm:block">
            <p className="font-bold text-blue-300">{roleLabel(currentUser!.role, 'vi')}</p>
            <p className="text-slate-400 font-mono-num">{currentUser!.email}</p>
          </div>
          <button
            type="button"
            onClick={onToggleEditMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              editMode
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-blue-700 hover:bg-blue-600 text-white'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>{editMode ? 'Đang sửa 1-Click (Nhấn chữ để sửa)' : 'Bật sửa trực tiếp 1-Click'}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCms('system')}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg cursor-pointer"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>CMS</span>
          </button>
        </div>
      )}

      {/* Enrollment Modal */}
      {selectedCourse && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5 my-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-blue-900">{selectedCourse.grades}</p>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5">{selectedCourse.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {enrollResult ? (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
                  <p className="font-semibold">Đăng ký thành công</p>
                  <p className="mt-1">{enrollResult.message}</p>
                  <p className="mt-2 font-mono-num font-bold">
                    Học phí dự kiến: {formatVnd(enrollResult.total)} / tháng
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCourse(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEnrollSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Họ tên học sinh *</label>
                    <input
                      required
                      type="text"
                      value={enrollForm.studentName}
                      onChange={(e) => setEnrollForm({ ...enrollForm, studentName: e.target.value })}
                      placeholder="VD: Trần Minh Khang"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Khối lớp *</label>
                    <select
                      value={enrollForm.grade}
                      onChange={(e) => setEnrollForm({ ...enrollForm, grade: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    >
                      {(selectedCourse.level === 'CAP_1'
                        ? [3, 4, 5]
                        : selectedCourse.level === 'CAP_2'
                          ? [6, 7, 8, 9]
                          : [10, 11, 12]
                      ).map((g) => (
                        <option key={g} value={g}>
                          Lớp {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Họ tên phụ huynh</label>
                    <input
                      type="text"
                      value={enrollForm.parentName}
                      onChange={(e) => setEnrollForm({ ...enrollForm, parentName: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">SĐT Zalo phụ huynh *</label>
                    <input
                      required
                      type="tel"
                      value={enrollForm.parentPhone}
                      onChange={(e) => setEnrollForm({ ...enrollForm, parentPhone: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                {selectedCourse.boardingAddonPrice && (
                  <div className="flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrollForm.hasBoarding}
                        onChange={(e) => setEnrollForm({ ...enrollForm, hasBoarding: e.target.checked })}
                      />
                      <span>Bán trú cơm nước (+{formatVnd(selectedCourse.boardingAddonPrice)})</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrollForm.hasShuttle}
                        onChange={(e) => setEnrollForm({ ...enrollForm, hasShuttle: e.target.checked })}
                      />
                      <span>Đưa rước (+{formatVnd(selectedCourse.shuttleAddonPrice || 0)})</span>
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-blue-900 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrollForm.annualPrepaid}
                    onChange={(e) => setEnrollForm({ ...enrollForm, annualPrepaid: e.target.checked })}
                  />
                  <span>Đóng trước nguyên năm học (Ưu đãi -{siteConfig.annualDiscountPercent}%)</span>
                </label>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-sm">
                  <span className="text-slate-600">Ước tính học phí / tháng:</span>
                  <span className="font-mono-num font-bold text-blue-950">{formatVnd(modalEstimatedFee)}</span>
                </div>

                {enrollError && <p className="text-xs text-red-700">{enrollError}</p>}

                <button
                  type="submit"
                  disabled={enrollSubmitting}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  {enrollSubmitting ? 'Đang lưu hồ sơ...' : 'Xác nhận đăng ký'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
