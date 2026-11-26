const BANK_CODE_MAP: { keywords: string[]; code: string }[] = [
  { keywords: ['vietcombank', 'vcb'], code: 'VCB' },
  { keywords: ['bidv'], code: 'BIDV' },
  { keywords: ['vietinbank', 'icb'], code: 'ICB' },
  { keywords: ['agribank', 'vba'], code: 'VBA' },
  { keywords: ['mbbank', 'mb bank', 'quan doi', 'mb '], code: 'MB' },
  { keywords: ['techcombank', 'tcb'], code: 'TCB' },
  { keywords: ['acb'], code: 'ACB' },
  { keywords: ['vpbank', 'vpb'], code: 'VPB' },
  { keywords: ['sacombank', 'stb'], code: 'STB' },
  { keywords: ['tpbank', 'tpb'], code: 'TPB' },
  { keywords: ['hdbank', 'hdb'], code: 'HDB' },
  { keywords: ['vib'], code: 'VIB' },
  { keywords: ['shb'], code: 'SHB' },
  { keywords: ['ocb'], code: 'OCB' },
  { keywords: ['msb'], code: 'MSB' },
];

export function resolveVietQrBankCode(bankName: string): string {
  const normalized = (bankName || '').toLowerCase();
  for (const entry of BANK_CODE_MAP) {
    if (entry.keywords.some((kw) => normalized.includes(kw))) {
      return entry.code;
    }
  }
  return 'VCB';
}

export function stripVietnameseDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTuitionTransferMemo(studentCodeOrName: string, monthLabel: string): string {
  const cleanStudent = stripVietnameseDiacritics(studentCodeOrName).toUpperCase().slice(0, 22);
  const monthDigits = monthLabel.match(/\d{1,2}\/\d{4}/)?.[0] || stripVietnameseDiacritics(monthLabel).slice(0, 12);
  return `NHANTRI HP ${cleanStudent} ${monthDigits}`.replace(/\s+/g, ' ').trim().slice(0, 50);
}

export function buildVietQrUrl(params: {
  bankName: string;
  accountNo: string;
  accountName: string;
  amount: number;
  memo: string;
}): string {
  const bankCode = resolveVietQrBankCode(params.bankName);
  const cleanAccount = (params.accountNo || '').replace(/\s+/g, '');
  const amount = Math.max(0, Math.round(params.amount || 0));
  const addInfo = encodeURIComponent(params.memo.slice(0, 50));
  const accountName = encodeURIComponent(stripVietnameseDiacritics(params.accountName || 'TRUNG TAM NHAN TRI').toUpperCase());
  return `https://img.vietqr.io/image/${bankCode}-${cleanAccount}-compact2.png?amount=${amount}&addInfo=${addInfo}&accountName=${accountName}`;
}
