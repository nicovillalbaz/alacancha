type Player = { givenNames: string; familyNames: string; registrationNumber: string; birthDate: string; originKind: string };
function latin(value: string) { return Array.from(value.normalize('NFC'), (char) => char.charCodeAt(0) <= 255 ? char : '?').join(''); }
function literal(value: string) { return latin(value).replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replaceAll('\r',' ').replaceAll('\n',' '); }
function line(text: string, x: number, y: number, bold = false, size = 10) { return `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${literal(text)}) Tj ET\n`; }
function wrap(value: string, width: number) {
  const result: string[] = []; let current = '';
  for (const word of value.split(/\s+/)) {
    if (!word) continue;
    if (current && `${current} ${word}`.length > width) { result.push(current); current = ''; }
    if (word.length > width) { for (let at = 0; at < word.length; at += width) result.push(word.slice(at, at + width)); }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) result.push(current);
  return result.length ? result : [''];
}

export function approvedGoodFaithPdf(input: { tournament: string; edition: string; category: string; team: string; version: number; reviewedAt: string; players: Player[] }) {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')], offsets = [0];
  let length = chunks[0].length;
  const add = (value: string | Buffer) => { const chunk = typeof value === 'string' ? Buffer.from(value,'latin1') : value; chunks.push(chunk); length += chunk.length; };
  const objects: Array<string | Buffer> = [];
  const metadata = [
    ...wrap(`Torneo: ${input.tournament}`, 55), ...wrap(`Edición: ${input.edition}`, 55),
    ...wrap(`Categoría: ${input.category}`, 55), ...wrap(`Equipo: ${input.team}`, 55),
  ];
  const versionY = 768 - metadata.length * 12, tableY = versionY - 28, rowsStart = tableY - 22;
  type PdfRow = { index: number; player: Player; name: string[]; card: string[]; y: number };
  const pageRows: PdfRow[][] = [[]]; let y = rowsStart;
  input.players.forEach((player, index) => {
    const name = wrap(`${player.familyNames}, ${player.givenNames}`, 44), card = wrap(player.registrationNumber, 14);
    const height = Math.max(33, Math.max(name.length, card.length) * 8 + 8);
    if (y - height < 75 && pageRows.at(-1)!.length) { pageRows.push([]); y = rowsStart; }
    pageRows.at(-1)!.push({ index, player, name, card, y }); y -= height;
  });
  const pages = pageRows.length;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  for (let page = 0; page < pages; page++) {
    const pageId = 5 + page * 2, contentId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    let stream = line('LISTA DE BUENA FE APROBADA', 42, 796, true, 15);
    metadata.forEach((part, index) => { stream += line(part, 42, 768 - index * 12, false, 10); });
    stream += line(`Versión ${input.version} · Revisión ${input.reviewedAt.slice(0,10)} · Página ${page + 1}/${pages}`, 42, versionY, false, 9);
    stream += line('N°  Apellidos y nombres                                      Ficha                 Nacimiento', 42, tableY, true, 9);
    pageRows[page].forEach(({ index, player, name, card, y }) => {
      name.forEach((part, row) => { stream += line(`${row === 0 ? String(index + 1).padStart(2) : '  '}  ${part}`, 42, y - row * 8, false, 8); });
      card.forEach((part, row) => { stream += line(part, 396, y - row * 8, false, 8); });
      stream += line(player.birthDate, 513, y, false, 9);
    });
    stream += line('Documento privado · Sin número de identidad · No publicar en el portal', 42, 46, false, 8);
    const bytes = Buffer.from(latin(stream), 'latin1');
    objects[contentId] = Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`,'latin1'), bytes, Buffer.from('endstream','latin1')]);
  }
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = length; add(`${id} 0 obj\n`); add(objects[id]); add('\nendobj\n');
  }
  const xref = length; add(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < objects.length; id++) add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
