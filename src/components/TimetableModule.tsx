import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  Calendar,
  CalendarOff,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  GripVertical,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import type {
  DayOfWeek,
  Room,
  SessionPeriod,
  ShiftCode,
  SiteConfig,
  SmartImportEntityType,
  Teacher,
  TeacherGroup,
  TeacherLeave,
  TimetableSlot,
} from '../types';
import {
  apiRequest,
  buildZaloReportText,
  downloadStudentIcs,
  isTimetableManager,
  type WorkspacePayload,
} from '../lib/api';
import {
  ALL_SHIFT_KEYS,
  DAYS,
  dayLabel,
  evaluateMoveOrSwap,
  evaluateSlotConstraints,
  findTeacherLeave,
  getTimeRangeForShift,
  makeShiftKey,
  SHIFT_ROWS,
  shiftLabel,
  studentBelongsToClass,
  type MoveOrSwapEvaluation,
} from '../lib/timetableEngine';
import { ParentTimetableView } from './ParentTimetableView';
import { UniversalSmartImportModal } from './UniversalSmartImportModal';
import { TimetablePdfDispatchModal } from './TimetablePdfDispatchModal';

interface TimetableModuleProps {
  workspace: WorkspacePayload;
  siteConfig?: SiteConfig;
  onRefresh: () => Promise<void>;
}

const CLASS_OPTIONS = [
  'Tất cả lớp',
  'Lớp 4,5',
  'Lớp 6A1',
  'Lớp 6A2',
  'Lớp 7A1',
  'Lớp 7NC',
  'Lớp 8A1',
  'Lớp 9A1',
  'Lớp 10',
  'Lớp 11',
  'Lớp 12',
];

type SubTab = 'GRID' | 'ROOMS' | 'TEACHERS' | 'LEAVES' | 'PERSONAL';

interface SubstituteSuggestion {
  slot: TimetableSlot;
  substituteTeachers: {
    teacherId: string;
    teacherName: string;
    fullName: string;
    teacherGroup?: TeacherGroup;
    subjects: string[];
    matchScore: string;
    isExactSubject: boolean;
  }[];
  eveningMakeupSuggestion: {
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    timeRange: string;
    room: string;
    reason: string;
  };
}

interface PendingSwapConfirm {
  source: TimetableSlot;
  target: TimetableSlot;
  evaluation: MoveOrSwapEvaluation;
}

