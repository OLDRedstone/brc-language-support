const vscode = require('vscode');

// Token types - exposed to themes
const tokenTypes = [
  'duration',
  'number',
  'color',
  'string',
  'value',
  'boolean',
  'null',
  'word',
  'key',
  'align',        // '='
  'continuation', // '+' and '+|'
  'separator',    // '|' (word separator) and optionally ';'
  'terminator'    // ';' at end of statement
];

function activate(context) {
  const legend = new vscode.SemanticTokensLegend(tokenTypes, []);
  const diagCollection = vscode.languages.createDiagnosticCollection('brc');
  context.subscriptions.push(diagCollection);

  const provider = {
    provideDocumentSemanticTokens(document) {
      const builder = new vscode.SemanticTokensBuilder(legend);
      const text = document.getText();
      const { parse } = require('./tools/parse_lib');
      const res = parse(text);

      const tokenTypeMap = {};
      tokenTypes.forEach((t, i) => (tokenTypeMap[t] = i));

      // emit semantic tokens for all parsed tokens (including property-list content)
      res.tokensByLine.forEach((lineTokens, lineIndex) => {
        for (const t of lineTokens) {
          const tt = tokenTypeMap[t.type];
          if (typeof tt === 'number') {
            builder.push(lineIndex, t.start, t.length, tt, 0);
          }
        }
      });

      // convert diagnostics
      const vsdiags = [];
      for (const d of res.diagnostics) {
        const range = new vscode.Range(d.line, d.start, d.line, d.start + d.length);
        const diag = new vscode.Diagnostic(range, d.message, vscode.DiagnosticSeverity.Warning);
        vsdiags.push(diag);
      }
      diagCollection.set(document.uri, vsdiags);

      return builder.build();
    }
  };

  const selector = { language: 'brc', scheme: '*' };
  const disposable = vscode.languages.registerDocumentSemanticTokensProvider(selector, provider, legend);
  context.subscriptions.push(disposable);

  // --- Dynamic, extension-scoped decorations (do NOT change user settings) ---
  // This implements an opt-in layer of decorations that applies colors per-token
  // for the `brc` language at runtime. It doesn't write to user settings or themes.
  let decorationTypes = {};
  let updateTimer = null;
  // section gutter decorations cache: key = section number
  let sectionDecorationTypes = {};
  // inline section decoration cache (shown after ';')
  let inlineSectionDecorationTypes = {};

  const defaultTokenColors = {
    light: {
      word: '#494949',
      duration: '#97dbff',
      align: '#009dff',
      number: '#0b6a6a',
      color: '#7c3aed',
      string: '#a16207',
      boolean: '#0b5394',
      null: '#0b5394',
      key: '#980000',
      value: '#007acc',
      continuation: '#ffa600ff',
      separator: '#666666',
      terminator: '#c26e00ff'
    },
    dark: {
      word: '#e0e0e0',
      duration: '#005888',
      align: '#00a6ff',
      number: '#b5cea8',
      color: '#D4BFFF',
      string: '#ce9178',
      boolean: '#569CD6',
      null: '#569CD6',
      key: '#9CDCFE',
      value: '#9cdcfe',
      continuation: '#ffdd00',
      separator: '#005685',
      terminator: '#ff9900'
    }
  };

  function pickDefaultTokenColors() {
    const cfg = vscode.workspace.getConfiguration('brc');
    // prefer the active color theme; if unavailable fall back to user preference brc.defaultTheme
    const themeKind = (vscode.window.activeColorTheme && vscode.window.activeColorTheme.kind) || undefined;
    const isDark = themeKind === vscode.ColorThemeKind.Dark || themeKind === vscode.ColorThemeKind.HighContrast;
    if (typeof isDark === 'boolean') return isDark ? defaultTokenColors.dark : defaultTokenColors.light;
    const pref = cfg.get('defaultTheme', 'light');
    return pref === 'dark' ? defaultTokenColors.dark : defaultTokenColors.light;
  }

  const defaultSectionGutterColors = {
    light: { background: '#e6eef8', stroke: '#bcd', text: '#000000' },
    dark: { background: '#2b2b3a', stroke: '#4b5563', text: '#ffffff' }
  };

  function createDecorationTypes(colors) {
    disposeDecorationTypes();
    decorationTypes = {};
    const base = pickDefaultTokenColors();
    const merged = Object.assign({}, base, colors || {});
    for (const t of tokenTypes) {
      const color = merged[t] || '#ffffff';
      decorationTypes[t] = vscode.window.createTextEditorDecorationType({
        color: color,
        textDecoration: t === 'word' ? `underline solid ${color}` : undefined,
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen
      });
      context.subscriptions.push(decorationTypes[t]);
    }
  }

  function disposeDecorationTypes() {
    for (const k of Object.keys(decorationTypes)) {
      try { decorationTypes[k].dispose(); } catch (e) {}
    }
    decorationTypes = {};
    // dispose section decorations as well
    for (const k of Object.keys(sectionDecorationTypes)) {
      try { sectionDecorationTypes[k].dispose(); } catch (e) {}
    }
    sectionDecorationTypes = {};
    // dispose inline section decorations
    for (const k of Object.keys(inlineSectionDecorationTypes)) {
      try { inlineSectionDecorationTypes[k].dispose(); } catch (e) {}
    }
    inlineSectionDecorationTypes = {};
  }

  function getSectionDecoration(n) {
    if (sectionDecorationTypes[n]) return sectionDecorationTypes[n];
    // generate a small SVG icon with the section number and use it as a gutter icon (data URI)
    // choose colors depending on active color theme (light/dark)
    const cfg = vscode.workspace.getConfiguration('brc');
    const gutterColors = cfg.get('sectionGutter.colors', defaultSectionGutterColors) || defaultSectionGutterColors;
    const themeKind = (vscode.window.activeColorTheme && vscode.window.activeColorTheme.kind) || undefined;
    const isDark = themeKind === vscode.ColorThemeKind.Dark || themeKind === vscode.ColorThemeKind.HighContrast;
    const variant = isDark ? (gutterColors.dark || defaultSectionGutterColors.dark) : (gutterColors.light || defaultSectionGutterColors.light);
    const bg = variant.background || (isDark ? defaultSectionGutterColors.dark.background : defaultSectionGutterColors.light.background);
    const stroke = variant.stroke || (isDark ? defaultSectionGutterColors.dark.stroke : defaultSectionGutterColors.light.stroke);
    const textColor = variant.text || (isDark ? defaultSectionGutterColors.dark.text : defaultSectionGutterColors.light.text);
    const svg = `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='14' viewBox='0 0 20 14'>` +
      `<rect rx='3' width='20' height='14' fill='${bg}' stroke='${stroke}'/>` +
      `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='9' fill='${textColor}'>${n}</text>` +
      `</svg>`;
    const uri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(svg));
    const deco = vscode.window.createTextEditorDecorationType({
      gutterIconPath: uri,
      gutterIconSize: 'contain',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    sectionDecorationTypes[n] = deco;
    context.subscriptions.push(deco);
    return deco;
  }

  function getInlineSectionDecoration(n) {
    if (inlineSectionDecorationTypes[n]) return inlineSectionDecorationTypes[n];
    const cfg = vscode.workspace.getConfiguration('brc');
    const gutterColors = cfg.get('sectionGutter.colors', defaultSectionGutterColors) || defaultSectionGutterColors;
    const themeKind = (vscode.window.activeColorTheme && vscode.window.activeColorTheme.kind) || undefined;
    const isDark = themeKind === vscode.ColorThemeKind.Dark || themeKind === vscode.ColorThemeKind.HighContrast;
    const variant = isDark ? (gutterColors.dark || defaultSectionGutterColors.dark) : (gutterColors.light || defaultSectionGutterColors.light);
    const bg = variant.background || (isDark ? defaultSectionGutterColors.dark.background : defaultSectionGutterColors.light.background);
    const stroke = variant.stroke || (isDark ? defaultSectionGutterColors.dark.stroke : defaultSectionGutterColors.light.stroke);
    const textColor = variant.text || (isDark ? defaultSectionGutterColors.dark.text : defaultSectionGutterColors.light.text);

    // Create a compact SVG badge similar to the gutter icon but smaller for inline placement
    const svg = `<?xml version="1.0" encoding="utf-8"?>` +
      `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='14' viewBox='0 0 28 14'>` +
      `<rect rx='3' x='0' y='0' width='28' height='14' fill='${bg}' stroke='${stroke}'/>` +
      `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='9' fill='${textColor}'>${n}</text>` +
      `</svg>`;
    const uri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(svg));

    const deco = vscode.window.createTextEditorDecorationType({
      after: {
        contentIconPath: uri,
        margin: '0 0 0 6px'
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    inlineSectionDecorationTypes[n] = deco;
    context.subscriptions.push(deco);
    return deco;
  }

  function applySectionDecorations(editor) {
    if (!editor || editor.document.languageId !== 'brc') return;
    const cfg = vscode.workspace.getConfiguration('brc');
    const enabled = cfg.get('showSectionGutter', false);
    // clear existing section decorations if disabled
    if (!enabled) {
      for (const k of Object.keys(sectionDecorationTypes)) {
        try { editor.setDecorations(sectionDecorationTypes[k], []); } catch (e) {}
      }
      for (const k of Object.keys(inlineSectionDecorationTypes)) {
        try { editor.setDecorations(inlineSectionDecorationTypes[k], []); } catch (e) {}
      }
      return;
    }

    const doc = editor.document;
    const lineCount = doc.lineCount;
    const rangesBySection = {};
    let semicolonCount = 0;
    let prevSection = 0;
    const inlineRangesBySection = {};
    for (let i = 0; i < lineCount; i++) {
      const lineText = doc.lineAt(i).text;
      const section = semicolonCount + 1;
      // only show the section badge when it differs from the previous line's section
      if (section !== prevSection) {
        if (!rangesBySection[section]) rangesBySection[section] = [];
        // place decoration at start of line (0-width range)
        rangesBySection[section].push(new vscode.Range(i, 0, i, 0));
      }
      prevSection = section;

      // scan characters in the line; for runs of consecutive ';' only display on the last semicolon
      let lineSemicolonsSeen = 0;
      for (let c = 0; c < lineText.length; c++) {
        if (lineText[c] === ';') {
          // find end of run of consecutive semicolons
          let j = c;
          while (j + 1 < lineText.length && lineText[j + 1] === ';') j++;
          const runLength = j - c + 1;
          const lastIndex = j;
          // if the last semicolon of the run is at end of line, skip showing inline badge (next line will show gutter)
          if (lastIndex !== lineText.length - 1) {
            // semicolonsBefore should include semicolons earlier in previous lines, earlier in this line, and those in the run before the last one
            const semicolonsBefore = semicolonCount + lineSemicolonsSeen + (runLength - 1);
            const displayNumber = semicolonsBefore + 2;
            if (!inlineRangesBySection[displayNumber]) inlineRangesBySection[displayNumber] = [];
            inlineRangesBySection[displayNumber].push(new vscode.Range(i, lastIndex, i, lastIndex + 1));
          }
          lineSemicolonsSeen += runLength;
          // advance c to end of run
          c = j;
        }
      }
      semicolonCount += lineSemicolonsSeen;
    }

    // apply decorations per section
    for (const s of Object.keys(rangesBySection)) {
      const n = Number(s);
      const deco = getSectionDecoration(n);
      try { editor.setDecorations(deco, rangesBySection[s]); } catch (e) {}
    }
    // apply inline decorations for semicolons
    for (const s of Object.keys(inlineRangesBySection)) {
      const n = Number(s);
      const deco = getInlineSectionDecoration(n);
      try { editor.setDecorations(deco, inlineRangesBySection[s]); } catch (e) {}
    }
    // clear unused section decorations (optional)
    for (const k of Object.keys(sectionDecorationTypes)) {
      if (!rangesBySection[k]) {
        try { editor.setDecorations(sectionDecorationTypes[k], []); } catch (e) {}
      }
    }
    // clear unused inline decorations
    for (const k of Object.keys(inlineSectionDecorationTypes)) {
      if (!inlineRangesBySection[k]) {
        try { editor.setDecorations(inlineSectionDecorationTypes[k], []); } catch (e) {}
      }
    }
  }

  function applyDecorationsToEditor(editor) {
    if (!editor || editor.document.languageId !== 'brc') return;
    const cfg = vscode.workspace.getConfiguration('brc');
    const enabled = cfg.get('dynamicHighlighting.enabled', true);
    if (!enabled) {
      // clear any existing decorations
      for (const t of tokenTypes) {
        if (decorationTypes[t]) editor.setDecorations(decorationTypes[t], []);
      }
      return;
    }

    const text = editor.document.getText();
    const { parse } = require('./tools/parse_lib');
    let res;
    try {
      res = parse(text);
    } catch (err) {
      // Parsing failed; clear decorations
      for (const t of tokenTypes) {
        if (decorationTypes[t]) editor.setDecorations(decorationTypes[t], []);
      }
      return;
    }

    const rangesByType = {};
    for (const t of tokenTypes) rangesByType[t] = [];

    res.tokensByLine.forEach((lineTokens, lineIndex) => {
      for (const tk of lineTokens) {
        const type = tk.type;
        if (!decorationTypes[type]) continue;
        const r = new vscode.Range(lineIndex, tk.start, lineIndex, tk.start + tk.length);
        rangesByType[type].push(r);
      }
    });

    for (const t of tokenTypes) {
      try {
        editor.setDecorations(decorationTypes[t], rangesByType[t]);
      } catch (e) {
        // ignore per-editor failures
      }
    }

    // apply per-line section gutter badges
    applySectionDecorations(editor);
  }

  // debounce updates for responsiveness on typing
  function scheduleUpdate(editor, delay = 200) {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateTimer = null;
      applyDecorationsToEditor(editor);
    }, delay);
  }

  // initialize decoration types from configuration
  const initialCfg = vscode.workspace.getConfiguration('brc');
  const initialColors = initialCfg.get('dynamicHighlighting.colors', undefined);
  createDecorationTypes(initialColors);

  // watch for editor & document changes
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => { if (e) scheduleUpdate(e); }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
    const active = vscode.window.activeTextEditor;
    if (active && e.document === active.document) scheduleUpdate(active);
  }));

  // watch for config changes to rebuild colors or toggle behavior
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('brc.dynamicHighlighting.colors')) {
      const newColors = vscode.workspace.getConfiguration('brc').get('dynamicHighlighting.colors', undefined);
      createDecorationTypes(newColors);
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }
    if (e.affectsConfiguration('brc.dynamicHighlighting.enabled')) {
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }
    if (e.affectsConfiguration('brc.defaultTheme')) {
      // user changed preferred default variant; rebuild decoration types using same configured colors
      const cfg = vscode.workspace.getConfiguration('brc');
      const colors = cfg.get('dynamicHighlighting.colors', undefined);
      createDecorationTypes(colors);
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }
    // rebuild section gutter icons when gutter colors or visibility changes
    if (e.affectsConfiguration('brc.sectionGutter.colors') || e.affectsConfiguration('brc.showSectionGutter')) {
      for (const k of Object.keys(sectionDecorationTypes)) {
        try { sectionDecorationTypes[k].dispose(); } catch (err) {}
      }
      sectionDecorationTypes = {};
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }
  }));

  // react to color theme changes to rebuild section gutter icons (light/dark variants)
  if (vscode.window.onDidChangeActiveColorTheme) {
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
      // dispose cached section decorations so they will be recreated with new colors
      for (const k of Object.keys(sectionDecorationTypes)) {
        try { sectionDecorationTypes[k].dispose(); } catch (e) {}
      }
      sectionDecorationTypes = {};
      for (const k of Object.keys(inlineSectionDecorationTypes)) {
        try { inlineSectionDecorationTypes[k].dispose(); } catch (e) {}
      }
      inlineSectionDecorationTypes = {};
      // also rebuild token decoration types so defaults follow theme
      const cfg = vscode.workspace.getConfiguration('brc');
      const colors = cfg.get('dynamicHighlighting.colors', undefined);
      createDecorationTypes(colors);
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }));
  }

  // initial apply
  if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
}

function deactivate() {}

module.exports = { activate, deactivate };
