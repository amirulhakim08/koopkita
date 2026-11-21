import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate, formatRM, senToDecimal } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import { logoUrl } from "@/lib/storage-url";
import type { DocumentJson } from "./types";

const GREEN = "#1b4332";
const MUTED = "#5c6b62";
const BORDER = "#dfe6de";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#142019" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  brand: { flexDirection: "row", gap: 10, maxWidth: 340, flexShrink: 1 },
  logo: { width: 56, height: 56, objectFit: "contain" },
  bizName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: GREEN },
  small: { fontSize: 8.5, color: MUTED, lineHeight: 1.4 },
  docTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", color: GREEN, textAlign: "right" },
  docNo: { fontSize: 10, textAlign: "right", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14, gap: 16 },
  box: { flexGrow: 1, flexBasis: 0, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 10 },
  label: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", marginBottom: 3, letterSpacing: 0.4 },
  bold: { fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 6, paddingHorizontal: 8 },
  th: { backgroundColor: "#f1f5f0", fontSize: 8, color: MUTED, fontFamily: "Helvetica-Bold" },
  cNo: { width: 24, color: MUTED },
  cDesc: { flexGrow: 1, flexBasis: 0 },
  cNum: { width: 62, textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 230, marginTop: 10 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: { borderTopWidth: 1.5, borderTopColor: GREEN, marginTop: 4, paddingTop: 6, fontSize: 12, fontFamily: "Helvetica-Bold", color: GREEN },
  pay: { marginTop: 18, backgroundColor: "#f1f6ee", borderRadius: 6, padding: 10 },
  stampWrap: { alignSelf: "flex-end", marginTop: 8, transform: "rotate(-6deg)" },
  stamp: { borderWidth: 2.5, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 10, fontSize: 15, fontFamily: "Helvetica-Bold" },
  foot: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 7.5, color: MUTED, textAlign: "center" },
  verified: { fontSize: 8, color: "#2d6a4f", fontFamily: "Helvetica-Bold" },
});

export async function loadLogo(path: string | null | undefined): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  const url = logoUrl(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const format = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : null;
    if (!format) return null;
    return { data: Buffer.from(await res.arrayBuffer()), format };
  } catch {
    return null;
  }
}

function Stamp({ text, color }: { text: string; color: string }) {
  return (
    <View style={s.stampWrap}>
      <Text style={[s.stamp, { color, borderColor: color }]}>{text}</Text>
    </View>
  );
}

const qty = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));

