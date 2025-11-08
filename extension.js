const vscode = require('vscode');

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

      res.tokensByLine.forEach((lineTokens, lineIndex) => {
        for (const t of lineTokens) {
          const tt = tokenTypeMap[t.type];
          if (typeof tt === 'number') {
            builder.push(lineIndex, t.start, t.length, tt, 0);
          }
        }
      });

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

  let decorationTypes = {};
  let updateTimer = null;
  let sectionDecorationTypes = {};
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
      continuation: '#ffa600',
      separator: '#666666',
      terminator: '#c26e00'
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
    for (const k of Object.keys(sectionDecorationTypes)) {
      try { sectionDecorationTypes[k].dispose(); } catch (e) {}
    }
    sectionDecorationTypes = {};
    for (const k of Object.keys(inlineSectionDecorationTypes)) {
      try { inlineSectionDecorationTypes[k].dispose(); } catch (e) {}
    }
    inlineSectionDecorationTypes = {};
  }

  function getSectionDecoration(n) {
    if (sectionDecorationTypes[n]) return sectionDecorationTypes[n];
    const cfg = vscode.workspace.getConfiguration('brc');
    const gutterColors = cfg.get('sectionGutter.colors', defaultSectionGutterColors) || defaultSectionGutterColors;
    const themeKind = (vscode.window.activeColorTheme && vscode.window.activeColorTheme.kind) || undefined;
    const isDark = themeKind === vscode.ColorThemeKind.Dark || themeKind === vscode.ColorThemeKind.HighContrast;
    const variant = isDark ? (gutterColors.dark || defaultSectionGutterColors.dark) : (gutterColors.light || defaultSectionGutterColors.light);
    const bg = variant.background || (isDark ? defaultSectionGutterColors.dark.background : defaultSectionGutterColors.light.background);
    const stroke = variant.stroke || (isDark ? defaultSectionGutterColors.dark.stroke : defaultSectionGutterColors.light.stroke);
    const textColor = variant.text || (isDark ? defaultSectionGutterColors.dark.text : defaultSectionGutterColors.light.text);
    const svg = `<?xml version="1.0" encoding="utf-8"?>` +
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

    const svg = `<?xml version="1.0" encoding="utf-8"?>` +
      `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='14' viewBox='0 0 20 14'>` +
      `<rect rx='3' width='20' height='14' fill='${bg}' stroke='${stroke}'/>` +
      `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='9' fill='${textColor}'>${n}</text>` +
      `</svg>`;
    const uri = vscode.Uri.parse('data:image/svg+xml;utf8,' + encodeURIComponent(svg));

    const deco = vscode.window.createTextEditorDecorationType({
      after: {
        contentIconPath: uri,
        width: '20px',
        height: '1em',
      },
      rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
    });
    inlineSectionDecorationTypes[n] = deco;
    context.subscriptions.push(deco);
    return deco;
  }

  function applySectionDecorations(editor, bracketRangesParam, tokensByLineParam) {
    if (!editor || editor.document.languageId !== 'brc') return;
    const cfg = vscode.workspace.getConfiguration('brc');
    const enabled = cfg.get('showSectionGutter', false);
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
    const docText = doc.getText();

    // use provided bracketRanges from parser when available, otherwise compute
    let bracketRanges = Array.isArray(bracketRangesParam) ? bracketRangesParam : [];
    if(!Array.isArray(bracketRanges) || bracketRanges.length === 0){
      try {
        const parser = require('./tools/parse_lib');
        if (typeof parser.getBracketRanges === 'function') bracketRanges = parser.getBracketRanges(docText);
      } catch (e) { bracketRanges = bracketRanges || []; }
    }

    // precompute line start offsets (global offsets) for fast mapping
    const lineStarts = new Array(lineCount);
    for (let li = 0; li < lineCount; li++) lineStarts[li] = doc.offsetAt(new vscode.Position(li, 0));

    function isInBracket(globalIndex){
      for(const r of bracketRanges) if(globalIndex>=r.start && globalIndex<r.end) return true;
      return false;
    }
    const rangesBySection = {};
    let semicolonCount = 0;
    let prevSection = 0;
    const inlineRangesBySection = {};
    const tokensByLine = Array.isArray(tokensByLineParam) ? tokensByLineParam : [];

    // build a visible-line lookup to only create decoration ranges for visible lines
    const visibleRanges = (editor.visibleRanges || []).map(r => ({ start: r.start.line, end: r.end.line }));
    function isLineVisible(line) {
      for (const vr of visibleRanges) if (line >= vr.start && line <= vr.end) return true;
      return false;
    }

    // First pass: compute semicolon counts across all lines using parser tokens
    // and record which lines are section starts. We only push actual decoration
    // ranges for lines that are visible to avoid unnecessary editor.setDecorations work.
    for (let i = 0; i < lineCount; i++) {
      const lineTokens = tokensByLine[i] || [];
      const section = semicolonCount + 1;

  // determine gutter placement column: prefer first non-whitespace character,
  // fall back to first token.start if available, otherwise column 0
  const lineText = doc.lineAt(i).text;
  let gutterCol = 0;
  const firstNonWS = lineText.search(/\S/);
  if (firstNonWS >= 0) gutterCol = firstNonWS;
  else if (lineTokens.length > 0 && typeof lineTokens[0].start === 'number') gutterCol = lineTokens[0].start;

      if (section !== prevSection) {
        if (!rangesBySection[section]) rangesBySection[section] = [];
        if (isLineVisible(i)) {
          rangesBySection[section].push(new vscode.Range(i, gutterCol, i, gutterCol));
        }
      }
      prevSection = section;

      // count terminator tokens (semicolon) in this line, grouping consecutive ones
      let priorInLineSeen = 0;
      for (let t = 0; t < lineTokens.length; t++) {
        const tk = lineTokens[t];
        if (tk.type !== 'terminator') continue;
        let runLen = 1;
        while (t + runLen < lineTokens.length && lineTokens[t + runLen].type === 'terminator' &&
               lineTokens[t + runLen].start === lineTokens[t + runLen - 1].start + lineTokens[t + runLen - 1].length) {
          runLen++;
        }
        const lastToken = lineTokens[t + runLen - 1];
        // only show inline badge if last semicolon is not at end of line
        const lineText = doc.lineAt(i).text;
        if (lastToken.start + lastToken.length !== lineText.length) {
          const semicolonsBefore = semicolonCount + priorInLineSeen + (runLen - 1);
          const displayNumber = semicolonsBefore + 2;
          if (isLineVisible(i)) {
            if (!inlineRangesBySection[displayNumber]) inlineRangesBySection[displayNumber] = [];
            inlineRangesBySection[displayNumber].push(new vscode.Range(i, lastToken.start + lastToken.length, i, lastToken.start + lastToken.length));
          }
        }
        priorInLineSeen += runLen;
        t += runLen - 1;
      }
      semicolonCount += priorInLineSeen;
    }

    for (const s of Object.keys(rangesBySection)) {
      const n = Number(s);
      const deco = getSectionDecoration(n);
      try { editor.setDecorations(deco, rangesBySection[s]); } catch (e) {}
    }
    for (const s of Object.keys(inlineRangesBySection)) {
      const n = Number(s);
      const deco = getInlineSectionDecoration(n);
      try { editor.setDecorations(deco, inlineRangesBySection[s]); } catch (e) {}
    }
    for (const k of Object.keys(sectionDecorationTypes)) {
      if (!rangesBySection[k]) {
        try { editor.setDecorations(sectionDecorationTypes[k], []); } catch (e) {}
      }
    }
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
      }
    }

    applySectionDecorations(editor, res.bracketRanges, res.tokensByLine);
  }

  function scheduleUpdate(editor, delay = 200) {
    if (updateTimer) clearTimeout(updateTimer);
    updateTimer = setTimeout(() => {
      updateTimer = null;
      applyDecorationsToEditor(editor);
    }, delay);
  }

  const initialCfg = vscode.workspace.getConfiguration('brc');
  const initialColors = initialCfg.get('dynamicHighlighting.colors', undefined);
  createDecorationTypes(initialColors);

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((e) => { if (e) scheduleUpdate(e); }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
    const active = vscode.window.activeTextEditor;
    if (active && e.document === active.document) scheduleUpdate(active);
  }));

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
      const cfg = vscode.workspace.getConfiguration('brc');
      const colors = cfg.get('dynamicHighlighting.colors', undefined);
      createDecorationTypes(colors);
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }
    if (e.affectsConfiguration('brc.sectionGutter.colors') || e.affectsConfiguration('brc.showSectionGutter')) {
      for (const k of Object.keys(sectionDecorationTypes)) {
        try { sectionDecorationTypes[k].dispose(); } catch (err) {}
      }
      sectionDecorationTypes = {};
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }
  }));

  if (vscode.window.onDidChangeActiveColorTheme) {
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
      for (const k of Object.keys(sectionDecorationTypes)) {
        try { sectionDecorationTypes[k].dispose(); } catch (e) {}
      }
      sectionDecorationTypes = {};
      for (const k of Object.keys(inlineSectionDecorationTypes)) {
        try { inlineSectionDecorationTypes[k].dispose(); } catch (e) {}
      }
      inlineSectionDecorationTypes = {};
      const cfg = vscode.workspace.getConfiguration('brc');
      const colors = cfg.get('dynamicHighlighting.colors', undefined);
      createDecorationTypes(colors);
      if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
    }));
  }

  if (vscode.window.activeTextEditor) scheduleUpdate(vscode.window.activeTextEditor, 50);
}

function deactivate() {}

module.exports = { activate, deactivate };
