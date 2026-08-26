// Minimal inline SVG icon set so the sidebar doesn't need an icon library dependency.
// Each icon is 16x16, inherits currentColor, and is purely decorative (aria-hidden).

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconDashboard = (p) => (
  <svg {...base} {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const IconAdmin = (p) => (
  <svg {...base} {...p}><path d="M12 2l7 3v6c0 5-3.4 8.4-7 11-3.6-2.6-7-6-7-11V5l7-3z" /></svg>
);
export const IconInventory = (p) => (
  <svg {...base} {...p}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
);
export const IconManufacturing = (p) => (
  <svg {...base} {...p}><path d="M3 20h18" /><path d="M5 20V11l4 3v-3l4 3v-3l4 3v6" /><path d="M9 8V5l2 2 2-3 2 3 2-2v3" /></svg>
);
export const IconRental = (p) => (
  <svg {...base} {...p}><circle cx="8" cy="15" r="2.2" /><path d="M9.6 13.4L18 5" /><path d="M15 8l2 2" /><path d="M17.5 5.5l2 2" /></svg>
);
export const IconBCM = (p) => (
  <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>
);
export const IconServices = (p) => (
  <svg {...base} {...p}><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L14.7 12l-3-3 3.3-3.3z" /></svg>
);
export const IconSchool = (p) => (
  <svg {...base} {...p}><path d="M12 4L2 9l10 5 10-5-10-5z" /><path d="M6 11.5v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /><path d="M22 9v6" /></svg>
);
export const IconCRM = (p) => (
  <svg {...base} {...p}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16.5 4.3a3.2 3.2 0 010 6.2" /><path d="M21.5 20c0-2.9-1.9-5.1-4.7-5.8" /></svg>
);
export const IconSales = (p) => (
  <svg {...base} {...p}><path d="M3 3h2l2.4 12.2a2 2 0 002 1.8h8.2a2 2 0 002-1.6L21 8H6" /><circle cx="9" cy="21" r="1.4" /><circle cx="18" cy="21" r="1.4" /></svg>
);
export const IconFinance = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5c0-1.4 1.1-2.2 2.5-2.2s2.5.9 2.5 2.1c0 3-5 1.6-5 4.4 0 1.3 1.1 2.2 2.5 2.2s2.5-.8 2.5-2.1" /></svg>
);
export const IconProcurement = (p) => (
  <svg {...base} {...p}><path d="M6 2l1.5 3h9L18 2" /><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></svg>
);
export const IconComms = (p) => (
  <svg {...base} {...p}><path d="M21 12a8 8 0 10-3.6 6.7L21 20l-1.2-3.4A7.96 7.96 0 0021 12z" /></svg>
);
export const IconHR = (p) => (
  <svg {...base} {...p}><circle cx="8" cy="8" r="3.2" /><path d="M2 20c0-3.3 2.7-5.8 6-5.8s6 2.5 6 5.8" /><path d="M16 4.5a3.4 3.4 0 010 6.6M20 20c0-2.7-1.7-4.9-4-5.6" /></svg>
);
export const IconAssets = (p) => (
  <svg {...base} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
);
export const IconWorkflow = (p) => (
  <svg {...base} {...p}><circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="6" r="2.6" /><circle cx="12" cy="18" r="2.6" /><path d="M8.2 7.4L11 15.5M15.8 7.4L13 15.5" /></svg>
);
export const IconTasks = (p) => (
  <svg {...base} {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><path d="M6.5 7.5l1 1 2-2" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M6.5 16.5l1 1 2-2" /><path d="M14 7.5h6M14 16.5h6" /></svg>
);
export const IconReports = (p) => (
  <svg {...base} {...p}><path d="M4 20V10M12 20V4M20 20v-7" /><path d="M2.5 20h19" /></svg>
);
export const IconSettings = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.04 1.56V19a2 2 0 01-4 0v-.09A1.7 1.7 0 008 17.35a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.65 13 1.7 1.7 0 003.09 12H3a2 2 0 010-4h.09A1.7 1.7 0 004.6 6.6a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 008 2.35 1.7 1.7 0 009.09 1V1a2 2 0 014 0v.09a1.7 1.7 0 001.09 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V6.6a1.7 1.7 0 001.56 1.09H21a2 2 0 010 4h-.09a1.7 1.7 0 00-1.51 1.31z" /></svg>
);

export const IconBell = (p) => (
  <svg {...base} {...p}><path d="M6 10a6 6 0 1112 0c0 3.2 1 5 2 6.5H4c1-1.5 2-3.3 2-6.5z" /><path d="M9.5 19a2.6 2.6 0 005 0" /></svg>
);

export const IconMail = (p) => (
  <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></svg>
);
export const IconLock = (p) => (
  <svg {...base} {...p}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></svg>
);
export const IconEye = (p) => (
  <svg {...base} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconEyeOff = (p) => (
  <svg {...base} {...p}><path d="M3 3l18 18" /><path d="M10.6 5.2A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.4 4.4M6.6 6.6A17.9 17.9 0 002 12s3.5 7 10 7a10.4 10.4 0 004.4-.95" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></svg>
);
export const IconUser = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c0-4 3.4-6.8 7.5-6.8s7.5 2.8 7.5 6.8" /></svg>
);
export const IconBuilding = (p) => (
  <svg {...base} {...p}><rect x="4" y="3" width="12" height="18" rx="1.5" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" /><path d="M16 9h4v12h-4" /></svg>
);
export const IconKey = (p) => (
  <svg {...base} {...p}><circle cx="8" cy="15" r="3.5" /><path d="M10.6 12.4L18 5l2 2-1.6 1.6M15.4 8.6L17 10.2" /></svg>
);

export const IconChevron = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconSearch = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
  </svg>
);

