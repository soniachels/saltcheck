import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface CashflowParams {
  entry: any;
  /** Timestamped money movements in range (from the transaction log). */
  transactions?: any[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  fmt: (n: number) => string; // money formatter
  userName?: string;
}

const inRange = (iso: string | undefined, start: string, end: string) =>
  !!iso && iso >= start && iso <= end;

const KIND_LABELS: Record<string, string> = {
  income_received: 'Income',
  soft_saving: 'Soft save',
  bill_paid: 'Bill paid',
  doom_spend: 'Doom spend',
};

function rows(items: any[], cols: ((x: any) => string)[]): string {
  if (!items.length) return `<tr><td colspan="${cols.length}" class="empty">— none in range —</td></tr>`;
  return items
    .map((it) => `<tr>${cols.map((c) => `<td>${c(it)}</td>`).join('')}</tr>`)
    .join('');
}

/** Build the HTML, render to a PDF file, and open the share sheet. */
export async function generateCashflowPdf({ entry, transactions, startDate, endDate, fmt, userName }: CashflowParams) {
  const bills = (entry?.bills || []).filter((b: any) => inRange(b.due_date, startDate, endDate) || !b.due_date);
  const income = (entry?.income || []).filter((i: any) => inRange(i.expected_date, startDate, endDate) || !i.expected_date);
  const doom = (entry?.doom_spends || []).filter((d: any) => inRange(d.date, startDate, endDate));
  const soft = (entry?.soft_savings || []).filter((s: any) => inRange(s.date, startDate, endDate));

  const REGRET = ['none', 'a lil', 'medium', 'big', 'huge'];

  // ---- True time-series from the transaction log ----
  // Oldest → newest so the running balance reads top-to-bottom like a statement.
  const txns = [...(transactions || [])].sort((a, b) =>
    String(a.occurred_at).localeCompare(String(b.occurred_at)));
  const inflow = txns.filter((t) => (t.signed_amount || 0) > 0).reduce((s, t) => s + t.signed_amount, 0);
  const outflow = txns.filter((t) => (t.signed_amount || 0) < 0).reduce((s, t) => s + Math.abs(t.signed_amount), 0);
  const net = inflow - outflow;
  let running = 0;
  const fmtDateTime = (iso: string) => {
    try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch { return iso; }
  };
  const ledgerRows = txns.length
    ? txns.map((t) => {
        running += t.signed_amount || 0;
        const pos = (t.signed_amount || 0) >= 0;
        return `<tr>
          <td>${fmtDateTime(t.occurred_at)}</td>
          <td>${KIND_LABELS[t.kind] || t.kind}</td>
          <td>${t.label || '—'}</td>
          <td class="right" style="color:${pos ? '#1a7f37' : '#C4191E'}">${pos ? '+' : '−'}${fmt(Math.abs(t.signed_amount || 0))}</td>
          <td class="right">${fmt(running)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="empty">— no recorded movements in range —</td></tr>`;

  const html = `
  <html><head><meta name="viewport" content="width=device-width" /><style>
    body { font-family: -apple-system, Helvetica, sans-serif; color: #111; padding: 28px; }
    h1 { font-size: 22px; margin: 0; letter-spacing: 1px; }
    .range { color: #666; margin: 4px 0 20px; font-size: 13px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat { flex: 1; border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
    .stat .label { font-size: 10px; color: #888; letter-spacing: 1px; }
    .stat .val { font-size: 18px; font-weight: 800; margin-top: 4px; }
    h2 { font-size: 13px; letter-spacing: 1px; color: #C4191E; margin: 22px 0 6px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td, th { text-align: left; padding: 5px 4px; }
    th { color: #999; font-size: 10px; letter-spacing: 1px; border-bottom: 1px solid #eee; }
    td.empty { color: #aaa; font-style: italic; }
    .right { text-align: right; }
    .foot { margin-top: 30px; color: #aaa; font-size: 10px; }
  </style></head><body>
    <h1>SALT CHECK — CASH FLOW</h1>
    <div class="range">${userName ? userName + ' · ' : ''}${startDate} → ${endDate}</div>

    <div class="summary">
      <div class="stat"><div class="label">MONEY IN</div><div class="val" style="color:#1a7f37">${fmt(inflow)}</div></div>
      <div class="stat"><div class="label">MONEY OUT</div><div class="val" style="color:#C4191E">${fmt(outflow)}</div></div>
      <div class="stat"><div class="label">NET</div><div class="val">${fmt(net)}</div></div>
    </div>

    <h2>CASH FLOW · ${txns.length} movement${txns.length === 1 ? '' : 's'}</h2>
    <table><tr><th>When</th><th>Type</th><th>Item</th><th class="right">Amount</th><th class="right">Balance</th></tr>
      ${ledgerRows}
    </table>

    <h2>BILLS</h2>
    <table><tr><th>Item</th><th>Amount</th><th>Due</th><th>Status</th></tr>
      ${rows(bills, [
        (b) => b.label || '—',
        (b) => fmt(b.amount || 0),
        (b) => b.due_date || (b.recurring ? b.recurring : '—'),
        (b) => (b.paid ? 'PAID' : 'unpaid'),
      ])}
    </table>

    <h2>INCOMING</h2>
    <table><tr><th>Item</th><th>Amount</th><th>Expected</th><th>Status</th></tr>
      ${rows(income, [
        (i) => i.label || '—',
        (i) => fmt(i.amount || 0),
        (i) => i.expected_date || (i.recurring ? i.recurring : '—'),
        (i) => (i.received ? 'RECEIVED' : 'pending'),
      ])}
    </table>

    <h2>DOOM SPENDING</h2>
    <table><tr><th>Item</th><th>Amount</th><th>Regret</th><th>Date</th></tr>
      ${rows(doom, [
        (d) => d.label || '—',
        (d) => fmt(d.amount || 0),
        (d) => REGRET[d.regret] || '—',
        (d) => d.date || '—',
      ])}
    </table>

    <h2>SOFT SAVING</h2>
    <table><tr><th>Item</th><th>Amount</th><th>Date</th></tr>
      ${rows(soft, [
        (s) => s.label || '—',
        (s) => fmt(s.amount || 0),
        (s) => s.date || '—',
      ])}
    </table>

    <div class="foot">Generated by Salt Check · ${new Date().toLocaleString()}</div>
  </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Salt Check cash flow', UTI: 'com.adobe.pdf' });
  }
  return uri;
}