function BusinessDoc({ doc, logo }: { doc: DocumentJson; logo: Awaited<ReturnType<typeof loadLogo>> }) {
  const inv = doc.invoice;
  const b = inv.business;
  const isReceipt = doc.kind === "receipt" && doc.payment;
  const isQuote = doc.kind === "quote";
  const p = doc.payment;
  const title = isReceipt ? "RESIT" : isQuote ? "SEBUT HARGA" : "INVOIS";
  const validDays = isQuote ? Math.round((Date.parse(`${inv.due_date}T00:00:00Z`) - Date.parse(`${inv.issue_date}T00:00:00Z`)) / 86_400_000) : 0;
  const number = isReceipt ? p!.receipt_no : inv.invoice_no ?? "DRAF";
  const balance = inv.total_sen - inv.paid_sen;
  const direct = Boolean(isReceipt && inv.is_direct); // receipt of a sale paid on the spot: shows its items, no invoice
  const paidBefore = isReceipt && !direct ? Math.max(0, inv.total_sen - p!.balance_after_sen - p!.amount_sen) : 0;
  return (
    <Document title={`${title} ${number}`} author={b.name} creator="KoopKITA">
      <Page size="A4" style={s.page}>

        <View style={s.head}>
          <View style={s.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo && <Image style={s.logo} src={logo} />}
            <View>
              <Text style={s.bizName}>{b.name}</Text>
              {b.ssm_no && <Text style={s.small}>No. SSM: {b.ssm_no}{b.ssm_verified ? "  " : ""}{b.ssm_verified && <Text style={s.verified}>(Disahkan)</Text>}</Text>}
              {b.address && <Text style={s.small}>{b.address}</Text>}
              <Text style={s.small}>Tel: {b.phone}{b.email ? `  ·  ${b.email}` : ""}</Text>
              {b.sst_reg_no && <Text style={s.small}>No. SST: {b.sst_reg_no}</Text>}
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.docNo}>{number}</Text>
            {isQuote && inv.status !== "draft" && (inv.overdue
              ? <Stamp text="TAMAT TEMPOH" color="#9a6b00" />
              : <Stamp text={`SAH ${validDays} HARI`} color="#1d4f91" />)}
            {inv.status === "cancelled" && !isReceipt && <Stamp text="DIBATALKAN" color="#b42318" />}
            {inv.status === "draft" && <Stamp text="DRAF" color="#9a6b00" />}
            {isReceipt && (p!.reversed ? <Stamp text="DIBALIKKAN" color="#b42318" /> : <Stamp text="DIBAYAR" color="#2d6a4f" />)}
            {!isReceipt && inv.status === "paid" && <Stamp text="DIBAYAR" color="#2d6a4f" />}
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={s.box}>
            <Text style={s.label}>{isReceipt ? "Diterima daripada" : "Kepada"}</Text>
            <Text style={s.bold}>{inv.customer.name}</Text>
            {inv.customer.address && <Text style={s.small}>{inv.customer.address}</Text>}
            {(inv.customer.phone || inv.customer.email) && <Text style={s.small}>{[inv.customer.phone, inv.customer.email].filter(Boolean).join("  ·  ")}</Text>}
          </View>
          <View style={s.box}>
            {isReceipt ? (
              <>
                <Text style={s.label}>Butiran bayaran</Text>
                <Text>Tarikh: {formatDate(p!.paid_on)}</Text>
                <Text>Kaedah: {PAYMENT_METHODS[p!.method] ?? p!.method}</Text>
                {p!.reference && <Text>Rujukan: {p!.reference}</Text>}
                {!direct && <Text>Untuk invois: {inv.invoice_no}</Text>}
              </>
            ) : isQuote ? (
              <>
                <Text style={s.label}>Butiran sebut harga</Text>
                <Text>Tarikh: {formatDate(inv.issue_date)}</Text>
                <Text>Sah sehingga: {formatDate(inv.due_date)}</Text>
              </>
            ) : (
              <>
                <Text style={s.label}>Butiran invois</Text>
                <Text>Tarikh invois: {formatDate(inv.issue_date)}</Text>
                <Text>Tarikh akhir: {formatDate(inv.due_date)}</Text>
                <Text>Status: {inv.status === "paid" ? "Dibayar" : inv.status === "partially_paid" ? "Dibayar separa" : inv.status === "cancelled" ? "Dibatalkan" : inv.overdue ? "Lewat bayar" : "Belum dibayar"}</Text>
              </>
            )}
          </View>
        </View>

        {inv.scope && !isReceipt && (
          <View style={[s.box, { flexGrow: 0, flexBasis: "auto", marginBottom: 12 }]}>
            <Text style={s.label}>Skop kerja</Text><Text>{inv.scope}</Text>
          </View>
        )}
        {isReceipt && !direct && <Text style={[s.label, { marginBottom: 4 }]}>Butiran invois {inv.invoice_no}</Text>}
        {(
          <View style={s.table}>
            <View style={[s.tr, s.th]}>
              <Text style={s.cNo}>No.</Text><Text style={s.cDesc}>Perkara</Text><Text style={s.cNum}>Unit</Text><Text style={s.cNum}>Harga</Text><Text style={s.cNum}>Diskaun</Text><Text style={s.cNum}>Jumlah</Text>
            </View>
            {inv.items.map((it, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={s.cNo}>{i + 1}</Text>
                <Text style={s.cDesc}>{it.description}</Text>
                <Text style={s.cNum}>{qty(it.quantity)}</Text>
                <Text style={s.cNum}>{senToDecimal(it.unit_price_sen)}</Text>
                <Text style={s.cNum}>{it.discount_sen ? senToDecimal(it.discount_sen) : "-"}</Text>
                <Text style={s.cNum}>{senToDecimal(it.line_total_sen)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.totals}>
          {direct ? (
            <>
              <View style={s.totRow}><Text>Subjumlah</Text><Text>{formatRM(inv.subtotal_sen)}</Text></View>
              {inv.discount_sen > 0 && <View style={s.totRow}><Text>Diskaun</Text><Text>-{formatRM(inv.discount_sen)}</Text></View>}
              {inv.tax_sen > 0 && <View style={s.totRow}><Text>SST ({inv.tax_rate_bp / 100}%)</Text><Text>{formatRM(inv.tax_sen)}</Text></View>}
              <View style={[s.totRow, s.grand]}><Text>Jumlah diterima</Text><Text>{formatRM(p!.amount_sen)}</Text></View>
            </>
          ) : isReceipt ? (
            <>
              <View style={s.totRow}><Text>Subjumlah</Text><Text>{formatRM(inv.subtotal_sen)}</Text></View>
              {inv.discount_sen > 0 && <View style={s.totRow}><Text>Diskaun</Text><Text>-{formatRM(inv.discount_sen)}</Text></View>}
              {inv.tax_sen > 0 && <View style={s.totRow}><Text>SST ({inv.tax_rate_bp / 100}%)</Text><Text>{formatRM(inv.tax_sen)}</Text></View>}
              <View style={[s.totRow, s.bold]}><Text>Jumlah invois {inv.invoice_no}</Text><Text>{formatRM(inv.total_sen)}</Text></View>
              {paidBefore > 0 && <View style={s.totRow}><Text>Telah dibayar sebelum ini</Text><Text>-{formatRM(paidBefore)}</Text></View>}
              <View style={[s.totRow, s.grand]}><Text>Jumlah diterima</Text><Text>{formatRM(p!.amount_sen)}</Text></View>
              <View style={s.totRow}><Text style={s.small}>Baki invois selepas bayaran ini</Text><Text style={s.small}>{formatRM(Math.max(0, p!.balance_after_sen))}</Text></View>
            </>
          ) : (
            <>
              <View style={s.totRow}><Text>Subjumlah</Text><Text>{formatRM(inv.subtotal_sen)}</Text></View>
              {inv.discount_sen > 0 && <View style={s.totRow}><Text>Diskaun</Text><Text>-{formatRM(inv.discount_sen)}</Text></View>}
              {inv.tax_sen > 0 && <View style={s.totRow}><Text>SST ({inv.tax_rate_bp / 100}%)</Text><Text>{formatRM(inv.tax_sen)}</Text></View>}
              <View style={[s.totRow, s.grand]}><Text>Jumlah</Text><Text>{formatRM(inv.total_sen)}</Text></View>
              {inv.paid_sen > 0 && (
                <>
                  <View style={s.totRow}><Text>Telah dibayar</Text><Text>-{formatRM(inv.paid_sen)}</Text></View>
                  <View style={[s.totRow, s.bold]}><Text>Baki</Text><Text>{formatRM(balance)}</Text></View>
                </>
              )}
            </>
          )}
        </View>

        {inv.terms && !isReceipt && (
          <View style={s.pay}><Text style={s.label}>Terma &amp; syarat</Text><Text>{inv.terms}</Text></View>
        )}
        {!isReceipt && !isQuote && inv.status !== "cancelled" && inv.status !== "paid" && b.bank_account_no && (
          <View style={s.pay}>
            <Text style={s.label}>Cara bayaran</Text>
            <Text>Bank: <Text style={s.bold}>{b.bank_name ?? "-"}</Text>   No. akaun: <Text style={s.bold}>{b.bank_account_no}</Text></Text>
            <Text>Nama akaun: {b.bank_account_holder ?? b.name}</Text>
            <Text style={s.small}>Sila nyatakan {inv.invoice_no} sebagai rujukan bayaran.</Text>
          </View>
        )}
        {inv.notes && (!isReceipt || direct) && (
          <View style={{ marginTop: 12 }}><Text style={s.label}>Catatan</Text><Text>{inv.notes}</Text></View>
        )}
        {inv.status === "cancelled" && inv.cancel_reason && !isReceipt && (
          <View style={{ marginTop: 12 }}><Text style={[s.label, { color: "#b42318" }]}>Sebab pembatalan</Text><Text>{inv.cancel_reason}</Text></View>
        )}
        {isReceipt && p!.reversed && (
          <View style={{ marginTop: 12 }}><Text style={[s.label, { color: "#b42318" }]}>Resit ini telah dibalikkan</Text><Text>{p!.reverse_reason}</Text></View>
        )}

        <Text style={s.foot} fixed>
          {isReceipt ? "Resit ini dijana oleh komputer dan tidak memerlukan tandatangan." : isQuote ? "Sebut harga ini dijana oleh komputer." : "Invois ini dijana oleh komputer."} · {b.name} · Dijana melalui KoopKITA
        </Text>
      </Page>
    </Document>
  );
}

export async function renderBusinessPdf(doc: DocumentJson): Promise<Buffer> {
  const logo = await loadLogo(doc.invoice.business.logo_path);
  return renderToBuffer(<BusinessDoc doc={doc} logo={logo} />);
}

export function documentFileName(doc: DocumentJson): string {
  const n = doc.kind === "receipt" && doc.payment ? doc.payment.receipt_no : doc.invoice.invoice_no ?? "DRAF";
  return `${doc.kind === "receipt" ? "Resit" : doc.kind === "quote" ? "SebutHarga" : "Invois"}-${n}.pdf`;
}

export function pdfResponse(buffer: Buffer, fileName: string, inline = true): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