export const TimetableModule: React.FC<TimetableModuleProps> = ({
  workspace,
  siteConfig,
  onRefresh,
}) => {
  const canEdit = isTimetableManager(workspace.user.role);
  const isTeacher = workspace.user.role === 'TEACHER';

  const [activeTab, setActiveTab] = useState<SubTab>(canEdit ? 'GRID' : 'PERSONAL');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Filters on Master Grid
  const [classFilter, setClassFilter] = useState('Tất cả lớp');
  const [teacherFilter, setTeacherFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState<'ALL' | TeacherGroup>('ALL');

  // Smart Multi-Dimensional Import & Personalized PDF Dispatch Modals
  const [smartImportEntity, setSmartImportEntity] = useState<SmartImportEntityType | null>(null);
  const [pdfDispatchOpen, setPdfDispatchOpen] = useState(false);

  // Drag-and-drop & Undo state
  const [draggedSlotId, setDraggedSlotId] = useState<string | null>(null);
  const [hoverCellKey, setHoverCellKey] = useState<string | null>(null);
  const [hoverTargetSlotId, setHoverTargetSlotId] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<PendingSwapConfirm | null>(null);
  const [undoSnapshots, setUndoSnapshots] = useState<TimetableSlot[] | null>(null);
  const [undoLabel, setUndoLabel] = useState('');

  // Block Inspector / Create Modal
  const [editorMode, setEditorMode] = useState<'CREATE' | 'EDIT' | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState<{
    day: DayOfWeek;
    period: SessionPeriod;
    shift: ShiftCode;
    timeRange: string;
    centerClass: string;
    subject: string;
    teacherId: string;
    roomId: string;
    room: string;
    slotType: TimetableSlot['slotType'];
    status: TimetableSlot['status'];
    note: string;
  }>({
    day: 'T2',
    period: 'SANG',
    shift: 'CA_1',
    timeRange: '07:15–08:45',
    centerClass: 'Lớp 6A1',
    subject: 'Toán',
    teacherId: workspace.teachers[0]?.id || 't-man',
    roomId: workspace.rooms[0]?.id || 'room-1',
    room: workspace.rooms[0]?.name || 'Phòng 1',
    slotType: 'MAIN',
    status: 'SCHEDULED',
    note: '',
  });

  // Substitute Modal
  const [subModal, setSubModal] = useState<SubstituteSuggestion | null>(null);

  // Rooms Management State
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState({
    code: '',
    name: '',
    campus: 'Cơ sở 1 (35 Lý Thường Kiệt)',
    capacity: 18,
    active: true,
    note: '',
  });

  // Teachers & Availability Matrix State
  const [teacherGroupTab, setTeacherGroupTab] = useState<'ALL' | TeacherGroup>('ALL');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    isTeacher
      ? workspace.user.linkedTeacherId || workspace.teachers[0]?.id || ''
      : workspace.teachers[0]?.id || '',
  );
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [teacherDraft, setTeacherDraft] = useState({
    name: '',
    shortName: '',
    teacherGroup: 'SUBJECT' as TeacherGroup,
    subjectsText: 'Toán',
    degree: 'Cử nhân Sư phạm',
    experienceYears: 5,
    phone: '',
    email: '',
    roomDefault: workspace.rooms[0]?.name || 'Phòng 1',
    status: 'ACTIVE' as Teacher['status'],
  });
  const [availDraft, setAvailDraft] = useState<string[] | null>(null);

  // Emergency Leave State
  const [leaveDraft, setLeaveDraft] = useState({
    teacherId: workspace.user.linkedTeacherId || workspace.teachers[0]?.id || '',
    day: 'T5' as DayOfWeek,
    dateLabel: '2026-11-26',
    period: 'SANG' as TeacherLeave['period'],
    shift: 'CA_1' as ShiftCode,
    reason: '',
    autoApprove: false,
  });

  // Personal Schedule Tab State
  const [personalPerspective, setPersonalPerspective] = useState<'STUDENT' | 'TEACHER'>(
    isTeacher ? 'TEACHER' : 'STUDENT',
  );
  const [selectedStudentId, setSelectedStudentId] = useState(workspace.students[0]?.id || '');
  const [personalTeacherId, setPersonalTeacherId] = useState(
    workspace.user.linkedTeacherId || workspace.teachers[0]?.id || '',
  );
  const [copiedZalo, setCopiedZalo] = useState(false);

  const engineCtx = useMemo(
    () => ({
      timetable: workspace.timetable,
      teachers: workspace.teachers,
      rooms: workspace.rooms,
      students: workspace.students,
      leaves: workspace.teacherLeaves,
    }),
    [workspace.timetable, workspace.teachers, workspace.rooms, workspace.students, workspace.teacherLeaves],
  );

  const pendingLeavesCount = useMemo(
    () => workspace.teacherLeaves.filter((l) => l.status === 'PENDING').length,
    [workspace.teacherLeaves],
  );

  const teacherMap = useMemo(() => {
    const map = new Map<string, Teacher>();
    workspace.teachers.forEach((t) => map.set(t.id, t));
    return map;
  }, [workspace.teachers]);

  const filteredSlots = useMemo(() => {
    return workspace.timetable.filter((slot) => {
      if (classFilter !== 'Tất cả lớp' && slot.centerClass !== classFilter) return false;
      if (teacherFilter !== 'ALL' && slot.teacherId !== teacherFilter) return false;
      if (groupFilter !== 'ALL') {
        const t = teacherMap.get(slot.teacherId);
        if (!t || t.teacherGroup !== groupFilter) return false;
      }
      return true;
    });
  }, [workspace.timetable, classFilter, teacherFilter, groupFilter, teacherMap]);

  const draggedSlot = useMemo(
    () => (draggedSlotId ? workspace.timetable.find((s) => s.id === draggedSlotId) || null : null),
    [draggedSlotId, workspace.timetable],
  );

  // Live 5-layer constraint preview inside Block Inspector / Create Modal
  const draftConstraintResult = useMemo(() => {
    if (!editorMode || slotDraft.status === 'OFF') {
      return { valid: true, hardConflicts: [], suggestedFreeRooms: [], roomOnlyConflict: false };
    }
    return evaluateSlotConstraints(
      {
        id: editingSlotId || undefined,
        day: slotDraft.day,
        period: slotDraft.period,
        shift: slotDraft.shift,
        centerClass: slotDraft.centerClass,
        subject: slotDraft.subject,
        teacherId: slotDraft.teacherId,
        roomId: slotDraft.roomId,
        room: slotDraft.room,
        slotType: slotDraft.slotType,
        status: slotDraft.status,
      },
      {
        ...engineCtx,
        ignoreSlotIds: editingSlotId ? [editingSlotId] : [],
      },
    );
  }, [editorMode, editingSlotId, slotDraft, engineCtx]);

  const selectedTeacher = useMemo(() => {
    if (isTeacher && workspace.user.linkedTeacherId) {
      return workspace.teachers.find((t) => t.id === workspace.user.linkedTeacherId) || workspace.teachers[0];
    }
    return workspace.teachers.find((t) => t.id === selectedTeacherId) || workspace.teachers[0];
  }, [isTeacher, workspace.user.linkedTeacherId, workspace.teachers, selectedTeacherId]);

  const activeAvailSet = useMemo(() => {
    const list = availDraft ?? selectedTeacher?.availability ?? [];
    return new Set(list);
  }, [availDraft, selectedTeacher]);

  const selectedStudent = useMemo(
    () => workspace.students.find((s) => s.id === selectedStudentId) || workspace.students[0],
    [workspace.students, selectedStudentId],
  );

  const personalSlots = useMemo(() => {
    if (personalPerspective === 'TEACHER') {
      const targetTid = isTeacher ? workspace.user.linkedTeacherId || personalTeacherId : personalTeacherId;
      return workspace.timetable.filter((s) => s.teacherId === targetTid && s.status !== 'OFF');
    }
    if (!selectedStudent) return [];
    return workspace.timetable.filter(
      (s) => s.status !== 'OFF' && studentBelongsToClass(selectedStudent, s.centerClass),
    );
  }, [personalPerspective, isTeacher, workspace.user.linkedTeacherId, personalTeacherId, selectedStudent, workspace.timetable]);

  function openCreateModal(preset?: { day?: DayOfWeek; period?: SessionPeriod; shift?: ShiftCode }) {
    const day = preset?.day || 'T2';
    const period = preset?.period || 'SANG';
    const shift = preset?.shift || 'CA_1';
    const activeRoom = workspace.rooms.find((r) => r.active) || workspace.rooms[0];
    setEditorMode('CREATE');
    setEditingSlotId(null);
    setSlotDraft({
      day,
      period,
      shift,
      timeRange: getTimeRangeForShift(period, shift),
      centerClass: classFilter !== 'Tất cả lớp' ? classFilter : 'Lớp 6A1',
      subject: 'Toán',
      teacherId: workspace.teachers[0]?.id || 't-man',
      roomId: activeRoom?.id || '',
      room: activeRoom?.name || 'Phòng 1',
      slotType: 'MAIN',
      status: 'SCHEDULED',
      note: '',
    });
  }

  function openEditModal(slot: TimetableSlot) {
    if (!canEdit) return;
    const matchedRoom = workspace.rooms.find((r) => r.id === slot.roomId || r.name === slot.room);
    setEditorMode('EDIT');
    setEditingSlotId(slot.id);
    setSlotDraft({
      day: slot.day,
      period: slot.period,
      shift: slot.shift,
      timeRange: slot.timeRange || getTimeRangeForShift(slot.period, slot.shift),
      centerClass: slot.centerClass,
      subject: slot.subject,
      teacherId: slot.teacherId,
      roomId: matchedRoom?.id || slot.roomId || '',
      room: matchedRoom?.name || slot.room,
      slotType: slot.slotType,
      status: slot.status,
      note: slot.note || '',
    });
  }

  async function handleSaveSlot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      if (editorMode === 'CREATE') {
        await apiRequest('/api/v1/timetable', {
          method: 'POST',
          body: JSON.stringify(slotDraft),
        });
        setStatusMessage('Đã thêm ca học mới và kiểm duyệt đủ 5 lớp chống xung đột.');
      } else if (editorMode === 'EDIT' && editingSlotId) {
        await apiRequest(`/api/v1/timetable/${editingSlotId}`, {
          method: 'PATCH',
          body: JSON.stringify(slotDraft),
        });
        setStatusMessage('Đã cập nhật thông tin block ca học trên Thời khóa biểu động.');
      }
      setEditorMode(null);
      setEditingSlotId(null);
      await onRefresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu ca học do xung đột ràng buộc.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/timetable/${slotId}`, { method: 'DELETE' });
      setEditorMode(null);
      setEditingSlotId(null);
      await onRefresh();
      setStatusMessage('Đã xóa block ca học khỏi Thời khóa biểu.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể xóa ca học.');
    } finally {
      setBusy(false);
    }
  }

  // Drag & Drop handlers
  async function executeMoveOrSwap(payload: {
    slotId: string;
    targetDay: DayOfWeek;
    targetPeriod: SessionPeriod;
    targetShift: ShiftCode;
    swapWithSlotId?: string;
  }) {
    setBusy(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const res = await apiRequest<{
        mode: string;
        previousSnapshots: TimetableSlot[];
        autoRoom?: Room;
      }>('/api/v1/timetable/move-or-swap', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUndoSnapshots(res.previousSnapshots);
      if (res.mode === 'SWAP') {
        setUndoLabel('Vừa hoán đổi 2 chiều giữa 2 ca học.');
        setStatusMessage('Đã hoán đổi 2 chiều thành công (không trùng giáo viên, phòng, học sinh hay lịch nghỉ).');
      } else if (res.mode === 'MOVE_AUTO_ROOM' && res.autoRoom) {
        setUndoLabel(`Đã chuyển ca và tự động đổi sang ${res.autoRoom.name}.`);
        setStatusMessage(`Đã di chuyển ca học và tự động xếp vào ${res.autoRoom.name} đang trống.`);
      } else {
        setUndoLabel('Đã di chuyển ca học sang khung giờ mới.');
        setStatusMessage('Đã di chuyển ca học sang khung giờ mới an toàn.');
      }
      setSwapConfirm(null);
      await onRefresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể di chuyển hoặc hoán đổi ca học.');
    } finally {
      setBusy(false);
      setDraggedSlotId(null);
      setHoverCellKey(null);
      setHoverTargetSlotId(null);
    }
  }

  async function handleUndoMoveOrSwap() {
    if (!undoSnapshots || undoSnapshots.length === 0) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest('/api/v1/timetable/move-or-swap', {
        method: 'POST',
        body: JSON.stringify({ restoreSlots: undoSnapshots }),
      });
      setUndoSnapshots(null);
      setUndoLabel('');
      await onRefresh();
      setStatusMessage('Đã hoàn tác (Undo) thao tác kéo-thả gần nhất.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể hoàn tác.');
    } finally {
      setBusy(false);
    }
  }

  function handleDropOnCell(day: DayOfWeek, period: SessionPeriod, shift: ShiftCode) {
    if (!canEdit || !draggedSlot) return;
    setHoverCellKey(null);
    setHoverTargetSlotId(null);
    if (draggedSlot.day === day && draggedSlot.period === period && draggedSlot.shift === shift) {
      setDraggedSlotId(null);
      return;
    }
    const evalRes = evaluateMoveOrSwap(draggedSlot, { day, period, shift }, null, engineCtx);
    if (!evalRes.valid) {
      setErrorMessage(evalRes.reasons[0] || 'Ô đích vi phạm ràng buộc lịch học.');
      setDraggedSlotId(null);
      return;
    }
    executeMoveOrSwap({
      slotId: draggedSlot.id,
      targetDay: day,
      targetPeriod: period,
      targetShift: shift,
    });
  }

  function handleDropOnBlock(e: React.DragEvent, targetSlot: TimetableSlot) {
    e.stopPropagation();
    if (!canEdit || !draggedSlot || draggedSlot.id === targetSlot.id) {
      setDraggedSlotId(null);
      return;
    }
    setHoverCellKey(null);
    setHoverTargetSlotId(null);
    const evalRes = evaluateMoveOrSwap(
      draggedSlot,
      { day: targetSlot.day, period: targetSlot.period, shift: targetSlot.shift },
      targetSlot,
      engineCtx,
    );
    if (!evalRes.valid) {
      setErrorMessage(evalRes.reasons[0] || 'Không thể hoán đổi 2 chiều do xung đột ràng buộc.');
      setDraggedSlotId(null);
      return;
    }
    setSwapConfirm({ source: draggedSlot, target: targetSlot, evaluation: evalRes });
    setDraggedSlotId(null);
  }

  // Substitute Workflow
  async function handleOpenSubstitute(slot: TimetableSlot) {
    setBusy(true);
    setErrorMessage('');
    try {
      const res = await apiRequest<SubstituteSuggestion>(
        `/api/v1/timetable/${slot.id}/suggest-substitute`,
        { method: 'POST' },
      );
      setSubModal(res);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể gợi ý giáo viên dạy thay.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApplySubstitute(payload: { newTeacherId?: string; action?: string }) {
    if (!subModal) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/timetable/${subModal.slot.id}/substitute`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSubModal(null);
      await onRefresh();
      setStatusMessage('Đã phân công giáo viên dạy thay / đổi ca và đồng bộ thông báo tới lớp.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể phân công dạy thay.');
    } finally {
      setBusy(false);
    }
  }

  // Rooms CRUD
  async function handleSaveRoom(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      if (editingRoomId) {
        await apiRequest(`/api/v1/rooms/${editingRoomId}`, {
          method: 'PATCH',
          body: JSON.stringify(roomDraft),
        });
        setStatusMessage(`Đã cập nhật thông tin ${roomDraft.name}.`);
      } else {
        await apiRequest('/api/v1/rooms', {
          method: 'POST',
          body: JSON.stringify(roomDraft),
        });
        setStatusMessage(`Đã thêm phòng học mới ${roomDraft.name} (${roomDraft.code}).`);
      }
      setEditingRoomId(null);
      setRoomDraft({
        code: '',
        name: '',
        campus: 'Cơ sở 1 (35 Lý Thường Kiệt)',
        capacity: 18,
        active: true,
        note: '',
      });
      await onRefresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu phòng học.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleRoomActive(room: Room) {
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/rooms/${room.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !room.active }),
      });
      await onRefresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể đổi trạng thái phòng.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRoom(room: Room) {
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/rooms/${room.id}`, { method: 'DELETE' });
      await onRefresh();
      setStatusMessage(`Đã xóa ${room.name}.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể xóa phòng đang có lịch.');
    } finally {
      setBusy(false);
    }
  }

  // Teachers CRUD & Availability
  function startNewTeacher() {
    setEditingTeacherId(null);
    setTeacherDraft({
      name: '',
      shortName: '',
      teacherGroup: 'SUBJECT',
      subjectsText: 'Toán',
      degree: 'Cử nhân Sư phạm',
      experienceYears: 5,
      phone: '',
      email: '',
      roomDefault: workspace.rooms[0]?.name || 'Phòng 1',
      status: 'ACTIVE',
    });
    setShowTeacherForm(true);
  }

  function startEditTeacher(t: Teacher) {
    setEditingTeacherId(t.id);
    setTeacherDraft({
      name: t.name,
      shortName: t.shortName,
      teacherGroup: t.teacherGroup,
      subjectsText: t.subjects.join(', '),
      degree: t.degree,
      experienceYears: t.experienceYears,
      phone: t.phone || '',
      email: t.email || '',
      roomDefault: t.roomDefault,
      status: t.status,
    });
    setShowTeacherForm(true);
  }

  async function handleSaveTeacher(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      const payload = {
        name: teacherDraft.name,
        shortName: teacherDraft.shortName || teacherDraft.name,
        teacherGroup: teacherDraft.teacherGroup,
        subjects: teacherDraft.subjectsText
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean),
        degree: teacherDraft.degree,
        experienceYears: Number(teacherDraft.experienceYears) || 0,
        phone: teacherDraft.phone,
        email: teacherDraft.email,
        roomDefault: teacherDraft.roomDefault,
        status: teacherDraft.status,
      };
      if (editingTeacherId) {
        await apiRequest(`/api/v1/teachers/${editingTeacherId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setStatusMessage(`Đã cập nhật hồ sơ giáo viên ${payload.name}.`);
      } else {
        const res = await apiRequest<{ teacher: Teacher }>('/api/v1/teachers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSelectedTeacherId(res.teacher.id);
        setStatusMessage(`Đã thêm giáo viên ${res.teacher.name}.`);
      }
      setShowTeacherForm(false);
      setEditingTeacherId(null);
      await onRefresh();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu hồ sơ giáo viên.');
    } finally {
      setBusy(false);
    }
  }

  function toggleAvailabilityCell(key: string) {
    const next = new Set(activeAvailSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setAvailDraft(Array.from(next));
  }

  async function handleSaveAvailability() {
    if (!selectedTeacher) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/teachers/${selectedTeacher.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ availability: Array.from(activeAvailSet) }),
      });
      setAvailDraft(null);
      await onRefresh();
      setStatusMessage(`Đã lưu khung giờ có thể dạy của ${selectedTeacher.shortName}.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu lịch rảnh.');
    } finally {
      setBusy(false);
    }
  }

  // Emergency Leave handlers
  async function handleSubmitLeave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrorMessage('');
    try {
      const res = await apiRequest<{ leave: TeacherLeave; affectedCount: number }>('/api/v1/teacher-leaves', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: canEdit ? leaveDraft.teacherId : workspace.user.linkedTeacherId,
          day: leaveDraft.day,
          dateLabel: leaveDraft.dateLabel,
          period: leaveDraft.period,
          shift: leaveDraft.period === 'ALL' ? undefined : leaveDraft.shift,
          reason: leaveDraft.reason,
          autoApprove: canEdit && leaveDraft.autoApprove,
        }),
      });
      setLeaveDraft((prev) => ({ ...prev, reason: '' }));
      await onRefresh();
      setStatusMessage(
        `Đã ghi nhận báo nghỉ của ${res.leave.teacherName} (${res.affectedCount} ca trên TKB cần lưu ý).`,
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể gửi đơn xin nghỉ.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewLeave(leaveId: string, status: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/teacher-leaves/${leaveId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
      setStatusMessage(
        status === 'APPROVED'
          ? 'Đã duyệt đơn nghỉ và đánh dấu đỏ các ca cần bố trí giáo viên dạy thay trên TKB.'
          : 'Đã từ chối đơn xin nghỉ.',
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể cập nhật đơn nghỉ.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteLeave(leaveId: string) {
    setBusy(true);
    setErrorMessage('');
    try {
      await apiRequest(`/api/v1/teacher-leaves/${leaveId}`, { method: 'DELETE' });
      await onRefresh();
      setStatusMessage('Đã hủy đơn xin nghỉ.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể hủy đơn nghỉ.');
    } finally {
      setBusy(false);
    }
  }

  // Personal Calendar Export & Zalo copy
  async function handleExportIcs() {
    if (!selectedStudent) return;
    try {
      await downloadStudentIcs(selectedStudent.id, `TKB-NhanTri-${selectedStudent.code}.ics`);
      setStatusMessage(`Đã tải file Google Calendar (.ics) cho em ${selectedStudent.fullName}.`);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi xuất lịch .ics');
    }
  }

  function handleCopyPersonalZalo() {
    if (!selectedStudent) return;
    const text = buildZaloReportText(
      selectedStudent,
      workspace.scores,
      workspace.timetable,
      workspace.attendance,
    );
    navigator.clipboard?.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2500);
  }

  const visibleTabs: { id: SubTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    ...(canEdit
      ? [
          {
            id: 'GRID' as SubTab,
            label: 'Lưới Kéo-Thả TKB',
            icon: <Calendar className="w-3.5 h-3.5" />,
          },
          {
            id: 'ROOMS' as SubTab,
            label: `Phòng học (${workspace.rooms.length})`,
            icon: <Building2 className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    ...(canEdit || isTeacher
      ? [
          {
            id: 'TEACHERS' as SubTab,
            label: canEdit ? `Giáo viên & Lịch rảnh (${workspace.teachers.length})` : 'Lịch rảnh của tôi',
            icon: <Users className="w-3.5 h-3.5" />,
          },
          {
            id: 'LEAVES' as SubTab,
            label: canEdit ? 'Đơn xin nghỉ' : 'Xin nghỉ đột xuất',
            icon: <CalendarOff className="w-3.5 h-3.5" />,
            badge: pendingLeavesCount > 0 ? pendingLeavesCount : undefined,
          },
        ]
      : []),
    {
      id: 'PERSONAL' as SubTab,
      label: isTeacher ? 'Lịch dạy của tôi' : 'TKB Cá nhân & Bù TD',
      icon: <Clock className="w-3.5 h-3.5" />,
    },
  ];

  const displayedTeachers = useMemo(() => {
    if (isTeacher && workspace.user.linkedTeacherId) {
      return workspace.teachers.filter((t) => t.id === workspace.user.linkedTeacherId);
    }
    return workspace.teachers.filter((t) => teacherGroupTab === 'ALL' || t.teacherGroup === teacherGroupTab);
  }, [isTeacher, workspace.user.linkedTeacherId, workspace.teachers, teacherGroupTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Thời khóa biểu động, Phòng học &amp; Điều phối Giáo viên
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {canEdit
              ? 'Kéo-thả trực tiếp block ca học, hoán đổi 2 chiều tự kiểm tra 5 lớp chống trùng, cấu hình phòng học & duyệt nghỉ đột xuất.'
              : isTeacher
                ? 'Xem lịch dạy cá nhân, đăng ký khung giờ rảnh hàng tuần và gửi đơn xin nghỉ đột xuất tới Quản lý.'
                : 'Thời khóa biểu cá nhân hóa đồng bộ trực tiếp từ hệ thống điều phối Nhân Trí.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setSmartImportEntity('TIMETABLE')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-950 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-900" />
                <span>Nhập TKB đa chiều (Excel / Ảnh / PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => setPdfDispatchOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-700" />
                <span>Xuất &amp; Gửi PDF Cá nhân hóa</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Thêm ca học mới</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setErrorMessage('');
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-blue-900 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge && (
              <span
                className={`ml-1 font-mono-num text-[11px] font-bold ${
                  activeTab === tab.id ? 'text-amber-200' : 'text-red-700'
                }`}
              >
                ({tab.badge})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status / Error / Undo Banners */}
      {undoSnapshots && canEdit && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <ArrowLeftRight className="w-4 h-4 text-amber-800 shrink-0" />
            <span>{undoLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleUndoMoveOrSwap}
              className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-amber-800 hover:bg-amber-700 rounded-md cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Hoàn tác (Undo)</span>
            </button>
            <button
              type="button"
              onClick={() => setUndoSnapshots(null)}
              className="text-amber-800 hover:text-amber-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-900 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </span>
          <button type="button" onClick={() => setStatusMessage('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-800 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </span>
          <button type="button" onClick={() => setErrorMessage('')} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: MASTER DRAG-AND-DROP GRID (SUPER_ADMIN / ADMIN / MANAGER)      */}
      {/* ===================================================================== */}
      {activeTab === 'GRID' && canEdit && (
        <div className="space-y-4">
          {pendingLeavesCount > 0 && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-red-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                <span>
                  Có <strong className="font-mono-num">{pendingLeavesCount}</strong> đơn báo nghỉ đột xuất đang chờ duyệt. Các block bị ảnh hưởng được đánh dấu đỏ ngay trên lưới.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('LEAVES')}
                className="px-3 py-1.5 font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                Mở duyệt nghỉ &amp; Xếp dạy thay
              </button>
            </div>
          )}

          {/* Filter & Drag Legend Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Lớp:</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="h-8 px-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
              >
                {CLASS_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Nhóm GV:</span>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as 'ALL' | TeacherGroup)}
                className="h-8 px-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
              >
                <option value="ALL">Tất cả nhóm GV</option>
                <option value="SUBJECT">Giáo viên bộ môn</option>
                <option value="TUTOR_REVIEW">Giáo viên trả bài</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-slate-600">Giáo viên:</span>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="h-8 px-2.5 border border-slate-300 rounded-lg text-slate-900 bg-white"
              >
                <option value="ALL">Tất cả giáo viên</option>
                {workspace.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.shortName} · {t.teacherGroup === 'TUTOR_REVIEW' ? 'Trả bài' : t.subjects[0]}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              <span>Kéo block thả sang ô trống để dời · Thả đè lên block khác để Hoán đổi 2 chiều · Nhấn block để sửa chi tiết</span>
            </div>
          </div>

          {/* 6x6 Interactive Grid */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full min-w-[1060px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <th className="py-3 px-4 font-semibold w-44 border-r border-slate-200">Buổi / Ca học</th>
                  {DAYS.map((d) => (
                    <th key={d.code} className="py-3 px-3 font-semibold border-r border-slate-200 last:border-r-0">
                      <span className="text-slate-950">{d.label}</span>
                      <span className="ml-1.5 font-mono-num text-slate-500">{d.short}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {SHIFT_ROWS.map((row) => (
                  <tr key={`${row.period}_${row.shift}`} className="align-top">
                    <td className="py-3 px-4 bg-slate-50/70 border-r border-slate-200">
                      <p className="font-bold text-slate-900">{row.label}</p>
                      <p className="font-mono-num text-slate-500 mt-0.5">{row.time}</p>
                    </td>
                    {DAYS.map((day) => {
                      const cellKey = makeShiftKey(day.code, row.period, row.shift);
                      const cellSlots = filteredSlots.filter(
                        (s) => s.period === row.period && s.shift === row.shift && s.day === day.code,
                      );

                      // Live cell validation while dragging
                      let cellEval: MoveOrSwapEvaluation | null = null;
                      if (draggedSlot) {
                        const isSameCell =
                          draggedSlot.day === day.code &&
                          draggedSlot.period === row.period &&
                          draggedSlot.shift === row.shift;
                        if (!isSameCell) {
                          cellEval = evaluateMoveOrSwap(
                            draggedSlot,
                            { day: day.code, period: row.period, shift: row.shift },
                            null,
                            engineCtx,
                          );
                        }
                      }

                      const isHovered = hoverCellKey === cellKey;
                      const cellBg =
                        draggedSlot && cellEval
                          ? cellEval.valid
                            ? isHovered
                              ? cellEval.mode === 'MOVE_AUTO_ROOM'
                                ? 'bg-amber-100/80 ring-2 ring-inset ring-amber-400'
                                : 'bg-emerald-100/80 ring-2 ring-inset ring-emerald-500'
                              : cellEval.mode === 'MOVE_AUTO_ROOM'
                                ? 'bg-amber-50/50'
                                : 'bg-emerald-50/40'
                            : isHovered
                              ? 'bg-red-100/70 ring-2 ring-inset ring-red-400'
                              : 'bg-red-50/25'
                          : day.code === 'T3' && cellSlots.length === 0
                            ? 'bg-slate-50/40'
                            : '';

                      return (
                        <td
                          key={day.code}
                          onDragOver={(e) => {
                            if (!draggedSlot) return;
                            e.preventDefault();
                            if (hoverCellKey !== cellKey) setHoverCellKey(cellKey);
                          }}
                          onDragLeave={() => {
                            if (hoverCellKey === cellKey) setHoverCellKey(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDropOnCell(day.code, row.period, row.shift);
                          }}
                          className={`p-2 border-r border-slate-200 last:border-r-0 space-y-2 transition-colors min-h-[82px] ${cellBg}`}
                        >
                          {draggedSlot && cellEval && isHovered && (
                            <div
                              className={`text-[10px] font-semibold px-2 py-1 rounded ${
                                cellEval.valid
                                  ? cellEval.mode === 'MOVE_AUTO_ROOM'
                                    ? 'bg-amber-200/80 text-amber-950'
                                    : 'bg-emerald-200/80 text-emerald-950'
                                  : 'bg-red-200/80 text-red-950'
                              }`}
                            >
                              {cellEval.valid
                                ? cellEval.mode === 'MOVE_AUTO_ROOM' && cellEval.autoRoom
                                  ? `Thả để dời · Tự chuyển sang ${cellEval.autoRoom.name}`
                                  : 'Thả để chuyển sang ca này'
                                : cellEval.reasons[0]}
                            </div>
                          )}

                          {cellSlots.map((slot) => {
                            const matchedLeave = findTeacherLeave(
                              slot.teacherId,
                              slot.day,
                              slot.period,
                              slot.shift,
                              workspace.teacherLeaves,
                            );
                            const teacherObj = teacherMap.get(slot.teacherId);
                            const isDraggingThis = draggedSlotId === slot.id;
                            const isTargetHovered = hoverTargetSlotId === slot.id && draggedSlot && draggedSlot.id !== slot.id;

                            let swapPreview: MoveOrSwapEvaluation | null = null;
                            if (isTargetHovered && draggedSlot) {
                              swapPreview = evaluateMoveOrSwap(
                                draggedSlot,
                                { day: slot.day, period: slot.period, shift: slot.shift },
                                slot,
                                engineCtx,
                              );
                            }

                            const cardTone = matchedLeave || slot.status === 'TEACHER_ABSENT'
                              ? 'bg-red-50 border-red-300'
                              : slot.slotType === 'BU_THE_DUC'
                                ? 'bg-amber-50/70 border-amber-200'
                                : slot.status === 'SUBSTITUTED'
                                  ? 'bg-blue-50 border-blue-200'
                                  : 'bg-white border-slate-200 hover:border-blue-400';

                            return (
                              <div
                                key={slot.id}
                                draggable={canEdit}
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', slot.id);
                                  setDraggedSlotId(slot.id);
                                  setErrorMessage('');
                                }}
                                onDragEnd={() => {
                                  setDraggedSlotId(null);
                                  setHoverCellKey(null);
                                  setHoverTargetSlotId(null);
                                }}
                                onDragOver={(e) => {
                                  if (!draggedSlot || draggedSlot.id === slot.id) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (hoverTargetSlotId !== slot.id) setHoverTargetSlotId(slot.id);
                                }}
                                onDragLeave={(e) => {
                                  e.stopPropagation();
                                  if (hoverTargetSlotId === slot.id) setHoverTargetSlotId(null);
                                }}
                                onDrop={(e) => handleDropOnBlock(e, slot)}
                                onClick={() => openEditModal(slot)}
                                className={`p-2.5 rounded-lg border transition-all cursor-pointer select-none ${cardTone} ${
                                  isDraggingThis ? 'opacity-40' : ''
                                } ${
                                  isTargetHovered
                                    ? swapPreview?.valid
                                      ? 'ring-2 ring-amber-500 bg-amber-50'
                                      : 'ring-2 ring-red-500 bg-red-50'
                                    : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <GripVertical className="w-3 h-3 text-slate-400 shrink-0 cursor-grab" />
                                    <span className="font-bold text-blue-950 truncate">{slot.centerClass}</span>
                                  </div>
                                  <span className="text-[11px] font-mono-num text-slate-500 shrink-0">
                                    {slot.room}
                                  </span>
                                </div>

                                <p className="font-semibold text-slate-900 mt-0.5 leading-snug">{slot.subject}</p>
                                <div className="flex items-center justify-between gap-1 text-[11px] text-slate-600 mt-0.5">
                                  <span className="truncate">{slot.teacherName}</span>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    {teacherObj?.teacherGroup === 'TUTOR_REVIEW' ? 'Trả bài' : 'Bộ môn'}
                                  </span>
                                </div>

                                {matchedLeave && (
                                  <div className="mt-1.5 pt-1.5 border-t border-red-200 text-[11px] font-semibold text-red-800 space-y-1">
                                    <p>
                                      {matchedLeave.status === 'PENDING'
                                        ? 'GV báo nghỉ (Chờ duyệt)'
                                        : 'GV đã duyệt nghỉ'}
                                      : {matchedLeave.reason}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      {matchedLeave.status === 'PENDING' && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleReviewLeave(matchedLeave.id, 'APPROVED');
                                          }}
                                          className="text-[10px] font-bold text-white bg-red-700 hover:bg-red-800 px-2 py-0.5 rounded cursor-pointer"
                                        >
                                          Duyệt nghỉ
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenSubstitute(slot);
                                        }}
                                        className="text-[10px] font-bold text-blue-900 hover:underline cursor-pointer"
                                      >
                                        Tìm GV thay
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {!matchedLeave && slot.note && (
                                  <p className="text-[10px] text-amber-800 mt-1 leading-snug">{slot.note}</p>
                                )}

                                {isTargetHovered && swapPreview && (
                                  <p
                                    className={`mt-1.5 text-[10px] font-bold ${
                                      swapPreview.valid ? 'text-amber-900' : 'text-red-800'
                                    }`}
                                  >
                                    {swapPreview.valid
                                      ? 'Thả để Hoán đổi 2 chiều'
                                      : swapPreview.reasons[0]}
                                  </p>
                                )}
                              </div>
                            );
                          })}

                          {cellSlots.length === 0 && !draggedSlot && (
                            <button
                              type="button"
                              onClick={() => openCreateModal({ day: day.code, period: row.period, shift: row.shift })}
                              className="w-full py-3 text-[11px] text-slate-400 hover:text-blue-900 hover:bg-blue-50/50 rounded-lg border border-dashed border-transparent hover:border-blue-300 transition-colors cursor-pointer"
                            >
                              {day.code === 'T3' ? 'Nghỉ T3 · + Thêm' : '+ Thêm ca'}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DYNAMIC ROOMS CONFIGURATION (SUPER_ADMIN / ADMIN / MANAGER)    */}
      {/* ===================================================================== */}
      {activeTab === 'ROOMS' && canEdit && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveRoom}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-950">
                {editingRoomId ? 'Chỉnh sửa phòng học' : 'Thêm phòng học mới'}
              </h2>
              {editingRoomId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRoomId(null);
                    setRoomDraft({
                      code: '',
                      name: '',
                      campus: 'Cơ sở 1 (35 Lý Thường Kiệt)',
                      capacity: 18,
                      active: true,
                      note: '',
                    });
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Hủy sửa
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mã phòng *</label>
                <input
                  required
                  type="text"
                  value={roomDraft.code}
                  onChange={(e) => setRoomDraft({ ...roomDraft, code: e.target.value.toUpperCase() })}
                  placeholder="VD: P106"
                  className="w-full h-9 px-3 text-xs font-mono-num uppercase border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sức chứa (HS)</label>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={roomDraft.capacity}
                  onChange={(e) => setRoomDraft({ ...roomDraft, capacity: Number(e.target.value) || 18 })}
                  className="w-full h-9 px-3 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tên phòng học *</label>
              <input
                required
                type="text"
                value={roomDraft.name}
                onChange={(e) => setRoomDraft({ ...roomDraft, name: e.target.value })}
                placeholder="VD: Phòng 6 (Tầng 2 - Ôn thi 10)"
                className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cơ sở</label>
              <select
                value={roomDraft.campus}
                onChange={(e) => setRoomDraft({ ...roomDraft, campus: e.target.value })}
                className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="Cơ sở 1 (35 Lý Thường Kiệt)">Cơ sở 1 (35 Lý Thường Kiệt)</option>
                <option value="Cơ sở 2 (Nhân Trí 2)">Cơ sở 2 (Nhân Trí 2)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ghi chú trang thiết bị</label>
              <input
                type="text"
                value={roomDraft.note}
                onChange={(e) => setRoomDraft({ ...roomDraft, note: e.target.value })}
                placeholder="VD: Máy lạnh, bảng từ, phòng trả bài..."
                className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{editingRoomId ? 'Lưu cập nhật phòng' : 'Thêm phòng vào hệ thống'}</span>
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-950">
                Danh mục Phòng học đang cấu hình ({workspace.rooms.length})
              </h2>
              <span className="text-xs text-slate-500">
                Tự động đồng bộ vào bộ chọn phòng &amp; kiểm tra chống trùng
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Mã &amp; Tên phòng</th>
                    <th className="py-2.5 px-4 font-medium">Cơ sở</th>
                    <th className="py-2.5 px-4 font-medium text-right">Sức chứa</th>
                    <th className="py-2.5 px-4 font-medium text-right">Số ca/tuần</th>
                    <th className="py-2.5 px-4 font-medium">Trạng thái</th>
                    <th className="py-2.5 px-4 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workspace.rooms.map((room) => {
                    const usageCount = workspace.timetable.filter(
                      (s) => s.status !== 'OFF' && (s.roomId === room.id || s.room === room.name),
                    ).length;
                    return (
                      <tr key={room.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-950">
                            <span className="font-mono-num text-blue-900 mr-1.5">{room.code}</span>
                            {room.name}
                          </p>
                          {room.note && <p className="text-[11px] text-slate-500 mt-0.5">{room.note}</p>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{room.campus}</td>
                        <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-800">
                          {room.capacity} HS
                        </td>
                        <td className="py-3 px-4 text-right font-mono-num text-slate-700">{usageCount} ca</td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleRoomActive(room)}
                            className={`text-xs font-semibold hover:underline cursor-pointer ${
                              room.active ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {room.active ? 'Đang hoạt động' : 'Tạm ngưng'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoomId(room.id);
                              setRoomDraft({
                                code: room.code,
                                name: room.name,
                                campus: room.campus,
                                capacity: room.capacity,
                                active: room.active,
                                note: room.note || '',
                              });
                            }}
                            className="text-blue-900 font-semibold hover:underline cursor-pointer"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={usageCount > 0 || busy}
                            onClick={() => handleDeleteRoom(room)}
                            className="text-red-700 font-semibold hover:underline disabled:opacity-40 cursor-pointer"
                            title={usageCount > 0 ? 'Phòng đang có lịch dạy' : 'Xóa phòng'}
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: 2-GROUP TEACHERS DIRECTORY & 6x6 AVAILABILITY MATRIX           */}
      {/* ===================================================================== */}
      {activeTab === 'TEACHERS' && (canEdit || isTeacher) && (
        <div className="space-y-6">
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'ALL', label: `Tất cả (${workspace.teachers.length})` },
                  {
                    id: 'SUBJECT',
                    label: `GV Bộ môn (${workspace.teachers.filter((t) => t.teacherGroup === 'SUBJECT').length})`,
                  },
                  {
                    id: 'TUTOR_REVIEW',
                    label: `GV Trả bài (${workspace.teachers.filter((t) => t.teacherGroup === 'TUTOR_REVIEW').length})`,
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTeacherGroupTab(opt.id as 'ALL' | TeacherGroup)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                      teacherGroupTab === opt.id
                        ? 'bg-blue-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSmartImportEntity('TEACHERS')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-950 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-900" />
                  <span>Nhập GV đa chiều (Excel / Ảnh / AI)</span>
                </button>
                <button
                  type="button"
                  onClick={startNewTeacher}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm giáo viên mới</span>
                </button>
              </div>
            </div>
          )}

          {showTeacherForm && canEdit && (
            <form
              onSubmit={handleSaveTeacher}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-950">
                  {editingTeacherId ? 'Chỉnh sửa hồ sơ Giáo viên' : 'Thêm Giáo viên mới (Bộ môn / Trả bài)'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowTeacherForm(false)}
                  className="text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Họ và tên đầy đủ *</label>
                  <input
                    required
                    type="text"
                    value={teacherDraft.name}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, name: e.target.value })}
                    placeholder="VD: Thầy Phạm Minh Đức"
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tên hiển thị trên TKB</label>
                  <input
                    type="text"
                    value={teacherDraft.shortName}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, shortName: e.target.value })}
                    placeholder="VD: Thầy Đức"
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phân nhóm Giáo viên *</label>
                  <select
                    value={teacherDraft.teacherGroup}
                    onChange={(e) =>
                      setTeacherDraft({ ...teacherDraft, teacherGroup: e.target.value as TeacherGroup })
                    }
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="SUBJECT">Nhóm 2: Giáo viên bộ môn (Toán, Lý, Hóa, Anh...)</option>
                    <option value="TUTOR_REVIEW">Nhóm 1: Giáo viên trả bài &amp; soạn bài (Mọi khối)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Môn phụ trách (cách nhau dấu phẩy)</label>
                  <input
                    type="text"
                    value={teacherDraft.subjectsText}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, subjectsText: e.target.value })}
                    placeholder="Toán, Vật Lý"
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    value={teacherDraft.phone}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, phone: e.target.value })}
                    placeholder="0918..."
                    className="w-full h-9 px-3 font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Gmail đăng nhập bảo mật</label>
                  <input
                    type="email"
                    value={teacherDraft.email}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, email: e.target.value })}
                    placeholder="giaovien@gmail.com (tự nhận diện GV)"
                    className="w-full h-9 px-3 font-mono-num border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bằng cấp / Chuyên môn</label>
                  <input
                    type="text"
                    value={teacherDraft.degree}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, degree: e.target.value })}
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phòng mặc định</label>
                  <select
                    value={teacherDraft.roomDefault}
                    onChange={(e) => setTeacherDraft({ ...teacherDraft, roomDefault: e.target.value })}
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg bg-white"
                  >
                    {workspace.rooms.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTeacherForm(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  Lưu hồ sơ giáo viên
                </button>
              </div>
            </form>
          )}

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Teacher List */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 text-xs font-bold text-slate-900">
                Chọn giáo viên để cấu hình Khung giờ có thể dạy
              </div>
              <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
                {displayedTeachers.map((t) => {
                  const selected = selectedTeacher?.id === t.id;
                  const teachingCount = workspace.timetable.filter(
                    (s) => s.teacherId === t.id && s.status !== 'OFF',
                  ).length;
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTeacherId(t.id);
                        setAvailDraft(null);
                      }}
                      className={`p-4 cursor-pointer transition-colors ${
                        selected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-950 truncate">{t.name}</p>
                          <p className="text-xs text-blue-900 font-medium mt-0.5">
                            {t.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài & Soạn bài' : 'GV Bộ môn'} ·{' '}
                            {t.subjects.join(', ')}
                          </p>
                          <div className="text-[11px] text-slate-500 mt-1 space-y-0.5 font-mono-num">
                            {t.phone && <p>SĐT: {t.phone}</p>}
                            {t.email && <p>Gmail: {t.email}</p>}
                            <p>
                              Rảnh: {(t.availability || []).length}/36 ca · Đang dạy: {teachingCount} ca
                            </p>
                          </div>
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditTeacher(t);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-900 rounded cursor-pointer shrink-0"
                            title="Sửa hồ sơ giáo viên"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 6x6 Availability Matrix */}
            {selectedTeacher && (
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <p className="text-xs font-semibold text-blue-900">
                      Cấu hình lịch trống / giờ có thể đứng lớp
                    </p>
                    <h3 className="text-base font-bold text-slate-950 mt-0.5">
                      {selectedTeacher.name} ({selectedTeacher.shortName})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Nhấn từng ô để đánh dấu ca rảnh (xanh) hoặc bận công tác trường (xám). TKB động sẽ chặn xếp lịch vào ô bận.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAvailDraft([...ALL_SHIFT_KEYS])}
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAvailDraft(
                          ALL_SHIFT_KEYS.filter((k) => k.includes('_CHIEU_') || k.includes('_TOI_')),
                        )
                      }
                      className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Chỉ Chiều &amp; Tối
                    </button>
                    <button
                      type="button"
                      disabled={busy || availDraft === null}
                      onClick={handleSaveAvailability}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu lịch rảnh</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <th className="py-2 px-3 text-left font-semibold border-r border-slate-200">Ca học</th>
                        {DAYS.map((d) => (
                          <th key={d.code} className="py-2 px-2 font-semibold border-r border-slate-200 last:border-r-0">
                            {d.code}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {SHIFT_ROWS.map((row) => (
                        <tr key={`${row.period}_${row.shift}`}>
                          <td className="py-2.5 px-3 text-left bg-slate-50/70 border-r border-slate-200 font-medium text-slate-800 whitespace-nowrap">
                            {row.label}
                            <span className="block font-mono-num text-[10px] text-slate-400">{row.time}</span>
                          </td>
                          {DAYS.map((day) => {
                            const key = makeShiftKey(day.code, row.period, row.shift);
                            const isAvail = activeAvailSet.has(key);
                            const assignedSlot = workspace.timetable.find(
                              (s) =>
                                s.teacherId === selectedTeacher.id &&
                                s.day === day.code &&
                                s.period === row.period &&
                                s.shift === row.shift &&
                                s.status !== 'OFF',
                            );
                            return (
                              <td key={day.code} className="p-1.5 border-r border-slate-200 last:border-r-0">
                                <button
                                  type="button"
                                  onClick={() => toggleAvailabilityCell(key)}
                                  className={`w-full py-2 px-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                                    isAvail
                                      ? assignedSlot
                                        ? 'bg-blue-900 text-white border-blue-900'
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  {assignedSlot
                                    ? assignedSlot.centerClass
                                    : isAvail
                                      ? 'Rảnh'
                                      : 'Bận'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-500">
                  Chú thích: <strong>Xanh dương</strong> = Đang có tiết xếp trên TKB · <strong>Xanh lá</strong> = Đăng ký rảnh có thể dạy · <strong>Xám</strong> = Bận (không xếp lịch).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: EMERGENCY LEAVES & APPROVAL WORKFLOW                           */}
      {/* ===================================================================== */}
      {activeTab === 'LEAVES' && (canEdit || isTeacher) && (
        <div className="grid lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSubmitLeave}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-950">
                {canEdit ? 'Ghi nhận lịch nghỉ đột xuất của Giáo viên' : 'Gửi đơn báo nghỉ đột xuất'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đơn sẽ báo đỏ trực tiếp các ca bị ảnh hưởng trên TKB động để Quản lý duyệt và chọn GV dạy thay.
              </p>
            </div>

            {canEdit && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Giáo viên</label>
                <select
                  value={leaveDraft.teacherId}
                  onChange={(e) => setLeaveDraft({ ...leaveDraft, teacherId: e.target.value })}
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {workspace.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : t.subjects[0]})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Thứ trong tuần</label>
                <select
                  value={leaveDraft.day}
                  onChange={(e) => setLeaveDraft({ ...leaveDraft, day: e.target.value as DayOfWeek })}
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {DAYS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label} ({d.short})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày cụ thể</label>
                <input
                  type="date"
                  value={leaveDraft.dateLabel}
                  onChange={(e) => setLeaveDraft({ ...leaveDraft, dateLabel: e.target.value })}
                  className="w-full h-9 px-2.5 text-xs font-mono-num border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Buổi nghỉ</label>
                <select
                  value={leaveDraft.period}
                  onChange={(e) =>
                    setLeaveDraft({ ...leaveDraft, period: e.target.value as TeacherLeave['period'] })
                  }
                  className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">Cả ngày</option>
                  <option value="SANG">Buổi Sáng</option>
                  <option value="CHIEU">Buổi Chiều</option>
                  <option value="TOI">Buổi Tối</option>
                </select>
              </div>
              {leaveDraft.period !== 'ALL' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Ca cụ thể</label>
                  <select
                    value={leaveDraft.shift}
                    onChange={(e) => setLeaveDraft({ ...leaveDraft, shift: e.target.value as ShiftCode })}
                    className="w-full h-9 px-3 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="CA_1">Ca 1</option>
                    <option value="CA_2">Ca 2</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Lý do nghỉ *</label>
              <textarea
                required
                rows={3}
                value={leaveDraft.reason}
                onChange={(e) => setLeaveDraft({ ...leaveDraft, reason: e.target.value })}
                placeholder="VD: Bận họp chuyên môn ở trường, công việc gia đình..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            {canEdit && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={leaveDraft.autoApprove}
                  onChange={(e) => setLeaveDraft({ ...leaveDraft, autoApprove: e.target.checked })}
                />
                <span>Duyệt ngay và khóa lịch giáo viên trong ca này</span>
              </label>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {canEdit ? 'Ghi nhận lịch nghỉ' : 'Gửi đơn báo nghỉ tới Quản lý'}
            </button>
          </form>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-950">
                Danh sách đơn báo nghỉ ({workspace.teacherLeaves.length})
              </h2>
              <span className="text-xs text-slate-500">
                Tự động khóa không cho xếp lịch giáo viên vào ca đã nghỉ
              </span>
            </div>

            {workspace.teacherLeaves.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">Chưa có đơn báo nghỉ đột xuất nào.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {workspace.teacherLeaves.map((lv) => {
                  const affected = workspace.timetable.filter(
                    (sl) =>
                      sl.status !== 'OFF' &&
                      sl.teacherId === lv.teacherId &&
                      sl.day === lv.day &&
                      (lv.period === 'ALL' || (sl.period === lv.period && (!lv.shift || sl.shift === lv.shift))),
                  );
                  return (
                    <div key={lv.id} className="p-4 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-950">
                            {lv.teacherName}{' '}
                            <span className="font-normal text-slate-500">
                              · {dayLabel(lv.day)} ({lv.dateLabel}) ·{' '}
                              {lv.period === 'ALL'
                                ? 'Cả ngày'
                                : `${lv.period === 'SANG' ? 'Sáng' : lv.period === 'CHIEU' ? 'Chiều' : 'Tối'}${
                                    lv.shift ? ` ${lv.shift === 'CA_1' ? 'Ca 1' : 'Ca 2'}` : ''
                                  }`}
                            </span>
                          </p>
                          <p className="text-xs text-slate-700 mt-1">Lý do: {lv.reason}</p>
                          <p className="text-[11px] font-mono-num text-slate-400 mt-0.5">
                            Gửi lúc {lv.createdAt} bởi {lv.createdBy}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-xs font-bold ${
                              lv.status === 'PENDING'
                                ? 'text-red-700'
                                : lv.status === 'APPROVED'
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                            }`}
                          >
                            {lv.status === 'PENDING'
                              ? 'Chờ duyệt'
                              : lv.status === 'APPROVED'
                                ? 'Đã duyệt nghỉ'
                                : 'Đã từ chối'}
                          </span>

                          {canEdit && lv.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleReviewLeave(lv.id, 'APPROVED')}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md cursor-pointer"
                              >
                                Duyệt
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleReviewLeave(lv.id, 'REJECTED')}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                              >
                                Từ chối
                              </button>
                            </>
                          )}

                          {(canEdit || lv.status === 'PENDING') && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDeleteLeave(lv.id)}
                              className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </div>

                      {affected.length > 0 && (
                        <div className="p-3 bg-red-50/70 border border-red-200 rounded-lg space-y-1.5">
                          <p className="text-[11px] font-bold text-red-800">
                            Ảnh hưởng {affected.length} ca học đang xếp trên TKB:
                          </p>
                          {affected.map((sl) => (
                            <div
                              key={sl.id}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-800"
                            >
                              <span>
                                <strong>{sl.centerClass}</strong> · {sl.subject} ({sl.timeRange} · {sl.room})
                              </span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenSubstitute(sl)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-900 hover:underline cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Chọn GV dạy thay</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: PERSONAL TIMETABLE PROJECTION & PE MAKEUP                      */}
      {/* ===================================================================== */}
      {activeTab === 'PERSONAL' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                {canEdit && (
                  <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setPersonalPerspective('STUDENT')}
                      className={`px-3 py-1.5 font-semibold rounded-md cursor-pointer ${
                        personalPerspective === 'STUDENT' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      TKB theo Học sinh
                    </button>
                    <button
                      type="button"
                      onClick={() => setPersonalPerspective('TEACHER')}
                      className={`px-3 py-1.5 font-semibold rounded-md cursor-pointer ${
                        personalPerspective === 'TEACHER' ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      TKB theo Giáo viên
                    </button>
                  </div>
                )}

                {personalPerspective === 'STUDENT' && selectedStudent && (
                  <select
                    value={selectedStudent.id}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="h-9 px-3 text-xs font-semibold border border-slate-300 rounded-lg text-slate-950 bg-white"
                  >
                    {workspace.students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName} — {st.centerClass} ({st.school})
                      </option>
                    ))}
                  </select>
                )}

                {personalPerspective === 'TEACHER' && (
                  canEdit ? (
                    <select
                      value={personalTeacherId}
                      onChange={(e) => setPersonalTeacherId(e.target.value)}
                      className="h-9 px-3 text-xs font-semibold border border-slate-300 rounded-lg text-slate-950 bg-white"
                    >
                      {workspace.teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : t.subjects.join(', ')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm font-bold text-slate-950">
                      Lịch giảng dạy cá nhân: {workspace.user.name}
                    </p>
                  )
                )}
              </div>

              {personalPerspective === 'STUDENT' && selectedStudent && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportIcs}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-4 h-4" />
                    <span>Đồng bộ Google Calendar (.ics)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPersonalZalo}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    {copiedZalo ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedZalo ? 'Đã sao chép Zalo' : 'Sao chép gửi Zalo'}</span>
                  </button>
                </div>
              )}
            </div>

            <ParentTimetableView
              slots={personalSlots}
              student={personalPerspective === 'STUDENT' ? selectedStudent : undefined}
              title={
                personalPerspective === 'STUDENT' && selectedStudent
                  ? `Thời khóa biểu cá nhân — ${selectedStudent.fullName} (${selectedStudent.centerClass})`
                  : 'Lịch giảng dạy cá nhân theo tuần'
              }
              subtitle={
                personalPerspective === 'STUDENT' && selectedStudent
                  ? `${selectedStudent.school} · Phòng mặc định ${selectedStudent.room} · ${personalSlots.length} ca/tuần`
                  : `${personalSlots.length} ca giảng dạy/tuần`
              }
              siteConfig={siteConfig}
              emptyMessage="Chưa có ca học nào được phân công trong tuần này."
            />
          </div>

          {/* PE Makeup List */}
          {workspace.students.some((s) => Boolean(s.peConflictDay)) && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-950">
                Danh sách Học bù Thể dục &amp; Trả bài ca tối (17h30–19h00)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-y border-slate-200">
                    <tr>
                      <th className="py-2 px-3 font-medium">Học sinh</th>
                      <th className="py-2 px-3 font-medium">Lớp · Trường</th>
                      <th className="py-2 px-3 font-medium">Tiết Thể dục trùng</th>
                      <th className="py-2 px-3 font-medium">Ca bù Trả bài tối</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workspace.students
                      .filter((s) => Boolean(s.peConflictDay))
                      .map((s) => (
                        <tr key={s.id}>
                          <td className="py-2.5 px-3 font-semibold text-slate-950">{s.fullName}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {s.centerClass} · {s.school}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-red-700">
                            {s.peConflictDay} · {s.peConflictShift || 'Trùng giờ chính'}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-blue-900">{s.eveningMakeupSlot}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: FULL BLOCK INSPECTOR / CREATE MODAL WITH 5-LAYER CHECK       */}
      {/* ===================================================================== */}
      {editorMode && canEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveSlot}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-4 my-8"
          >
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
              <div>
                <p className="text-xs font-semibold text-blue-900">
                  {editorMode === 'CREATE' ? 'Thêm Block ca học mới' : 'Chỉnh sửa toàn bộ thông tin Block ca học'}
                </p>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5">
                  {slotDraft.centerClass} · {slotDraft.subject || 'Chưa nhập môn'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditorMode(null)}
                className="text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Thứ trong tuần</label>
                <select
                  value={slotDraft.day}
                  onChange={(e) => setSlotDraft({ ...slotDraft, day: e.target.value as DayOfWeek })}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  {DAYS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label} ({d.short})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Buổi &amp; Ca học</label>
                <select
                  value={`${slotDraft.period}_${slotDraft.shift}`}
                  onChange={(e) => {
                    const [period, shift] = e.target.value.split('_') as [SessionPeriod, ShiftCode];
                    setSlotDraft({
                      ...slotDraft,
                      period,
                      shift,
                      timeRange: getTimeRangeForShift(period, shift),
                    });
                  }}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  {SHIFT_ROWS.map((r) => (
                    <option key={`${r.period}_${r.shift}`} value={`${r.period}_${r.shift}`}>
                      {r.label} ({r.time})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Khung giờ hiển thị</label>
                <input
                  type="text"
                  value={slotDraft.timeRange}
                  onChange={(e) => setSlotDraft({ ...slotDraft, timeRange: e.target.value })}
                  className="w-full h-9 px-2.5 font-mono-num border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Lớp trung tâm</label>
                <select
                  value={slotDraft.centerClass}
                  onChange={(e) => setSlotDraft({ ...slotDraft, centerClass: e.target.value })}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  {CLASS_OPTIONS.slice(1).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Môn học / Nội dung *</label>
                <input
                  required
                  type="text"
                  value={slotDraft.subject}
                  onChange={(e) => setSlotDraft({ ...slotDraft, subject: e.target.value })}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Phòng học (từ danh mục)</label>
                <select
                  value={slotDraft.roomId || slotDraft.room}
                  onChange={(e) => {
                    const rm = workspace.rooms.find((r) => r.id === e.target.value || r.name === e.target.value);
                    setSlotDraft({
                      ...slotDraft,
                      roomId: rm?.id || '',
                      room: rm?.name || e.target.value,
                    });
                  }}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  {workspace.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}){!r.active ? ' · Tạm ngưng' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Giáo viên đứng lớp</label>
                <select
                  value={slotDraft.teacherId}
                  onChange={(e) => setSlotDraft({ ...slotDraft, teacherId: e.target.value })}
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  {workspace.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.shortName} — {t.teacherGroup === 'TUTOR_REVIEW' ? '[GV Trả bài]' : `[GV Bộ môn: ${t.subjects.join(', ')}]`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Phân loại ca</label>
                <select
                  value={slotDraft.slotType}
                  onChange={(e) =>
                    setSlotDraft({ ...slotDraft, slotType: e.target.value as TimetableSlot['slotType'] })
                  }
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="MAIN">Học chính môn</option>
                  <option value="TRA_BAI">Trả bài &amp; Soạn bài</option>
                  <option value="BU_THE_DUC">Học bù Thể dục</option>
                  <option value="PHU_DAO">Phụ đạo / Nâng cao</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Ghi chú ca học</label>
                <input
                  type="text"
                  value={slotDraft.note}
                  onChange={(e) => setSlotDraft({ ...slotDraft, note: e.target.value })}
                  placeholder="Ghi chú nội dung, lưu ý học sinh..."
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Trạng thái ca</label>
                <select
                  value={slotDraft.status}
                  onChange={(e) =>
                    setSlotDraft({ ...slotDraft, status: e.target.value as TimetableSlot['status'] })
                  }
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="SCHEDULED">Đang xếp lịch</option>
                  <option value="SUBSTITUTED">Đã bố trí dạy thay</option>
                  <option value="TEACHER_ABSENT">GV báo nghỉ</option>
                  <option value="OFF">Tạm nghỉ / Tắt</option>
                </select>
              </div>
            </div>

            {/* Live 5-Layer Conflict Result */}
            {!draftConstraintResult.valid ? (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Phát hiện xung đột (5 lớp kiểm duyệt):
                </p>
                {draftConstraintResult.hardConflicts.map((msg, i) => (
                  <p key={i}>• {msg}</p>
                ))}
                {draftConstraintResult.roomOnlyConflict && draftConstraintResult.suggestedFreeRooms.length > 0 && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">Đổi nhanh sang phòng trống:</span>
                    {draftConstraintResult.suggestedFreeRooms.map((rm) => (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => setSlotDraft({ ...slotDraft, roomId: rm.id, room: rm.name })}
                        className="px-2.5 py-1 bg-white border border-blue-300 text-blue-900 font-semibold rounded hover:bg-blue-50 cursor-pointer"
                      >
                        {rm.name} ({rm.code})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Hợp lệ cả 5 lớp: không trùng giáo viên, không trùng học sinh/lớp, phòng trống, khớp lịch rảnh &amp; không trùng ngày nghỉ.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              {editorMode === 'EDIT' && editingSlotId ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = workspace.timetable.find((s) => s.id === editingSlotId);
                      setEditorMode(null);
                      if (target) handleOpenSubstitute(target);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Tìm GV dạy thay</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDeleteSlot(editingSlotId)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa ca</span>
                  </button>
                </div>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorMode(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={busy || !draftConstraintResult.valid}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Đang lưu...' : editorMode === 'CREATE' ? 'Thêm vào TKB' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: 2-WAY SWAP CONFIRMATION MODAL                                */}
      {/* ===================================================================== */}
      {swapConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Xác nhận Hoán đổi 2 chiều (Atomic Swap)</span>
                </p>
                <h3 className="text-base font-bold text-slate-950 mt-1">
                  Đổi chéo lịch &amp; phòng học giữa 2 ca học
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-bold text-blue-950">
                  Ca A: {swapConfirm.source.centerClass} · {swapConfirm.source.subject} ({swapConfirm.source.teacherName})
                </p>
                <p className="text-slate-600">
                  Từ: <span className="font-mono-num">{dayLabel(swapConfirm.source.day)} · {shiftLabel(swapConfirm.source.period, swapConfirm.source.shift)} · {swapConfirm.source.room}</span>
                </p>
                <p className="text-emerald-800 font-semibold">
                  Sang: <span className="font-mono-num">{dayLabel(swapConfirm.target.day)} · {shiftLabel(swapConfirm.target.period, swapConfirm.target.shift)} · {swapConfirm.target.room}</span>
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-bold text-blue-950">
                  Ca B: {swapConfirm.target.centerClass} · {swapConfirm.target.subject} ({swapConfirm.target.teacherName})
                </p>
                <p className="text-slate-600">
                  Từ: <span className="font-mono-num">{dayLabel(swapConfirm.target.day)} · {shiftLabel(swapConfirm.target.period, swapConfirm.target.shift)} · {swapConfirm.target.room}</span>
                </p>
                <p className="text-emerald-800 font-semibold">
                  Sang: <span className="font-mono-num">{dayLabel(swapConfirm.source.day)} · {shiftLabel(swapConfirm.source.period, swapConfirm.source.shift)} · {swapConfirm.source.room}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
              <Check className="w-4 h-4 shrink-0" />
              Cả 2 vị trí mới đều hợp lệ: không trùng giáo viên, không trùng học sinh, khớp lịch rảnh &amp; không trùng ngày nghỉ.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  executeMoveOrSwap({
                    slotId: swapConfirm.source.id,
                    targetDay: swapConfirm.target.day,
                    targetPeriod: swapConfirm.target.period,
                    targetShift: swapConfirm.target.shift,
                    swapWithSlotId: swapConfirm.target.id,
                  })
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {busy ? 'Đang hoán đổi...' : 'Xác nhận Hoán đổi 2 chiều'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: SUBSTITUTE TEACHER PICKER (2-GROUP + AVAILABILITY AWARE)     */}
      {/* ===================================================================== */}
      {subModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-red-700">Bố trí Giáo viên dạy thay (Lọc đủ 5 lớp)</p>
                <h3 className="text-lg font-bold text-slate-950 mt-0.5">
                  {subModal.slot.centerClass} · {subModal.slot.subject} ({dayLabel(subModal.slot.day)}{' '}
                  {subModal.slot.timeRange})
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Hiện tại: <strong>{subModal.slot.teacherName}</strong> · {subModal.slot.room}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubModal(null)}
                className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-700">
                Giáo viên đang rảnh, không trùng lịch và không xin nghỉ trong ca này:
              </p>
              {subModal.substituteTeachers.length === 0 ? (
                <p className="text-xs text-slate-500 p-3 bg-slate-50 rounded-lg">
                  Không có giáo viên nào đăng ký rảnh trong ca này. Bạn có thể chuyển sang Ca Tối Trả bài bên dưới.
                </p>
              ) : (
                subModal.substituteTeachers.map((t) => (
                  <div
                    key={t.teacherId}
                    className="p-3 border border-slate-200 rounded-lg flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-950">{t.fullName}</p>
                      <p className="text-xs text-slate-600">
                        {t.teacherGroup === 'TUTOR_REVIEW' ? 'GV Trả bài' : 'GV Bộ môn'} · {t.subjects.join(', ')}
                      </p>
                      <p className="text-[11px] text-emerald-700 font-medium mt-0.5">{t.matchScore}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleApplySubstitute({ newTeacherId: t.teacherId })}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Chọn dạy thay
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Hoặc chuyển sang Ca Tối Trả bài / Học bù</p>
                <p>{subModal.eveningMakeupSuggestion.reason}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleApplySubstitute({ action: 'MOVE_TO_EVENING_MAKEUP' })}
                className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100 rounded-lg hover:bg-amber-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
                Dời sang Tối 17h30
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Dimensional Smart Ingestion Studio (Timetable / Teachers) */}
      {smartImportEntity && (
        <UniversalSmartImportModal
          open={Boolean(smartImportEntity)}
          entityType={smartImportEntity}
          workspace={workspace}
          onClose={() => setSmartImportEntity(null)}
          onSuccess={async (msg) => {
            await onRefresh();
            setStatusMessage(msg);
          }}
        />
      )}

      {/* Personalized Branded A4 Timetable PDF & Batch Dispatch Hub */}
      <TimetablePdfDispatchModal
        open={pdfDispatchOpen}
        workspace={workspace}
        siteConfig={siteConfig}
        onClose={() => setPdfDispatchOpen(false)}
        onDispatched={async () => {
          await onRefresh();
          setStatusMessage('Đã ghi nhận gửi Thời khóa biểu cá nhân hóa tới Phụ huynh / Học sinh / Giáo viên.');
        }}
      />
    </div>
  );
};
