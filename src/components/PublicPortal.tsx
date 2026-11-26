import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  GraduationCap,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { CoursePackage, DayOfWeek, Language } from '../types';
import { apiRequest, formatVnd, type BootstrapPayload } from '../lib/api';

interface PublicPortalProps {
  bootstrap: BootstrapPayload;
  lang: Language;
  onToggleLang: () => void;
  onOpenAuthModal: () => void;
}

export const PublicPortal: React.FC<PublicPortalProps> = ({
  bootstrap,
  lang,
  onToggleLang,
  onOpenAuthModal,
}) => {
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

  // Quick consultation + AI advisor state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Quick tuition estimator on landing page
  const [calcLevel, setCalcLevel] = useState<'CAP_1' | 'CAP_2' | 'CAP_3'>('CAP_2');
  const [calcSubjectsCount, setCalcSubjectsCount] = useState(3);
  const [calcBoarding, setCalcBoarding] = useState(true);
  const [calcShuttle, setCalcShuttle] = useState(false);
  const [calcAnnual, setCalcAnnual] = useState(true);

  const estimatedFee = useMemo(() => {
    const course = bootstrap.courses.find((c) => c.level === calcLevel) || bootstrap.courses[1];
    const base =
      course.billingModel === 'PER_SUBJECT'
        ? course.monthlyPrice * calcSubjectsCount
        : course.monthlyPrice;
    const boarding = calcBoarding && course.boardingAddonPrice ? course.boardingAddonPrice : 0;
    const shuttle = calcShuttle && course.shuttleAddonPrice ? course.shuttleAddonPrice : 0;
    const sub = base + boarding + shuttle;
    const discount = calcAnnual ? Math.round(sub * 0.1) : 0;
    return { base, boarding, shuttle, discount, monthlyFinal: sub - discount, annualTotal: (sub - discount) * 9 };
  }, [bootstrap.courses, calcLevel, calcSubjectsCount, calcBoarding, calcShuttle, calcAnnual]);

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
    const discount = enrollForm.annualPrepaid ? Math.round(sub * 0.1) : 0;
    return sub - discount;
  }, [selectedCourse, enrollForm]);

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
        message: `Đã ghi nhận hồ sơ em ${res.student.fullName} vào hệ thống CMS Trung Tâm Nhân Trí. Ban học vụ sẽ gửi TKB cá nhân qua Zalo ngay.`,
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

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-extrabold tracking-tight text-blue-950 whitespace-nowrap shrink-0 flex items-center gap-2.5"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-900 text-white font-bold text-sm">
              NT
            </span>
            <span>Nhân Trí</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#khoa-hoc" className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0">
              {lang === 'vi' ? 'Khóa học' : 'Courses'}
            </a>
            <a href="#quy-trinh" className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0">
              {lang === 'vi' ? 'Quy trình' : 'Method'}
            </a>
            <a href="#doi-ngu" className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0">
              {lang === 'vi' ? 'Đội ngũ' : 'Faculty'}
            </a>
            <a href="#thu-vien-de" className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0">
              {lang === 'vi' ? 'Thư viện đề' : 'Exam Bank'}
            </a>
            <a href="#tu-van" className="hover:text-blue-900 transition-colors whitespace-nowrap shrink-0">
              {lang === 'vi' ? 'Tư vấn nhanh' : 'Advisor'}
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {lang === 'vi' ? 'Vào cổng CMS' : 'Open CMS Portal'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split — items-stretch for visual balance */}
      <section id="top" className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                  <span>TP. Long Xuyên, An Giang</span>
                  <span aria-hidden="true">·</span>
                  <span>Cơ sở 1 &amp; Nhân Trí 2</span>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={onToggleLang}
                    className="text-blue-900 font-semibold hover:underline cursor-pointer"
                  >
                    {lang === 'vi' ? 'English' : 'Tiếng Việt'}
                  </button>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-950 leading-[1.15]">
                  {lang === 'vi' ? (
                    <>
                      Trung Tâm Dạy Thêm <span className="text-red-700">Nhân Trí</span> — Trao tri thức, Gửi yêu thương
                    </>
                  ) : (
                    <>
                      <span className="text-red-700">Nhân Trí</span> Tutoring Center — Knowledge with Dedication
                    </>
                  )}
                </h1>

                <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                  {lang === 'vi'
                    ? 'Hệ thống giáo dục chuẩn mực từ Lớp 3 đến Lớp 12: Dạy kèm Cấp 1, Trọn gói Cấp 2 (có trả bài, bán trú cơm nước, đưa rước) và Chuyên sâu từng môn Cấp 3. Tích hợp Học bạ Online, Thời khóa biểu động chống xung đột và báo cáo Zalo phụ huynh theo thời gian thực.'
                    : 'Comprehensive Grades 3–12 tutoring: Primary coaching, Middle School all-in-one with daily review, boarding meals & shuttle, and High School per-subject exam prep. Powered by dynamic conflict-free timetables, AI test grading, and real-time parent Zalo reports.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href="#khoa-hoc"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{lang === 'vi' ? 'Xem khóa học & học phí' : 'Explore Courses'}</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>{lang === 'vi' ? 'Tra cứu Học bạ & TKB' : 'Student Report & Schedule'}</span>
                </button>
              </div>

              <div className="pt-2 text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Soạn bài &amp; Trả bài mỗi buổi</span>
                <span aria-hidden="true">·</span>
                <span>Giảm 10% khi đóng nguyên năm</span>
                <span aria-hidden="true">·</span>
                <span>Học bù tối tự động khi trùng Thể dục</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[320px] rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
                <img
                  src="/assets/aistudio/IMG_9559_62d21d91.JPG"
                  alt="Thầy cô và học sinh tại Trung Tâm Dạy Thêm Học Thêm Nhân Trí 2"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-5 text-white">
                  <p className="text-sm font-semibold">Trung Tâm Dạy Thêm Học Thêm Nhân Trí 2</p>
                  <p className="text-xs text-slate-200 mt-0.5">
                    Thầy cô và các em học sinh các khối lớp trong không gian học tập ấm áp tại Long Xuyên.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column quantitative proof strip directly below hero split */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10 pt-8 border-t border-slate-200">
            <div>
              <p className="font-mono-num text-2xl font-bold text-blue-950">3 Cấp học</p>
              <p className="text-xs text-slate-600 mt-1">Tiểu học (3–5) · THCS (6–9) · THPT (10–12)</p>
            </div>
            <div>
              <p className="font-mono-num text-2xl font-bold text-blue-950">{bootstrap.stats.teachersCount} Giáo viên</p>
              <p className="text-xs text-slate-600 mt-1">Tốt nghiệp Thạc sĩ, Cử nhân giàu kinh nghiệm</p>
            </div>
            <div>
              <p className="font-mono-num text-2xl font-bold text-blue-950">6 Ca / ngày</p>
              <p className="text-xs text-slate-600 mt-1">Sáng · Chiều · Tối đồng bộ lịch trường &amp; Thể dục</p>
            </div>
            <div>
              <p className="font-mono-num text-2xl font-bold text-red-700">-10% Học phí</p>
              <p className="text-xs text-slate-600 mt-1">Ưu đãi khi phụ huynh đóng trọn năm học</p>
            </div>
          </div>
        </div>
      </section>

      {/* Course Storefront */}
      <section id="khoa-hoc" className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-semibold text-blue-900">Chương trình đào tạo chuẩn GDPT 2018</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mt-1">
              {lang === 'vi' ? 'Các gói khóa học tại Trung Tâm Nhân Trí' : 'Course Packages at Nhân Trí Center'}
            </h2>
          </div>
          <p className="text-sm text-slate-600 max-w-md">
            Chọn đúng lộ trình theo cấp học. Phụ huynh có thể đăng ký trực tuyến và nhận ngay Thời khóa biểu cá nhân hóa.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {bootstrap.courses.map((course) => (
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
                    <span>Ưu đãi năm -{course.annualDiscountPercent}%</span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-950">
                    {lang === 'vi' ? course.title : course.titleEn}
                  </h3>

                  <div className="pb-4 border-b border-slate-100">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono-num text-2xl font-bold text-slate-950">
                        {formatVnd(course.monthlyPrice)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {course.billingModel === 'PER_SUBJECT' ? '/ môn / tháng' : '/ tháng'}
                      </span>
                    </div>
                    {course.boardingAddonPrice && (
                      <p className="text-xs text-slate-500 mt-1 font-mono-num">
                        Bán trú cơm nước: +{formatVnd(course.boardingAddonPrice)} · Đưa rước: +{formatVnd(course.shuttleAddonPrice || 0)}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2.5 text-sm text-slate-700">
                    {(lang === 'vi' ? course.highlights : course.highlightsEn).map((h, i) => (
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
                  {lang === 'vi' ? 'Đăng ký & Tính học phí' : 'Enroll & Estimate Fee'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Teaching Process & Authentic Center Gallery */}
      <section id="quy-trinh" className="bg-slate-50 border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-6">
              <div>
                <p className="text-xs font-semibold text-red-700">Quy trình Dạy &amp; Học tại Nhân Trí</p>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mt-1">
                  Soạn bài, trả bài và theo sát tiến bộ từng ngày
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Mọi học sinh đều có thời khóa biểu cá nhân đồng bộ với lịch trường. Nếu trùng tiết Thể dục, hệ thống tự động xếp ca tối 17h30–19h00 để trả bài và soạn bài không mất buổi.
                </p>
              </div>

              <ol className="space-y-5 pt-2">
                {[
                  {
                    step: '01',
                    title: 'Đánh giá đầu vào & Xếp lớp đúng năng lực',
                    desc: 'Phân nhóm theo lớp trường (THCS Lý Thường Kiệt, Nguyễn Trãi, Bình Khánh, THSP...) và trình độ thực tế.',
                  },
                  {
                    step: '02',
                    title: 'Lập Thời khóa biểu cá nhân & Đồng bộ Google Calendar',
                    desc: 'Khớp lịch Sáng/Chiều/Tối tránh xung đột, tự động bố trí ca tối học bù khi trùng lịch Thể dục.',
                  },
                  {
                    step: '03',
                    title: 'Giảng dạy bộ môn + Ca Trả bài & Soạn bài hằng ngày',
                    desc: 'Thầy cô chuyên môn đứng lớp giảng bài mới; giáo viên quản nhiệm kiểm tra bài cũ và hướng dẫn làm bài tập.',
                  },
                  {
                    step: '04',
                    title: 'Chụp bài kiểm tra phân tích AI & Báo cáo Zalo định kỳ',
                    desc: 'Học sinh chụp bài kiểm tra tải lên Học bạ Online, AI phân tích lỗi sai và gửi báo cáo chi tiết cho phụ huynh.',
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
                <figure
                  key={photo.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                >
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
        </div>
      </section>

      {/* Faculty & Exam Bank Preview */}
      <section id="doi-ngu" className="max-w-7xl mx-auto px-6 py-16 space-y-16">
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-semibold text-blue-900">Tốt nghiệp Thạc sĩ, Cử nhân · Tận tâm, tận lực, tận tình</p>
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
                  <p className="font-mono-num">{t.experienceYears} năm kinh nghiệm · {t.roomDefault}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* National Exam Library Preview */}
        <div id="thu-vien-de" className="pt-8 border-t border-slate-200">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-xs font-semibold text-blue-900">Thực hành trực tuyến trên máy tính &amp; điện thoại</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 mt-1">
                Thư viện Đề thi Chuẩn Quốc gia (GDPT 2018)
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-900 hover:text-blue-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Làm bài trắc nghiệm ngay trong CMS</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {bootstrap.examsSummary.map((ex) => (
              <div
                key={ex.id}
                className="p-5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">
                    Khối {ex.grade} · {ex.subject} · {ex.durationMinutes} phút · {ex.questionCount} câu hỏi
                  </p>
                  <h3 className="text-sm font-bold text-slate-950">{ex.title}</h3>
                  <p className="text-xs text-slate-600">{ex.curriculumStandard}</p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="px-3.5 py-2 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Vào thi thử
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Online Consultation Calculator + 24/7 AI Advisor before calling Zalo */}
      <section id="tu-van" className="bg-slate-950 text-white py-16">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-10">
          {/* Left: Fast Fee Estimator */}
          <div className="lg:col-span-6 space-y-6">
            <div>
              <p className="text-xs font-semibold text-blue-300">Tư vấn nhanh tự động trước khi gọi Zalo</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                Dự toán học phí &amp; lộ trình học trong 30 giây
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
                      className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
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
                <span>Đóng trước nguyên năm học (Ưu đãi giảm 10%)</span>
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
                    <span>Ưu đãi đóng nguyên năm (-10%)</span>
                    <span className="font-mono-num">-{formatVnd(estimatedFee.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                  <span className="font-semibold text-white">Học phí thực đóng / tháng</span>
                  <span className="font-mono-num text-xl font-bold text-white">
                    {formatVnd(estimatedFee.monthlyFinal)}
                  </span>
                </div>
                {calcAnnual && (
                  <p className="text-xs text-slate-400 font-mono-num text-right">
                    Trọn năm (9 tháng): {formatVnd(estimatedFee.annualTotal)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const c = bootstrap.courses.find((x) => x.level === calcLevel) || bootstrap.courses[1];
                    openCourseModal(c);
                  }}
                  className="flex-1 py-2.5 px-4 bg-white text-slate-950 font-semibold text-sm rounded-lg hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Đăng ký giữ chỗ ngay
                </button>
                <a
                  href={`tel:${bootstrap.center.hotlineZalo.replace(/\s+/g, '')}`}
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  <Phone className="w-4 h-4" />
                  <span>Zalo: {bootstrap.center.hotlineZalo}</span>
                </a>
              </div>
            </div>
          </div>

          {/* Right: Live 24/7 AI Academic Advisor */}
          <div className="lg:col-span-6 flex flex-col justify-between bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold">
                <Sparkles className="w-4 h-4" />
                <span>Trợ lý Tư vấn &amp; Giải đáp 24/7 (AI)</span>
              </div>
              <h3 className="text-xl font-bold">Hỏi nhanh lịch học, bán trú hoặc bài tập</h3>
              <p className="text-xs text-slate-400">
                Giải đáp tức thì thông tin khóa học, chính sách học bù Thể dục, ưu đãi học phí và hỗ trợ bài tập cho học sinh.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                'Gói lớp 7 trọn gói có bán trú cơm nước bao nhiêu?',
                'Con bị trùng tiết Thể dục sáng thứ 4 thì học bù thế nào?',
                'Lớp 11 đăng ký Toán và Lý có giảm học phí khi đóng nguyên năm không?',
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleAskAdvisor(q)}
                  className="text-left text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
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
                  Hãy chọn một câu hỏi gợi ý bên trên hoặc nhập thắc mắc của Quý Phụ huynh / Học sinh vào ô bên dưới.
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
                className="px-4 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>Gửi</span>
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Clean Footer */}
      <footer className="bg-white border-t border-slate-200 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-sm text-slate-600">
          <div>
            <p className="font-bold text-slate-950">{bootstrap.center.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              {bootstrap.center.campuses.join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <span>Zalo &amp; Hotline: {bootstrap.center.hotlineZalo}</span>
            <span>Email: {bootstrap.center.email}</span>
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="font-semibold text-blue-900 hover:underline cursor-pointer"
            >
              Đăng nhập Hệ thống CMS
            </button>
          </div>
        </div>
      </footer>

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
                aria-label="Đóng"
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
                    onClick={() => {
                      setSelectedCourse(null);
                      onOpenAuthModal();
                    }}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 cursor-pointer"
                  >
                    Vào CMS xem hồ sơ
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCourse(null)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
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
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Khối lớp *</label>
                    <select
                      value={enrollForm.grade}
                      onChange={(e) => setEnrollForm({ ...enrollForm, grade: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
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
                      placeholder="VD: Chị Trần Mỹ Linh"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Số điện thoại Zalo *</label>
                    <input
                      required
                      type="tel"
                      value={enrollForm.parentPhone}
                      onChange={(e) => setEnrollForm({ ...enrollForm, parentPhone: e.target.value })}
                      placeholder="0918 xxx xxx"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Trường đang theo học</label>
                    <input
                      type="text"
                      value={enrollForm.school}
                      onChange={(e) => setEnrollForm({ ...enrollForm, school: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Ngày trùng Thể dục (nếu có)
                    </label>
                    <select
                      value={enrollForm.peConflictDay}
                      onChange={(e) => setEnrollForm({ ...enrollForm, peConflictDay: e.target.value as '' | DayOfWeek })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-900"
                    >
                      <option value="">Không trùng</option>
                      <option value="T2">Thứ 2 (xếp bù Tối T2)</option>
                      <option value="T4">Thứ 4 (xếp bù Tối T4)</option>
                      <option value="T5">Thứ 5 (xếp bù Tối T5)</option>
                      <option value="T6">Thứ 6 (xếp bù Tối T6)</option>
                    </select>
                  </div>
                </div>

                {selectedCourse.billingModel === 'PER_SUBJECT' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">Chọn môn đăng ký</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedCourse.subjects.map((subj) => {
                        const checked = enrollForm.selectedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? enrollForm.selectedSubjects.filter((s) => s !== subj)
                                : [...enrollForm.selectedSubjects, subj];
                              if (next.length > 0) setEnrollForm({ ...enrollForm, selectedSubjects: next });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                              checked
                                ? 'bg-blue-900 text-white border-blue-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {subj}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-1 text-sm">
                  {selectedCourse.boardingAddonPrice && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrollForm.hasBoarding}
                        onChange={(e) => setEnrollForm({ ...enrollForm, hasBoarding: e.target.checked })}
                      />
                      <span>Đăng ký Bán trú cơm nước (+{formatVnd(selectedCourse.boardingAddonPrice)}/tháng)</span>
                    </label>
                  )}
                  {selectedCourse.shuttleAddonPrice && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrollForm.hasShuttle}
                        onChange={(e) => setEnrollForm({ ...enrollForm, hasShuttle: e.target.checked })}
                      />
                      <span>Đăng ký Đưa rước học sinh (+{formatVnd(selectedCourse.shuttleAddonPrice)}/tháng)</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-blue-900">
                    <input
                      type="checkbox"
                      checked={enrollForm.annualPrepaid}
                      onChange={(e) => setEnrollForm({ ...enrollForm, annualPrepaid: e.target.checked })}
                    />
                    <span>Đóng trước nguyên năm học (Ưu đãi giảm 10%)</span>
                  </label>
                </div>

                {enrollError && <p className="text-xs text-red-600">{enrollError}</p>}

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500">Tổng học phí dự kiến</p>
                    <p className="font-mono-num text-lg font-bold text-slate-950">
                      {formatVnd(modalEstimatedFee)} / tháng
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={enrollSubmitting}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                  >
                    {enrollSubmitting ? 'Đang gửi...' : 'Xác nhận đăng ký'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