export const IconMenu = (p) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
export const IconSidebarToggle = (p) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d="M14 9l-2 3 2 3" />
  </svg>
);

export const IconX = (p) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const IconPlus = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconHelp = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9.3a2.8 2.8 0 015.4.9c0 1.9-2.6 2-2.6 3.8" />
    <circle cx="12" cy="17.2" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCalendar = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

export const IconAlertTriangle = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M10.3 3.9L2.5 18a1.8 1.8 0 001.6 2.7h15.8a1.8 1.8 0 001.6-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z" />
    <path d="M12 9.5v4.2M12 17v.1" />
  </svg>
);

export const IconClock = (p) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
  </svg>
);

export const IconSparkle = (p) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M12 3l1.8 4.9L19 9.5l-5.2 1.6L12 16l-1.8-4.9L5 9.5l5.2-1.6L12 3z" />
    <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7L19 14z" />
  </svg>
);

// ---- School Management module launcher icons (24x24, matches `base`) ----

export const IconModStudents = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
  </svg>
);

export const IconModAttendance = (p) => (
  <svg {...base} {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 3v3M15 3v3M8 12l2.5 2.5L16 9" />
  </svg>
);

export const IconModExams = (p) => (
  <svg {...base} {...p}>
    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v4h4" />
    <path d="M9 14.5l2 2 4-4.5" />
  </svg>
);

export const IconModFees = (p) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    <path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </svg>
);

export const IconModTimetable = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="4.5" width="16" height="15.5" rx="2" />
    <path d="M4 9.5h16M9 3v3M15 3v3" />
    <path d="M8 13h2M13 13h3M8 16.5h2M13 16.5h3" />
  </svg>
);

export const IconModLibrary = (p) => (
  <svg {...base} {...p}>
    <path d="M12 6.5c-1.6-1.2-4-1.7-6.5-1.5v13c2.5-.2 4.9.3 6.5 1.5" />
    <path d="M12 6.5c1.6-1.2 4-1.7 6.5-1.5v13c-2.5-.2-4.9.3-6.5 1.5" />
    <path d="M12 6.5v13" />
  </svg>
);

export const IconModTransport = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="6" width="17" height="10" rx="2" />
    <path d="M3.5 11h17" />
    <circle cx="7.5" cy="18.5" r="1.5" /><circle cx="16.5" cy="18.5" r="1.5" />
    <path d="M7 9h3M14 9h3" />
  </svg>
);

export const IconModLearning = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3.5c-3.3 0-6 2.4-6 6 0 2.2 1.2 3.6 2.2 4.6.6.6.9 1 .9 1.9v1h5.8v-1c0-.9.3-1.3.9-1.9 1-1 2.2-2.4 2.2-4.6 0-3.6-2.7-6-6-6z" />
    <path d="M9.5 19.5h5M10.2 21.5h3.6" />
  </svg>
);

export const IconModPromotions = (p) => (
  <svg {...base} {...p}>
    <path d="M12 20V6" />
    <path d="M6.5 11.5L12 6l5.5 5.5" />
    <path d="M5 20h14" />
  </svg>
);

export const IconModAdmissions = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
    <path d="M14 3.5v4h4" />
    <path d="M9 15h6M12 12v6" />
  </svg>
);

export const IconModClasses = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4" width="17" height="12" rx="1.5" />
    <path d="M8 20l4-4 4 4" />
    <path d="M7 8.5h6M7 11.5h4" />
  </svg>
);

export const IconModCalendar = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 9.5h16M8 3v3M16 3v3" />
    <path d="M12 13l1.4 1.4L16 11.8" />
  </svg>
);

