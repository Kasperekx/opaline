export const isMacPlatform = /Mac|iPhone|iPad/.test(navigator.userAgent);
export const primaryModifierLabel = isMacPlatform ? "⌘" : "Ctrl";
