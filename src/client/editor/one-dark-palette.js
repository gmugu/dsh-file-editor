/**
 * The single source for the syntax color families the editor uses: one-dark
 * for the dark scheme, one-light for the light scheme.
 *
 * Verbatim port of dsh-better-sidebar (MIT, omdsh-dev/DSH-better-sidebar)
 * src/client/one-dark-palette.ts. The palette holds only the syntax hues;
 * surface colors (background, foreground, caret, gutter) are theme-token
 * driven and stay with the theme assembly in cm-themes.js.
 */

/** one-dark family (dark scheme) syntax hues. */
export const ONE_DARK = {
  black: '#282c34',
  gray: '#abb2bf',
  faintGray: '#5c6370',
  white: '#ffffff',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  orange: '#d19a66',
}

/** one-light family (light scheme) syntax hues. */
export const ONE_LIGHT = {
  black: '#383a42',
  gray: '#a0a1a7',
  faintGray: '#4f525e',
  white: '#ffffff',
  offWhite: '#fafafa',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#0184bc',
  magenta: '#a626a4',
  cyan: '#0997b3',
  orange: '#986801',
  link: '#4078f2',
}