/* ==========================================================================
   The invoice.

   Strictly black and white, set like a printed docket. Three renderings from
   one summary:

   html()    the on-screen overlay (selectable text, screen-reader friendly)
   canvas()  a 2x bitmap the visitor can save or screenshot and send to us
   text()    the WhatsApp message body

   The invoice deliberately does not list the floral materials chosen. It lists
   colour, occasion, size, date and price — the things we actually commit to.
   ========================================================================== */

const MONO = '"SFMono-Regular", ui-monospace, Menlo, Consolas, monospace';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = 'Inter, Helvetica, Arial, sans-serif';

function money(amount, currency) {
  return `${currency} ${Number(amount).toLocaleString('en-HK')}`;
}

function issuedStamp(date) {
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* --- HTML --------------------------------------------------------------- */

export function html(summary, content) {
  const inv = content.invoice;
  const colours = summary.colours.length
    ? escapeHtml(summary.colours[0].label)
    : 'Florist’s choice';
  const occasions = summary.occasions.length
    ? escapeHtml(summary.occasions[0].label)
    : 'Not specified';

  return `
    <article class="inv" aria-labelledby="inv-title">
      <header class="inv__head">
        <div>
          <img class="inv__brand" src="images/kuneylogo.png" alt="${escapeHtml(summary.brand.name)}" />
          <p class="inv__sub">${escapeHtml(inv.subheading)}</p>
        </div>
        <div class="inv__meta">
          <p><span>No.</span> ${escapeHtml(summary.reference || '—')}</p>
          <p><span>Issued</span> ${escapeHtml(issuedStamp(summary.issued))}</p>
        </div>
      </header>

      <h2 class="inv__title" id="inv-title">${escapeHtml(inv.heading)}</h2>

      <dl class="inv__list">
        <div class="inv__row">
          <dt>Bouquet</dt>
          <dd>${escapeHtml(summary.size?.label || '—')} — seasonal, florist’s choice</dd>
        </div>
        <div class="inv__row">
          <dt>Colour</dt>
          <dd>${colours}</dd>
        </div>
        <div class="inv__row">
          <dt>Occasion</dt>
          <dd>${occasions}</dd>
        </div>
        <div class="inv__row">
          <dt>Delivery date</dt>
          <dd>${escapeHtml(summary.dateLong || '—')}</dd>
        </div>
      </dl>

      <div class="inv__total">
        <span>Total</span>
        <b>${money(summary.total, summary.currency)}</b>
      </div>

      <p class="inv__note">${escapeHtml(summary.note)}</p>
      <p class="inv__note inv__note--faint">${escapeHtml(summary.gameNote)}</p>

      <div class="inv__cols">
        <section>
          <h3>Delivery</h3>
          <ul>
            ${summary.delivery.map((d) => `<li><span>${escapeHtml(d.zone)}</span><b>${escapeHtml(d.label)}</b></li>`).join('')}
          </ul>
        </section>
        <section>
          <h3>Terms &amp; Conditions</h3>
          <ol>
            ${summary.terms.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
          </ol>
        </section>
      </div>

      <footer class="inv__foot">
        <p>${escapeHtml(summary.contact.whatsapp)} · ${escapeHtml(summary.contact.email)}</p>
        <p>${escapeHtml(summary.contact.siteUrl)}</p>
      </footer>
    </article>
  `;
}

/* --- canvas ------------------------------------------------------------- */

/**
 * Draw the invoice as a saveable image. Pure 2D canvas so there is no
 * html2canvas-style dependency and no tainted-canvas surprise on download.
 */
export function canvas(summary, content) {
  const scale = 2;
  const W = 760;
  const el = document.createElement('canvas');
  const ctx = el.getContext('2d');

  const inv = content.invoice;
  const M = 56;                    // margin
  const INNER = W - M * 2;

  /* --- measure pass: wrap the paragraphs so the height is exact --------- */

  const wrap = (text, font, maxWidth) => {
    ctx.font = font;
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const noteFont = `400 13px ${SANS}`;
  const noteLines = wrap(summary.note, noteFont, INNER);
  const gameLines = wrap(summary.gameNote, noteFont, INNER);
  const termLines = summary.terms.map((t, i) => wrap(`${i + 1}. ${t}`, noteFont, INNER - 14));
  const termCount = termLines.reduce((n, l) => n + l.length, 0);

  const rows = 4;   // bouquet, colour, occasion, delivery date
  const H =
    186 +                          // header + title
    rows * 42 +                     // detail rows
    76 +                            // total block
    noteLines.length * 19 + 14 +
    gameLines.length * 19 + 26 +
    34 + summary.delivery.length * 22 + 26 +   // delivery
    34 + termCount * 19 + 30 +                 // terms
    62;                                        // footer

  el.width = W * scale;
  el.height = H * scale;
  el.style.width = `${W}px`;
  ctx.scale(scale, scale);

  /* --- paint ------------------------------------------------------------ */

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';

  const rule = (y, alpha = 0.22) => {
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
  };

  let y = 74;

  // Brand
  ctx.textAlign = 'left';
  ctx.font = `300 30px ${SERIF}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(summary.brand.name, M, y);
  ctx.letterSpacing = '0px';

  ctx.font = `400 12px ${SANS}`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(inv.subheading, M, y + 20);

  ctx.textAlign = 'right';
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = '#000';
  ctx.fillText(`NO. ${summary.reference || '—'}`, W - M, y - 14);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(issuedStamp(summary.issued), W - M, y + 4);

  y += 44;
  rule(y);

  y += 34;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';
  ctx.font = `500 11px ${SANS}`;
  ctx.letterSpacing = '3.5px';
  ctx.fillText(inv.heading, M, y);
  ctx.letterSpacing = '0px';

  y += 22;

  // Detail rows
  const row = (label, value) => {
    ctx.font = `400 11px ${SANS}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.letterSpacing = '1.6px';
    ctx.textAlign = 'left';
    ctx.fillText(label.toUpperCase(), M, y + 16);
    ctx.letterSpacing = '0px';

    ctx.font = `400 15px ${SANS}`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'right';
    ctx.fillText(value, W - M, y + 16);

    y += 42;
    rule(y - 14, 0.09);
  };

  row('Bouquet', `${summary.size?.label || '—'} — seasonal, florist’s choice`);
  row('Colour', summary.colours.length ? summary.colours[0].label : 'Florist’s choice');
  row('Occasion', summary.occasions.length ? summary.occasions[0].label : 'Not specified');
  row('Delivery date', summary.dateLong || '—');

  // Total
  y += 14;
  ctx.fillStyle = '#000';
  ctx.fillRect(M, y, INNER, 1);
  y += 34;
  ctx.font = `500 11px ${SANS}`;
  ctx.letterSpacing = '3.5px';
  ctx.textAlign = 'left';
  ctx.fillText('TOTAL', M, y);
  ctx.letterSpacing = '0px';
  ctx.font = `300 30px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillText(money(summary.total, summary.currency), W - M, y + 4);
  y += 20;
  ctx.fillStyle = '#000';
  ctx.fillRect(M, y, INNER, 1);
  y += 30;

  // Notes
  ctx.textAlign = 'left';
  ctx.font = noteFont;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  for (const line of noteLines) {
    ctx.fillText(line, M, y);
    y += 19;
  }
  y += 14;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (const line of gameLines) {
    ctx.fillText(line, M, y);
    y += 19;
  }
  y += 26;

  // Delivery
  const heading = (label) => {
    ctx.fillStyle = '#000';
    ctx.font = `500 11px ${SANS}`;
    ctx.letterSpacing = '3px';
    ctx.textAlign = 'left';
    ctx.fillText(label.toUpperCase(), M, y);
    ctx.letterSpacing = '0px';
    y += 10;
    rule(y, 0.18);
    y += 22;
  };

  heading('Delivery');
  ctx.font = `400 13px ${SANS}`;
  for (const d of summary.delivery) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.textAlign = 'left';
    ctx.fillText(d.zone, M, y);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'right';
    ctx.fillText(d.label, W - M, y);
    y += 22;
  }
  y += 22;

  // Terms
  heading('Terms & Conditions');
  ctx.font = noteFont;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.textAlign = 'left';
  for (const lines of termLines) {
    for (const line of lines) {
      ctx.fillText(line, M, y);
      y += 19;
    }
  }

  // Footer
  y = H - 40;
  rule(y - 22, 0.18);
  ctx.font = `400 11px ${MONO}`;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(`${summary.contact.whatsapp}  ·  ${summary.contact.email}`, M, y);
  ctx.textAlign = 'right';
  ctx.fillText(summary.contact.siteUrl.replace(/^https?:\/\//, ''), W - M, y);

  return el;
}

/** Trigger a PNG download of the invoice. */
export function download(summary, content) {
  const el = canvas(summary, content);
  const name = `kuney-flowers-${summary.reference || 'order'}.png`;
  return new Promise((resolve) => {
    el.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve(name);
    }, 'image/png');
  });
}

/* --- text / WhatsApp ---------------------------------------------------- */

export function text(summary) {
  const lines = [
    `${summary.brand.name} — order enquiry`,
    summary.reference ? `Ref ${summary.reference}` : null,
    '',
    `Bouquet: ${summary.size?.label || '—'} (${money(summary.total, summary.currency)})`,
    `Colour: ${summary.colours.length ? summary.colours[0].label : 'Florist’s choice'}`,
    `Occasion: ${summary.occasions.length ? summary.occasions[0].label : 'Not specified'}`,
    `Delivery date: ${summary.dateLong || '—'}`,
    '',
    'I would like to pay by bank transfer — please send me the details.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export function whatsappLink(summary, content) {
  const digits = (content.contact.whatsappDigits || content.contact.whatsapp || '')
    .replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text(summary))}`;
}
