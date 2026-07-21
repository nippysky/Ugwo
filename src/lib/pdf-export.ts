/**
 * pdf-export.ts — on-device PDF statement generation.
 *
 * Built with expo-print: the HTML is rendered to PDF entirely on the device,
 * then handed to the OS share sheet via expo-sharing. Nothing sensitive ever
 * transits a server.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatAmount } from './format';
import { withBalance, netPosition, debtStatus, todayStr } from './debt-math';
import { friendlyDate } from './reminder-message';
import type { Debt, Person, Repayment } from '../types';

// ─── Brand tokens (kept in sync with src/theme/colors.ts) ────────────────────

const INDIGO = '#1E2A4A';
const AMBER  = '#E8A33D';
const PAPER  = '#FAF9F7';
const INK    = '#101114';
const SLATE  = '#53555C';
const HAIR   = '#DCDEE5';
const RED    = '#B5483B';

// ─── Statement HTML ───────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function statusLabel(debt: Debt, today: string): string {
  switch (debtStatus(debt, today)) {
    case 'settled':    return 'Settled';
    case 'overdue':    return 'Overdue';
    case 'due-soon':   return 'Due soon';
    case 'upcoming':   return 'Upcoming';
    case 'open-ended': return 'Open';
  }
}

export function buildStatementHtml(opts: {
  userName:   string;
  persons:    Person[];
  debts:      Debt[];
  repayments: Repayment[];
  symbol:     string;
}): string {
  const { userName, persons, debts, repayments, symbol } = opts;
  const today = todayStr();
  const { net, owedToMe, iOwe } = netPosition(debts, repayments);
  const personName = (id: string) => persons.find((p) => p.id === id)?.name ?? 'Unknown';

  const openRows = debts
    .filter((d) => d.status === 'open')
    .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
    .map((d) => {
      const b = withBalance(d, repayments);
      const dir = d.direction === 'owed_to_me' ? 'Owed to me' : 'I owe';
      const dirColor = d.direction === 'owed_to_me' ? AMBER : RED;
      return `<tr>
        <td>${esc(personName(d.personId))}</td>
        <td><span style="color:${dirColor};font-weight:600;">${dir}</span></td>
        <td class="num">${formatAmount(d.principal, symbol)}</td>
        <td class="num">${formatAmount(b.repaid, symbol)}</td>
        <td class="num"><strong>${formatAmount(b.outstanding, symbol)}</strong></td>
        <td>${friendlyDate(d.incurredOn)}</td>
        <td>${d.dueOn ? friendlyDate(d.dueOn) : '—'}</td>
        <td>${statusLabel(d, today)}</td>
      </tr>`;
    })
    .join('');

  const settledRows = debts
    .filter((d) => d.status === 'settled')
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? ''))
    .map((d) => {
      const dir = d.direction === 'owed_to_me' ? 'Owed to me' : 'I owe';
      return `<tr>
        <td>${esc(personName(d.personId))}</td>
        <td>${dir}</td>
        <td class="num">${formatAmount(d.principal, symbol)}</td>
        <td>${friendlyDate(d.incurredOn)}</td>
        <td>${d.settledAt ? friendlyDate(d.settledAt.slice(0, 10)) : '—'}</td>
      </tr>`;
    })
    .join('');

  const generatedOn = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { margin: 40px; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: ${INK}; margin: 0; }
  .head { background: ${INDIGO}; color: ${PAPER}; padding: 28px 32px; border-radius: 14px; }
  .head h1 { margin: 0; font-size: 26px; font-weight: 300; letter-spacing: -0.5px; }
  .head .sub { margin-top: 4px; font-size: 11px; color: ${AMBER}; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 600; }
  .meta { margin-top: 10px; font-size: 12px; color: rgba(250,249,247,0.7); }
  .totals { display: flex; gap: 12px; margin: 20px 0 26px; }
  .totals .box { flex: 1; border: 1px solid ${HAIR}; border-radius: 12px; padding: 14px 16px; }
  .totals .label { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: ${SLATE}; font-weight: 600; }
  .totals .value { font-size: 20px; margin-top: 4px; font-variant-numeric: tabular-nums; }
  h2 { font-size: 14px; letter-spacing: 1px; text-transform: uppercase; color: ${SLATE}; margin: 26px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { text-align: left; padding: 8px 8px; border-bottom: 2px solid ${INDIGO}; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${SLATE}; }
  td { padding: 8px 8px; border-bottom: 1px solid ${HAIR}; font-variant-numeric: tabular-nums; }
  .num { text-align: right; }
  th.num { text-align: right; }
  .empty { color: ${SLATE}; font-size: 12px; padding: 12px 0; }
  .foot { margin-top: 32px; font-size: 10px; color: ${SLATE}; text-align: center; }
</style>
</head>
<body>
  <div class="head">
    <h1>Ụgwọ — Debt Statement</h1>
    <div class="sub">Owed · Remembered · Settled</div>
    <div class="meta">${esc(userName)} &nbsp;·&nbsp; Generated ${generatedOn} &nbsp;·&nbsp; Prepared on-device</div>
  </div>

  <div class="totals">
    <div class="box">
      <div class="label">Net position</div>
      <div class="value" style="color:${net >= 0 ? INDIGO : RED};">${net >= 0 ? '+' : '−'}${formatAmount(Math.abs(net), symbol)}</div>
    </div>
    <div class="box">
      <div class="label">Owed to me</div>
      <div class="value" style="color:${AMBER};">${formatAmount(owedToMe, symbol)}</div>
    </div>
    <div class="box">
      <div class="label">I owe</div>
      <div class="value" style="color:${RED};">${formatAmount(iOwe, symbol)}</div>
    </div>
  </div>

  <h2>Open debts</h2>
  ${openRows
    ? `<table>
        <tr><th>Person</th><th>Direction</th><th class="num">Principal</th><th class="num">Repaid</th><th class="num">Outstanding</th><th>From</th><th>Due</th><th>Status</th></tr>
        ${openRows}
      </table>`
    : '<div class="empty">No open debts — a clean slate.</div>'}

  <h2>Settled debts</h2>
  ${settledRows
    ? `<table>
        <tr><th>Person</th><th>Direction</th><th class="num">Principal</th><th>From</th><th>Settled</th></tr>
        ${settledRows}
      </table>`
    : '<div class="empty">Nothing settled yet.</div>'}

  <div class="foot">
    Generated privately on your device by Ụgwọ · ugwo.nippysky.com · A venture by NIPPYSKY
  </div>
</body>
</html>`;
}

// ─── Export + share ───────────────────────────────────────────────────────────

export async function exportStatementPdf(opts: {
  userName:   string;
  persons:    Person[];
  debts:      Debt[];
  repayments: Repayment[];
  symbol:     string;
}): Promise<void> {
  const html = buildStatementHtml(opts);
  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType:            'application/pdf',
      dialogTitle:         'Ụgwọ statement',
      UTI:                 'com.adobe.pdf',
    });
  }
}
