const paths = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  story: '<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>',
  insight: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  publish: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18 9a7 7 0 0 0-12-2M6 15a7 7 0 0 0 12 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  file: '<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  moon: '<path d="M20 15a8 8 0 0 1-11-11 8.5 8.5 0 1 0 11 11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h7v18h-7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  warning: '<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/>',
  delete: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
};

export function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}
