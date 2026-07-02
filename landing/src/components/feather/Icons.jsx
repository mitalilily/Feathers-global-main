function Icon({ name, className = "h-5 w-5" }) {
  const icons = {
    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6l-12 12" />
      </>
    ),
    chevronDown: (
      <>
        <path d="m6 9 6 6 6-6" />
      </>
    ),
    chevronRight: (
      <>
        <path d="m9 6 6 6-6 6" />
      </>
    ),
    chevronLeft: (
      <>
        <path d="m15 6-6 6 6 6" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    minus: (
      <>
        <path d="M5 12h14" />
      </>
    ),
    route: (
      <>
        <path d="M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        <path d="M18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        <path d="M8 16h3a3 3 0 0 0 3-3v-2" />
        <path d="M14 11h2" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 12h4l2 3h4l2-3h4" />
        <path d="M5 5h14l1 7v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5l1-7Z" />
      </>
    ),
    rocket: (
      <>
        <path d="M6 18c1.5-.3 3.2-1.1 4.5-2.4L17 9a8.5 8.5 0 0 0 1.9-7A8.5 8.5 0 0 0 12 3.9L5.4 10.5A9 9 0 0 0 3 15c0 2.1 1 4 3 3Z" />
        <path d="M9 15l-4 4" />
        <path d="M15 9h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l7 3v5c0 4.7-2.9 8.8-7 10-4.1-1.2-7-5.3-7-10V6l7-3Z" />
        <path d="M9.5 12.5l1.8 1.8 3.6-4.1" />
      </>
    ),
    layers: (
      <>
        <path d="M12 4 4 8l8 4 8-4-8-4Z" />
        <path d="m4 12 8 4 8-4" />
        <path d="m4 16 8 4 8-4" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3l1.7 4.8L18 9.5l-4.3 1.7L12 16l-1.7-4.8L6 9.5l4.3-1.7L12 3Z" />
        <path d="M19 4v4" />
        <path d="M21 6h-4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 0 0-14.9-3" />
        <path d="M4 4v5h5" />
        <path d="M4 13a8 8 0 0 0 14.9 3" />
        <path d="M20 20v-5h-5" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H4V7Z" />
        <path d="M4 9h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" />
        <path d="M15.5 14h.01" />
      </>
    ),
    bolt: (
      <>
        <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19h16" />
        <path d="M7 16V9" />
        <path d="M12 16V5" />
        <path d="M17 16v-6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a15 15 0 0 1 0 18" />
        <path d="M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    store: (
      <>
        <path d="M4 9h16" />
        <path d="M5 9l1-4h12l1 4" />
        <path d="M6 9v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    shoppingBag: (
      <>
        <path d="M6 8h12l-1 12H7L6 8Z" />
        <path d="M9 8a3 3 0 1 1 6 0" />
      </>
    ),
    truck: (
      <>
        <path d="M10 17H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h7v11Z" />
        <path d="M10 10h5l3 3v4h-8" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="16.5" cy="17.5" r="1.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    checkCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.4 2.4L15.8 9.5" />
      </>
    ),
    coins: (
      <>
        <ellipse cx="12" cy="6" rx="6" ry="3" />
        <path d="M6 6v5c0 1.7 2.7 3 6 3s6-1.3 6-3V6" />
        <path d="M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
      </>
    ),
    bell: (
      <>
        <path d="M15 17H5.8a1.8 1.8 0 0 1-1.5-2.8l.7-1A5.8 5.8 0 0 0 6 10V9a6 6 0 1 1 12 0v1c0 1.2.4 2.4 1.1 3.4l.6 1A1.8 1.8 0 0 1 18.2 17H15" />
        <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
      </>
    ),
    api: (
      <>
        <path d="M8 8 4 12l4 4" />
        <path d="M16 8l4 4-4 4" />
        <path d="M13 5 11 19" />
      </>
    ),
    calculator: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8" />
        <path d="M8 11h2" />
        <path d="M14 11h2" />
        <path d="M8 15h2" />
        <path d="M14 15h2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    user: (
      <>
        <path d="M18 20a6 6 0 0 0-12 0" />
        <circle cx="12" cy="8" r="4" />
      </>
    ),
    users: (
      <>
        <path d="M16 19a4 4 0 0 0-8 0" />
        <circle cx="12" cy="9" r="3" />
        <path d="M5.5 17.5a3.3 3.3 0 0 1 3-2" />
        <path d="M18.5 17.5a3.3 3.3 0 0 0-3-2" />
        <circle cx="6.5" cy="10.5" r="2" />
        <circle cx="17.5" cy="10.5" r="2" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.5v2" />
        <path d="M12 18.5v2" />
        <path d="M3.5 12h2" />
        <path d="M18.5 12h2" />
        <path d="m5.9 5.9 1.4 1.4" />
        <path d="m16.7 16.7 1.4 1.4" />
        <path d="m18.1 5.9-1.4 1.4" />
        <path d="m7.3 16.7-1.4 1.4" />
      </>
    ),
    barChart: (
      <>
        <path d="M5 19V9" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
        <path d="M3 19h18" />
      </>
    ),
    pieChart: (
      <>
        <path d="M12 3v9h9" />
        <path d="M20.5 14.5A8.7 8.7 0 1 1 9.5 3.5" />
        <path d="M14 3.3A8.7 8.7 0 0 1 20.7 10H14V3.3Z" />
      </>
    ),
    arrowUpRight: (
      <>
        <path d="M7 17 17 7" />
        <path d="M9 7h8v8" />
      </>
    ),
    package: (
      <>
        <path d="m12 3 8 4.5-8 4.5L4 7.5 12 3Z" />
        <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
        <path d="M12 12v9" />
      </>
    ),
    phone: (
      <>
        <path d="M5 4h3l2 5-2 1.5a14 14 0 0 0 5.5 5.5L15 14l5 2v3a2 2 0 0 1-2.2 2 18 18 0 0 1-15.6-15.6A2 2 0 0 1 5 4Z" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    messageSquare: (
      <>
        <path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M8 10h8" />
        <path d="M8 14h5" />
      </>
    ),
    messages: (
      <>
        <path d="M4 6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
        <path d="M9 18h7l4 3v-3a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
        <path d="M7 10h6" />
        <path d="M7 13h4" />
      </>
    ),
    map: (
      <>
        <path d="M9 18 3 20V6l6-2 6 2 6-2v14l-6 2-6-2Z" />
        <path d="M9 4v14" />
        <path d="M15 6v14" />
      </>
    ),
    mapPin: (
      <>
        <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    star: (
      <>
        <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
      </>
    ),
    alertTriangle: (
      <>
        <path d="M10.3 4.2 2.8 17.4A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.6L13.7 4.2a2 2 0 0 0-3.4 0Z" />
        <path d="M12 8v5" />
        <path d="M12 17h.01" />
      </>
    ),
    headset: (
      <>
        <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
        <path d="M5 13h3v6H6a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z" />
        <path d="M16 13h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6Z" />
        <path d="M16 19a4 4 0 0 1-4 2h-1" />
      </>
    ),
    linkedin: (
      <>
        <path d="M6 9v10" />
        <path d="M6 5.5v.01" />
        <path d="M10 19v-6a4 4 0 0 1 8 0v6" />
        <path d="M10 9v10" />
      </>
    ),
    twitter: (
      <>
        <path d="M21 6.5c-.7.3-1.5.5-2.3.6.8-.5 1.4-1.2 1.7-2.1-.8.5-1.6.8-2.5 1A4 4 0 0 0 11 9.7c0 .3 0 .6.1.9A11.3 11.3 0 0 1 3 6.5s-3 6.5 4 9.5c-1.2.8-2.7 1.2-4 1.1 7 4.2 15.7.2 15.7-8v-.4c.8-.6 1.6-1.3 2.3-2.2Z" />
      </>
    ),
    facebook: (
      <>
        <path d="M14 8h3V4h-3a5 5 0 0 0-5 5v3H6v4h3v5h4v-5h3l1-4h-4V9a1 1 0 0 1 1-1Z" />
      </>
    ),
    youtube: (
      <>
        <path d="M22 12s0-3.2-.4-4.7a2.8 2.8 0 0 0-2-2C17.8 5 12 5 12 5s-5.8 0-7.6.3a2.8 2.8 0 0 0-2 2C2 8.8 2 12 2 12s0 3.2.4 4.7a2.8 2.8 0 0 0 2 2C6.2 19 12 19 12 19s5.8 0 7.6-.3a2.8 2.8 0 0 0 2-2c.4-1.5.4-4.7.4-4.7Z" />
        <path d="m10 9 5 3-5 3V9Z" />
      </>
    ),
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name] || icons.layers}
    </svg>
  );
}

export default Icon;
