// Icones inline (aucune dependance externe).
// Elles heritent la couleur du conteneur via `stroke="currentColor"`.

type P = { className?: string };
const base = "h-5 w-5";

const svg = (path: React.ReactNode, strokeWidth = 1.8) =>
  function Icon({ className = base }: P) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {path}
      </svg>
    );
  };

/* --- documents / argent --- */
export const IconReceipt = svg(
  <>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </>,
);

export const IconWallet = svg(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </>,
);

export const IconHourglass = svg(
  <>
    <path d="M7 3h10M7 21h10" />
    <path d="M8 3v3.5a4 4 0 0 0 1.5 3.1L12 12l-2.5 2.4A4 4 0 0 0 8 17.5V21" />
    <path d="M16 3v3.5a4 4 0 0 1-1.5 3.1L12 12l2.5 2.4a4 4 0 0 1 1.5 3.1V21" />
  </>,
);

export const IconAlert = svg(
  <>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);

export const IconFileText = svg(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
);

export const IconCheckCircle = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </>,
);

export const IconPercent = svg(
  <>
    <path d="m19 5-14 14" />
    <circle cx="7.5" cy="7.5" r="2.5" />
    <circle cx="16.5" cy="16.5" r="2.5" />
  </>,
);

export const IconRefund = svg(
  <>
    <path d="M3 9a9 9 0 1 1 1.5 5" />
    <path d="M3 4v5h5" />
    <path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
  </>,
);

/* --- entites --- */
export const IconUsers = svg(
  <>
    <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
  </>,
);

export const IconBuilding = svg(
  <>
    <path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
    <path d="M14 10h4a2 2 0 0 1 2 2v9M2 21h20" />
    <path d="M7 8h3M7 12h3M7 16h3M17 14h1M17 17h1" />
  </>,
);

export const IconUser = svg(
  <>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
  </>,
);

export const IconBox = svg(
  <>
    <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
    <path d="M3 8.5 12 13l9-4.5M12 13v7" />
  </>,
);

export const IconWrench = svg(
  <>
    <path d="M15.5 4.5a4.5 4.5 0 0 0-5.9 5.6L4 15.7V20h4.3l5.6-5.6a4.5 4.5 0 0 0 5.6-5.9l-2.8 2.8-2.4-2.4 2.8-2.4Z" />
  </>,
);

export const IconTag = svg(
  <>
    <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" />
    <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
  </>,
);

export const IconChart = svg(
  <>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </>,
);

/* --- interface --- */
export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </>,
);

export const IconPlus = svg(<path d="M12 5v14M5 12h14" />, 2);

export const IconArrowRight = svg(<path d="M5 12h14M13 6l6 6-6 6" />, 2);

export const IconEmptyBox = svg(
  <>
    <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z" />
    <path d="M3 8.5 12 13l9-4.5M12 13v7" />
  </>,
  1.5,
);
