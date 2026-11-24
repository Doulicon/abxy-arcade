type IconProps = { className?: string; strokeWidth?: number };

const base = (className = 'h-4 w-4', strokeWidth = 2) => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconSearch = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4.5 4.5" />
  </svg>
);

export const IconHeart = ({ className, strokeWidth, filled }: IconProps & { filled?: boolean }) => (
  <svg {...base(className, strokeWidth)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.5S4.5 16 2.8 11.6A5 5 0 0 1 12 6.6a5 5 0 0 1 9.2 5c-1.7 4.4-9.2 8.9-9.2 8.9Z" />
  </svg>
);

export const IconGrid = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
);

export const IconImage = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="3" y="4" width="18" height="16" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m4 17 4.5-4.5L13 17l3-3 4 4" />
  </svg>
);

export const IconPlay = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M7 4.5 20 12 7 19.5Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconChevronLeft = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const IconChevronRight = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconArrowLeft = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M20 12H4" />
    <path d="m10 6-6 6 6 6" />
  </svg>
);

export const IconPlus = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconEdit = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17Z" />
    <path d="m14.5 5.5 3 3" />
  </svg>
);

export const IconTrash = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const IconX = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconGamepad = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M7 8h10a4.5 4.5 0 0 1 4.3 5.8l-.9 3A2.6 2.6 0 0 1 15.5 18l-1-1.5h-5L8.5 18a2.6 2.6 0 0 1-4.9-1.2l-.9-3A4.5 4.5 0 0 1 7 8Z" />
    <path d="M8 11v3M6.5 12.5h3" />
    <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="14" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconUser = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);

export const IconUsers = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </svg>
);

export const IconMenu = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconUpload = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
  </svg>
);

export const IconLogout = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </svg>
);

export const IconStar = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m12 3.5 2.7 5.5 6 .9-4.35 4.25 1.03 6L12 17.3l-5.38 2.85 1.03-6L3.3 9.9l6-.9Z" />
  </svg>
);

export const IconCalendar = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="3.5" y="5" width="17" height="15" rx="1" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
);

export const IconMonitor = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="1" />
    <path d="M9 20h6M12 16.5V20" />
  </svg>
);

export const IconLock = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="4.5" y="10" width="15" height="10" rx="1.5" />
    <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </svg>
);

export const IconCheck = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const IconTool = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export const IconSparkle = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
    <path d="m6.5 6.5 2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5" />
  </svg>
);

export const IconFolder = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8A1.5 1.5 0 0 1 20.5 10v7.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />
  </svg>
);

export const IconDisc = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

export const IconGlobe = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.3 3.6 8.5S14.4 18.2 12 20.5c-2.4-2.3-3.6-5.3-3.6-8.5S9.6 5.8 12 3.5Z" />
  </svg>
);

export const IconChevronDown = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconText = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M4 6V4h16v2M12 4v16M8.5 20h7" />
  </svg>
);

export const IconSun = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export const IconGift = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="3" y="8" width="18" height="4" />
    <rect x="5" y="12" width="14" height="9" />
    <path d="M12 8v13" />
    <path d="M12 8H7.5a2.5 2.5 0 1 1 2.5-3.5C10 6 11 8 12 8Z" />
    <path d="M12 8h4.5a2.5 2.5 0 1 0-2.5-3.5C14 6 13 8 12 8Z" />
  </svg>
);

export const IconInfo = ({ className, strokeWidth }: IconProps) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
);
