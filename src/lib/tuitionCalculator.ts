import type { BillingCycle, FamilyProfile, Student } from '../types.ts';
import { normalizePhoneVN } from './identityPolicy.ts';

export const MAX_COMBINED_DISCOUNT_PERCENT = 40;
export const DEFAULT_ANNUAL_DISCOUNT_PERCENT = 10;
export const ANNUAL_BILLING_MONTHS = 12;

export interface TuitionCalculationInput {
  baseMonthly: number;
  boardingMonthly: number;
  shuttleMonthly: number;
  siblingDiscountPercent: number;
  annualDiscountPercent: number;
  billingCycle: BillingCycle;
}

export interface TuitionCalculationResult {
  billingCycle: BillingCycle;
  monthsCount: number;
  baseAmount: number;
  boardingAmount: number;
  shuttleAmount: number;
  siblingDiscountPercent: number;
  annualDiscountPercent: number;
  effectiveDiscountPercent: number;
  siblingDiscountAmount: number;
  annualDiscountAmount: number;
  discountAmount: number;
  totalAmount: number;
  monthlyEquivalent: number;
}

/**
 * Confirmed formula:
 * - Stacked percentage discount (sibling % + 12-month annual %), capped at 40%.
 * - Discount applies STRICTLY to baseAmount (main tuition).
 * - Boarding and shuttle add-ons are NOT discounted.
 * - Annual cycle covers exactly 12 months.
 */
export function calculateTuitionBreakdown(input: TuitionCalculationInput): TuitionCalculationResult {
  const monthsCount = input.billingCycle === 'ANNUAL_12M' ? ANNUAL_BILLING_MONTHS : 1;
  const baseMonthly = Math.max(0, Math.round(Number(input.baseMonthly) || 0));
  const boardingMonthly = Math.max(0, Math.round(Number(input.boardingMonthly) || 0));
  const shuttleMonthly = Math.max(0, Math.round(Number(input.shuttleMonthly) || 0));

  const siblingPct = Math.max(0, Math.min(30, Number(input.siblingDiscountPercent) || 0));
  const annualPct =
    input.billingCycle === 'ANNUAL_12M'
      ? Math.max(0, Math.min(30, Number(input.annualDiscountPercent) || DEFAULT_ANNUAL_DISCOUNT_PERCENT))
      : 0;

  const effectiveDiscountPercent = Math.min(siblingPct + annualPct, MAX_COMBINED_DISCOUNT_PERCENT);

  const baseAmount = baseMonthly * monthsCount;
  const boardingAmount = boardingMonthly * monthsCount;
  const shuttleAmount = shuttleMonthly * monthsCount;

  const totalDiscount = Math.round((baseAmount * effectiveDiscountPercent) / 100);
  const rawSumPct = siblingPct + annualPct;
  const siblingDiscountAmount =
    rawSumPct > 0 ? Math.round((totalDiscount * siblingPct) / rawSumPct) : 0;
  const annualDiscountAmount = Math.max(0, totalDiscount - siblingDiscountAmount);

  const totalAmount = Math.max(0, baseAmount - totalDiscount + boardingAmount + shuttleAmount);

  return {
    billingCycle: input.billingCycle,
    monthsCount,
    baseAmount,
    boardingAmount,
    shuttleAmount,
    siblingDiscountPercent: siblingPct,
    annualDiscountPercent: annualPct,
    effectiveDiscountPercent,
    siblingDiscountAmount,
    annualDiscountAmount,
    discountAmount: totalDiscount,
    totalAmount,
    monthlyEquivalent: Math.round(totalAmount / monthsCount),
  };
}

export function findFamilyForStudent(
  student: Pick<Student, 'familyId' | 'parentPhone' | 'parentEmails'>,
  families: FamilyProfile[],
): FamilyProfile | undefined {
  if (student.familyId) {
    const byId = families.find((f) => f.id === student.familyId);
    if (byId) return byId;
  }
  const normPhone = normalizePhoneVN(student.parentPhone);
  if (normPhone) {
    const byPhone = families.find((f) => normalizePhoneVN(f.parentPhone) === normPhone);
    if (byPhone) return byPhone;
  }
  const emails = (student.parentEmails || []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length > 0) {
    return families.find((f) =>
      (f.parentEmails || []).some((fe) => emails.includes(fe.trim().toLowerCase())),
    );
  }
  return undefined;
}

export function getStudentsInFamily(family: FamilyProfile, students: Student[]): Student[] {
  const normPhone = normalizePhoneVN(family.parentPhone);
  const famEmails = new Set((family.parentEmails || []).map((e) => e.trim().toLowerCase()));
  return students.filter((s) => {
    if (s.familyId && s.familyId === family.id) return true;
    if (normPhone && normalizePhoneVN(s.parentPhone) === normPhone) return true;
    return (s.parentEmails || []).some((e) => famEmails.has(e.trim().toLowerCase()));
  });
}