export const IconModSubjects = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="5.5" width="4.5" height="14" rx="0.8" transform="rotate(-8 6.25 12.5)" />
    <rect x="9.7" y="4.5" width="4.5" height="15" rx="0.8" />
    <rect x="15.3" y="5.5" width="4.5" height="14" rx="0.8" transform="rotate(8 17.55 12.5)" />
  </svg>
);

export const IconModGuardians = (p) => (
  <svg {...base} {...p}>
    <circle cx="8.5" cy="7.5" r="2.7" /><circle cx="16" cy="9" r="2.2" />
    <path d="M4 20c0-2.8 2-4.8 4.5-4.8s4.5 2 4.5 4.8" />
    <path d="M13.5 20c0-2.2 1.5-3.8 3.5-3.8s3.5 1.6 3.5 3.8" />
  </svg>
);

export const IconModStructure = (p) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="4.5" rx="1" />
    <path d="M12 7.5v3M5 14.5v-2h14v2" />
    <rect x="3" y="16" width="5.5" height="4.5" rx="1" />
    <rect x="9.25" y="16" width="5.5" height="4.5" rx="1" />
    <rect x="15.5" y="16" width="5.5" height="4.5" rx="1" />
    <path d="M12 10.5v3.5" />
  </svg>
);

// ---- Accounting & Finance module launcher icons (24x24, matches `base`) ----

export const IconAcctWorkspace = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4" width="17" height="15" rx="2" />
    <path d="M3.5 9h17" />
    <path d="M7 13l2.2 2.2L13.5 11" />
  </svg>
);

export const IconAcctChartOfAccounts = (p) => (
  <svg {...base} {...p}>
    <path d="M5 20V6a2 2 0 0 1 2-2h6l6 6v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    <path d="M13 4v6h6" />
    <path d="M8.5 13h7M8.5 16.5h4.5" />
  </svg>
);

export const IconAcctJournal = (p) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
    <path d="M8 8.5h8M8 12h8M8 15.5h5" />
    <path d="M4.5 7h15" />
  </svg>
);

export const IconAcctLedger = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M12 4v16M4 9.5h16M4 14.5h16" />
  </svg>
);

export const IconAcctBanking = (p) => (
  <svg {...base} {...p}>
    <path d="M3.5 9.5L12 4l8.5 5.5" />
    <path d="M5 9.5V19M9.5 9.5V19M14.5 9.5V19M19 9.5V19" />
    <path d="M3.5 19h17" />
  </svg>
);

export const IconAcctPettyCash = (p) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="7" width="17" height="11" rx="2" />
    <circle cx="12" cy="12.5" r="2.6" />
    <path d="M3.5 10.5h2.2M18.3 10.5h2.2" />
  </svg>
);

export const IconAcctBudgets = (p) => (
  <svg {...base} {...p}>
    <path d="M20 12a8 8 0 1 1-8-8" />
    <path d="M20 12h-8V4" />
  </svg>
);

export const IconAcctAssets = (p) => (
  <svg {...base} {...p}>
    <path d="M4 20V10l8-6 8 6v10" />
    <path d="M9 20v-6h6v6" />
  </svg>
);

export const IconAcctIncome = (p) => (
  <svg {...base} {...p}>
    <path d="M12 19V5" />
    <path d="M6.5 10.5L12 5l5.5 5.5" />
    <path d="M6 19h12" />
  </svg>
);

export const IconAcctExpenses = (p) => (
  <svg {...base} {...p}>
    <path d="M12 5v14" />
    <path d="M17.5 13.5L12 19l-5.5-5.5" />
    <path d="M6 5h12" />
  </svg>
);

export const IconAcctPayment = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10.5h18" />
    <path d="M6.5 14.5h4" />
  </svg>
);

export const IconTag = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3l7 7-9 9-7-7V4a1 1 0 0 1 1-1h8z" />
    <circle cx="8.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconModShop = (p) => (
  <svg {...base} {...p}>
    <path d="M4 8l1.5-4h13L20 8" />
    <path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" />
    <path d="M4 8h16" />
    <path d="M9 12v4M15 12v4" />
  </svg>
);

export const IconModFinances = (p) => (
  <svg {...base} {...p}>
    <path d="M4 19h16" />
    <rect x="6" y="12" width="3" height="7" />
    <rect x="10.5" y="8" width="3" height="11" />
    <rect x="15" y="4" width="3" height="15" />
  </svg>
);

export const IconModReports = (p) => (
  <svg {...base} {...p}>
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M15 3v4h4" />
    <path d="M8 12h8M8 15h8M8 18h5" />
  </svg>
);

export const IconPrint = (p) => (
  <svg {...base} {...p}>
    <rect x="6" y="9" width="12" height="7" rx="1" />
    <path d="M6 9V4h12v5" />
    <path d="M8 16v4h8v-4" />
    <circle cx="16" cy="12" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);
