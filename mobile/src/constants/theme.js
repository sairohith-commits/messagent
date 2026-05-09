// Design tokens shared across every screen and component

export const COLORS = {
  background:    '#0F0F0F',
  card:          '#1A1A1A',
  cardBorder:    '#2A2A2A',
  accent:        '#6C63FF',
  accentDim:     '#3D3878',
  text:          '#FFFFFF',
  textSecondary: '#888888',
  textMuted:     '#555555',
  success:       '#4CAF50',
  error:         '#FF5252',
  warning:       '#FFA726',
  toggleOff:     '#333333',
};

// Metadata for each supported platform — icon is an emoji, color is the brand colour
export const PLATFORMS = {
  gmail: {
    label:  'Gmail',
    emoji:  '📧',
    color:  '#EA4335',
    letter: 'G',
  },
  whatsapp: {
    label:  'WhatsApp',
    emoji:  '💬',
    color:  '#25D366',
    letter: 'W',
  },
  instagram: {
    label:  'Instagram',
    emoji:  '📷',
    color:  '#E1306C',
    letter: 'IG',
  },
  telegram: {
    label:  'Telegram',
    emoji:  '✈️',
    color:  '#2CA5E0',
    letter: 'TG',
  },
};

// Default platform config applied before the user saves any settings
export const DEFAULT_PLATFORMS = [
  { platform: 'gmail',     enabled: false, mode: 'assistant', scheduleStart: null, scheduleEnd: null },
  { platform: 'whatsapp',  enabled: false, mode: 'assistant', scheduleStart: null, scheduleEnd: null },
  { platform: 'instagram', enabled: false, mode: 'assistant', scheduleStart: null, scheduleEnd: null },
  { platform: 'telegram',  enabled: false, mode: 'assistant', scheduleStart: null, scheduleEnd: null },
];
