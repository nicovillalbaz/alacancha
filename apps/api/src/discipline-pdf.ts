function safe(value: string) { return Array.from(value.normalize('NFC'), char => char.charCodeAt(0) <= 255 ? char : '?').join('').replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replaceAll('\n',' '); }
function wrap(value: string, width = 78) {
  const lines: string[] = []; let line = '';
  for (const word of value.split(/\s+/)) {
    if (!word) continue;
    if (line && `${line} ${word}`.length > width) { lines.push(line); line = ''; }
    if (word.length > width) { for (let at = 0; at < word.length; at += width) lines.push(word.slice(at, at + width)); }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}
export function disciplineDecisionPdf(input: { caseId: string; team: string; player: string | null; summary: string; status: string; reason: string; suspension: string; fine: string; decidedAt: string; revocationReason: string | null; revokedAt: string | null }) {
  const rows = [
    `Expediente: ${input.caseId}`, ...wrap(`Equipo: ${input.team}`), ...wrap(`Persona: ${input.player || 'Equipo'}`),
    `Estado: ${input.status}`, `Decisión: ${input.decidedAt.slice(0,10)}`,
    ...(input.revokedAt ? [`Revocación: ${input.revokedAt.slice(0,10)}`,...wrap(`Motivo de revocación: ${input.revocationReason || 'Sin detalle'}`)] : []),
    ...(input.revokedAt ? ['Efecto actual: sin suspensión ni multa vigente'] : []),
    ...wrap(`Origen: ${input.summary}`), ...wrap(`Motivo: ${input.reason}`),
    ...wrap(`${input.revokedAt ? 'Suspensión original' : 'Suspensión'}: ${input.suspension}`), ...wrap(`${input.revokedAt ? 'Multa deportiva original' : 'Multa deportiva'}: ${input.fine}`),
  ];
  const pageSize = 34, pages = Array.from({length:Math.max(1,Math.ceil(rows.length/pageSize))},(_,index)=>rows.slice(index*pageSize,(index+1)*pageSize));
  const kids=pages.map((_,index)=>`${5+index*2} 0 R`).join(' ');
  const objects: Array<string|null> = [null, '<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  pages.forEach((page,index)=>{
    let stream='BT /F2 15 Tf 42 790 Td (RESOLUCIÓN DISCIPLINARIA) Tj ET\n';
    page.forEach((row,line)=>{stream+=`BT /F1 10 Tf 42 ${760-line*18} Td (${safe(row)}) Tj ET\n`;});
    stream+=`BT /F1 8 Tf 42 45 Td (Documento privado. Sin pagos ni datos de identidad civil. Página ${index+1} de ${pages.length}.) Tj ET\n`;
    const content=Buffer.from(stream,'latin1');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+index*2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${stream}endstream`);
  });
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')], offsets = [0]; let length = chunks[0].length;
  for (let id = 1; id < objects.length; id++) { offsets[id] = length; const chunk = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, 'latin1'); chunks.push(chunk); length += chunk.length; }
  const xref = length; let tail = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) tail += `${String(offsets[id]).padStart(10,'0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  chunks.push(Buffer.from(tail, 'latin1'));
  return Buffer.concat(chunks);
}
