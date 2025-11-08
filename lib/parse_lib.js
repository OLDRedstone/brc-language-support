function parse(text){
  const lines = text.split(/\r?\n/);
  const tokensByLine = [];
  const diagnostics = [];

  const skipRanges = [];
  const bracketRe = /\[(?:\\.|[^\\\]])*\]/g;
  let m;
  const bracketRanges = [];
  while ((m = bracketRe.exec(text)) !== null) {
    bracketRanges.push({start: m.index, end: m.index + m[0].length});
    skipRanges.push({start: m.index, end: m.index + m[0].length});
  }
  const bracketParsedTokens = [];
  function parsePropertyListContentGlobal(brText, brGlobalStart){
    const inner = brText.slice(1, -1);
    const tokens = [];
    tokens.push({ type:'punctuation', text:'[', start: brGlobalStart, length: 1 });

    let idx = 0;
    function isEscapedInner(pos){
      let ii = pos - 1; let cnt = 0;
      while(ii >= 0 && inner[ii] === '\\') { cnt++; ii--; }
      return (cnt % 2) === 1;
    }

    while(idx < inner.length){
      const ws = inner.slice(idx).match(/^\s+/);
      if(ws){ idx += ws[0].length; continue; }

      const propMatch = inner.slice(idx).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(=)?\s*/);
      if(propMatch){
        const name = propMatch[1];
        const hasEq = !!propMatch[2];
        const nameInInnerPos = idx;
        const nameGlobal = brGlobalStart + 1 + nameInInnerPos;
        tokens.push({ type:'key', text:name, start: nameGlobal, length: name.length });
        idx += propMatch[0].length;

        if(hasEq){
          const eqOffset = propMatch[0].indexOf('=');
          const eqGlobal = brGlobalStart + 1 + nameInInnerPos + eqOffset;
          tokens.push({ type:'align', text:'=', start: eqGlobal, length: 1 });
        }

        if((inner[idx] === '"' || inner[idx] === "'") && !isEscapedInner(idx)){
          const quote = inner[idx];
          let j = idx+1; let val = quote;
          while(j < inner.length){
            if(inner[j] === '\\') { val += inner.substr(j,2); j+=2; }
            else if(inner[j] === quote){ val += quote; j++; break; }
            else { val += inner[j]; j++; }
          }
          const vGlobal = brGlobalStart + 1 + idx;
          tokens.push({ type:'string', text: val, start: vGlobal, length: val.length });
          idx = j;
        } else {
          let j = idx; let v = '';
          while(j < inner.length && inner[j] !== ','){ v += inner[j]; j++; }
          const vtrim = v.trim();
          const vStartInInner = idx + v.indexOf(vtrim);
          const vGlobal = brGlobalStart + 1 + vStartInInner;

          for (let qpos = 0; qpos < vtrim.length; qpos++) {
            const ch = vtrim[qpos];
            if (ch === '"' || ch === "'") {
              const posInInner = vStartInInner + qpos;
              if (!isEscapedInner(posInInner)) {
                const globalPos = brGlobalStart + 1 + posInInner;
                let lineIdx = 0;
                while (lineIdx + 1 < lineStarts.length && lineStarts[lineIdx + 1] <= globalPos) lineIdx++;
                const col = globalPos - lineStarts[lineIdx];
                diagnostics.push({ line: lineIdx, start: col, length: 1, message: 'Unescaped quote inside unquoted property value; quotes must be escaped within values' });
              }
            }
          }

          let unescaped = '';
          for (let k = 0; k < vtrim.length; k++) {
            if (vtrim[k] === '\\' && k + 1 < vtrim.length) { unescaped += vtrim[k+1]; k++; }
            else unescaped += vtrim[k];
          }

          if (/^#([A-Fa-f0-9]{3,8})$/.test(unescaped)){
            tokens.push({ type:'color', text: unescaped, start: vGlobal, length: vtrim.length });
          } else if (/^\d+(?:\/\d+)?$/.test(unescaped) || /^\d*\.\d+$/.test(unescaped)){
            tokens.push({ type:'number', text: unescaped, start: vGlobal, length: vtrim.length });
          } else if (/^(true|false)$/.test(unescaped)){
            tokens.push({ type:'boolean', text: unescaped, start: vGlobal, length: vtrim.length });
          } else if (unescaped === 'null'){
            tokens.push({ type:'null', text: unescaped, start: vGlobal, length: vtrim.length });
          } else if (unescaped.length>0){
            tokens.push({ type:'value', text: unescaped, start: vGlobal, length: vtrim.length });
          }
          idx = j;
        }

        if(inner[idx] === ','){
          const commaGlobal = brGlobalStart + 1 + idx;
          tokens.push({ type:'separator', text: ',', start: commaGlobal, length: 1 });
          idx++;
        }
      } else {
        idx++;
      }
    }

    const endGlobal = brGlobalStart + brText.length - 1;
    tokens.push({ type:'punctuation', text: ']', start: endGlobal, length: 1 });
    return tokens;
  }
  function isInSkip(globalIndex){
    for(const r of skipRanges) if(globalIndex>=r.start && globalIndex<r.end) return true;
    return false;
  }

  function isInBracket(globalIndex){
    for(const r of bracketRanges) if(globalIndex>=r.start && globalIndex<r.end) return true;
    return false;
  }

  function isEscapedGlobal(globalIndex){
    let i = globalIndex - 1; let count = 0;
    while(i>=0 && text[i] === '\\') { count++; i--; }
    return (count % 2) === 1;
  }

  const explicitDurationRe = /-(\d+)(?:\/(\d+))?\|?/g;
  const equalsSeqRe = /=(?:\d+|=*)/g; // =, ==, ===, =N
  const colorRe = /#([a-fA-F0-9]{8}|[a-fA-F0-9]{6}|[a-fA-F0-9]{4}|[a-fA-F0-9]{3})\b/g;
  const dashRunRe = /-{2,}\|?/g;
  const singleDashRe = /-(?:\|)?/g;
  const continuationPipeRe = /\+\|/g;
  const continuationRe = /\+/g;
  const pipeRe = /\|/g;
  const semicolonRe = /;/g;
  const numberRe = /\b(?:\d*\.\d+|\d+\.\d*|\d+)\b/g;
  const wordWithEscapesRe = /(?:\\.|[^-\[\];\|\+\=])+/g;
  const anomalousDashFollowDigit = /-{2,}\d/gi;

  const lineStarts = [];
  lineStarts.push(0);
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  for(const br of bracketRanges){
    const brText = text.slice(br.start, br.end);
    try{
      const parsed = parsePropertyListContentGlobal(brText, br.start);
      bracketParsedTokens.push(...parsed);
    }catch(e){ /* ignore parse errors here */ }
  }
  let globalOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = lineStarts[i] || globalOffset;
    globalOffset = lineStart;
    const tokens = [];
    if(!line){ tokensByLine.push(tokens); continue; }

    anomalousDashFollowDigit.lastIndex = 0;
    while((m=anomalousDashFollowDigit.exec(line))!==null){
      if(isInSkip(lineStart + m.index)) continue;
      diagnostics.push({line:i, start:m.index, length:m[0].length, message:'Ambiguous syntax: dash-run directly followed by digits'});
    }

    const tokenMatches = [];
    const tokenRegexes = [
      { re: explicitDurationRe, type: 'duration', pr: 0 },
      { re: equalsSeqRe, type: 'align', pr: 1 },
      { re: colorRe, type: 'color', pr: 2 },
      { re: dashRunRe, type: 'duration', pr: 3 },
      { re: singleDashRe, type: 'duration', pr: 4 },
      { re: continuationPipeRe, type: 'continuation', pr: 5 },
      { re: continuationRe, type: 'continuation', pr: 6 },
      { re: pipeRe, type: 'separator', pr: 7 },
      { re: semicolonRe, type: 'terminator', pr: 7 },
      { re: numberRe, type: 'number', pr: 8 },
      { re: wordWithEscapesRe, type: 'word', pr: 9 }
    ];
    for (const { re, type, pr } of tokenRegexes) {
      re.lastIndex = 0;
      let mm;
      while ((mm = re.exec(line)) !== null) {
        const start = mm.index; const len = mm[0].length;
        const globalStart = lineStart + start;
        if (isInSkip(globalStart)) continue;
  if (type !== 'word' && isEscapedGlobal(globalStart)) continue;
  if (type === 'word' && mm[0].length>0 && mm[0][0] === '-') continue;
        tokenMatches.push({ start, len, type, text: mm[0], pr });
        if (len === 0) break;
      }
    }
  tokenMatches.sort((a,b)=>a.start-b.start || a.pr - b.pr || b.len - a.len);
  const chosen = []; let nextFree = 0;
  for(const t of tokenMatches){ if(t.start>=nextFree){ chosen.push(t); nextFree = t.start + t.len; }}
    let cursor = 0;
    function pushWordSlice(startIdx, endIdx){
      if(endIdx<=startIdx) return;
      const slice = line.slice(startIdx, endIdx);
      tokens.push({type:'word', text:slice, start:startIdx, length: slice.length});
    }
    function parsePropertyListContent(brText, brGlobalStart){
      const inner = brText.slice(1, -1); // remove [ ]
      const localTokens = [];
      let idx = 0;
      const localBrStart = brGlobalStart - lineStart; // bracket start index relative to line

      localTokens.push({ type:'punctuation', text: '[', start: localBrStart, length: 1 });

      while(idx < inner.length){
        const ws = inner.slice(idx).match(/^\s+/);
        if(ws){ idx += ws[0].length; continue; }

        const propMatch = inner.slice(idx).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(=)?\s*/);
        if(propMatch){
          const name = propMatch[1];
          const hasEq = !!propMatch[2];
          const nameInInnerPos = idx; // position inside inner where name starts
          const nameAbs = localBrStart + 1 + nameInInnerPos; // absolute index relative to line
          localTokens.push({ type:'key', text: name, start: nameAbs, length: name.length });
          idx += propMatch[0].length;

          if(hasEq){
            const eqOffset = propMatch[0].indexOf('=');
            const eqAbs = localBrStart + 1 + nameInInnerPos + eqOffset;
            localTokens.push({ type:'align', text: '=', start: eqAbs, length: 1 });
          }

          function isEscapedInner(pos){
            let ii = pos - 1; let cnt = 0;
            while(ii >= 0 && inner[ii] === '\\') { cnt++; ii--; }
            return (cnt % 2) === 1;
          }

          if((inner[idx] === '"' || inner[idx] === "'") && !isEscapedInner(idx)){
            const quote = inner[idx];
            let j = idx+1; let val = quote;
            while(j < inner.length){
              if(inner[j] === '\\') { val += inner.substr(j,2); j+=2; }
              else if(inner[j] === quote){ val += quote; j++; break; }
              else { val += inner[j]; j++; }
            }
            const vtext = val;
            const vAbs = localBrStart + 1 + idx;
            localTokens.push({ type:'string', text: vtext, start: vAbs, length: vtext.length });
            idx = j;
          } else {
            let j = idx; let v='';
            while(j<inner.length && inner[j] !== ','){ v += inner[j]; j++; }
            const vtrim = v.trim();
            const vStartInInner = idx + v.indexOf(vtrim);
            const vAbs = localBrStart + 1 + vStartInInner;
            for (let qpos = 0; qpos < vtrim.length; qpos++) {
              const ch = vtrim[qpos];
              if (ch === '"' || ch === "'") {
                if (!(qpos > 0 && vtrim[qpos-1] === '\\')) {
                  diagnostics.push({ line: i, start: vAbs + qpos, length: 1, message: 'Unescaped quote inside unquoted property value; quotes must be escaped within values' });
                }
              }
            }

            let unescaped = '';
            for (let k = 0; k < vtrim.length; k++) {
              if (vtrim[k] === '\\' && k + 1 < vtrim.length) {
                unescaped += vtrim[k+1];
                k++;
              } else {
                unescaped += vtrim[k];
              }
            }
            if (/^#([A-Fa-f0-9]{3,8})$/.test(unescaped)){
              localTokens.push({ type:'color', text: unescaped, start: vAbs, length: vtrim.length });
            } else if (/^\d+(?:\/\d+)?$/.test(unescaped) || /^\d*\.\d+$/.test(unescaped)){
              localTokens.push({ type:'number', text: unescaped, start: vAbs, length: vtrim.length });
            } else if (/^(true|false)$/.test(unescaped)){
              localTokens.push({ type:'boolean', text: unescaped, start: vAbs, length: vtrim.length });
            } else if (unescaped === 'null'){
              localTokens.push({ type:'null', text: unescaped, start: vAbs, length: vtrim.length });
            } else if (unescaped.length>0){
              localTokens.push({ type:'value', text: unescaped, start: vAbs, length: vtrim.length });
            }
            idx = j;
          }

          if(inner[idx] === ','){
            const commaAbs = localBrStart + 1 + idx;
            localTokens.push({ type:'separator', text: ',', start: commaAbs, length:1 });
            idx++;
          }
        } else {
          idx++;
        }
      }

      const endAbs = localBrStart + brText.length - 1;
      localTokens.push({ type:'punctuation', text: ']', start: endAbs, length: 1 });

      return localTokens;
    }

    for(const t of chosen){
      if(t.start>cursor){
        let gStart = cursor;
        while(gStart < t.start){
          const globalGStart = lineStart + gStart;
          const br = bracketRanges.find(b => b.start < lineStart + t.start && b.end > globalGStart);
          if(!br){
            pushWordSlice(gStart, t.start);
            break;
          } else {
            const localBrStart = Math.max(0, br.start - lineStart);
            if(localBrStart > gStart) pushWordSlice(gStart, Math.min(localBrStart, t.start));
            const brEnd = Math.min(br.end - lineStart, t.start);
            gStart = brEnd;
          }
        }
      }
      tokens.push({type:t.type, text:t.text, start:t.start, length:t.len});
      cursor = t.start + t.len;
    }
    if(cursor<line.length){
      let gStart = cursor;
      while(gStart < line.length){
        const globalGStart = lineStart + gStart;
        const br = bracketRanges.find(b => b.start < lineStart + line.length && b.end > globalGStart);
        if(!br){ pushWordSlice(gStart, line.length); break; }
        const localBrStart = Math.max(0, br.start - lineStart);
        if(localBrStart > gStart) pushWordSlice(gStart, localBrStart);
        const brEnd = Math.min(br.end - lineStart, line.length);
        gStart = brEnd;
      }
    }

    const lineGlobalStart = lineStart;
    const lineGlobalEnd = lineStart + line.length;
    for(const pt of bracketParsedTokens){
      if(pt.start >= lineGlobalStart && pt.start < lineGlobalEnd){
        tokens.push({ type: pt.type, text: pt.text, start: pt.start - lineStart, length: pt.length });
      }
    }

    tokens.sort((a,b)=>a.start - b.start);
    tokensByLine.push(tokens);
  }
  return {tokensByLine, diagnostics, bracketRanges};
}

module.exports = { parse };
function getBracketRanges(text){
  const ranges = [];
  let i = 0;
  const len = text.length;
  while(i < len){
    if(text[i] === '['){
      const start = i;
      i++;
      while(i < len){
        if(text[i] === '\\'){
          i += 2;
          continue;
        }
        if(text[i] === ']'){
          i++; // include closing bracket
          break;
        }
        i++;
      }
      const end = i;
      ranges.push({ start, end });
    } else {
      i++;
    }
  }
  return ranges;
}

module.exports.getBracketRanges = getBracketRanges;
