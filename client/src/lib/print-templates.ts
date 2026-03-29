/** Gera o HTML completo da etiqueta de VOLUME para impressão direta no servidor */
export function buildVolumeLabelHtml(params: {
  order: string;
  customer: string;
  city?: string;
  state?: string;
  vol: number | string;
  totalVol: number | string;
  route?: string;
  loadCode?: string;
  operator?: string;
  date?: string;
  company?: string;
}): string {
  const {
    order, customer, city = "", state = "", vol, totalVol,
    route = "", loadCode = "", operator = "", date = new Date().toLocaleDateString("pt-BR"),
    company = "Stoker WMS",
  } = params;
  const destination = [city, state].filter(Boolean).join(" - ");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Etiqueta Volume ${order}</title>
<style>
  @page { size: 10cm 15cm; margin: 4mm; }
  body { margin: 0; font-family: Arial, sans-serif; font-size: 10px; }
  * { box-sizing: border-box; }
  .label { width: 100%; border: 1px solid #333; display: flex; flex-direction: column; min-height: 14cm; }
  .header { background: #1a3a5c; color: white; padding: 5px 8px; display: flex; justify-content: space-between; align-items: center; }
  .header-title { font-weight: bold; font-size: 13px; }
  .header-sub { font-size: 11px; }
  .vol-bar { background: #e8f4fd; border-bottom: 2px solid #1a3a5c; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; }
  .order-label { font-size: 9px; color: #555; }
  .order-num { font-weight: bold; font-size: 18px; }
  .vol-label { font-size: 9px; color: #555; text-align: right; }
  .vol-num { font-weight: bold; font-size: 22px; color: #1a3a5c; text-align: right; }
  .section { padding: 6px 8px; border-bottom: 1px solid #ddd; }
  .sec-label { font-size: 9px; color: #555; margin-bottom: 2px; }
  .customer-name { font-weight: bold; font-size: 13px; line-height: 1.3; }
  .city { font-size: 11px; color: #333; margin-top: 2px; }
  .details { padding: 6px 8px; border-bottom: 1px solid #ddd; display: flex; gap: 12px; }
  .detail-item { flex: 1; }
  .detail-label { font-size: 9px; color: #555; }
  .detail-value { font-weight: bold; font-size: 12px; }
  .barcode-area { padding: 8px; text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; }
  .barcode-placeholder { border: 2px solid #333; padding: 10px 20px; font-family: monospace; font-size: 36px; letter-spacing: 3px; }
  .footer { padding: 6px 8px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-text { font-size: 9px; color: #555; }
</style>
</head>
<body>
<div class="label">
  <div class="header">
    <span class="header-title">${company}</span>
    <span class="header-sub">ETIQUETA DE VOLUME</span>
  </div>
  <div class="vol-bar">
    <div>
      <div class="order-label">PEDIDO</div>
      <div class="order-num">${order}</div>
    </div>
    <div>
      <div class="vol-label">VOLUME</div>
      <div class="vol-num">${vol} / ${totalVol}</div>
    </div>
  </div>
  <div class="section">
    <div class="sec-label">DESTINATÁRIO</div>
    <div class="customer-name">${customer}</div>
    ${destination ? `<div class="city">${destination}</div>` : ""}
  </div>
  ${(loadCode || route) ? `
  <div class="details">
    ${loadCode ? `<div class="detail-item"><div class="detail-label">CARGA</div><div class="detail-value">${loadCode}</div></div>` : ""}
    ${route ? `<div class="detail-item"><div class="detail-label">ROTA</div><div class="detail-value">${route}</div></div>` : ""}
  </div>` : ""}
  <div class="barcode-area">
    <div class="barcode-placeholder">${order}</div>
  </div>
  <div class="footer">
    <div class="footer-text">
      ${operator ? `<div>Operador: <strong>${operator}</strong></div>` : ""}
      <div>Emissão: <strong>${date}</strong></div>
    </div>
    <div style="font-size:9px;color:#555;">VOL:${order}:${vol}/${totalVol}</div>
  </div>
</div>
</body>
</html>`;
}

/** Gera o HTML completo da etiqueta de PALLET para impressão direta no servidor */
export function buildPalletLabelHtml(params: {
  code: string;
  status?: string;
  address?: string;
  items?: string;
  operator?: string;
  date?: string;
  company?: string;
  nf?: string;
  lot?: string;
}): string {
  const {
    code, status = "", address = "", items = "",
    operator = "", date = new Date().toLocaleDateString("pt-BR"),
    company = "Stoker WMS", nf = "", lot = "",
  } = params;

  const STATUS_LABELS: Record<string, string> = {
    sem_endereco: "SEM ENDEREÇO",
    alocado: "ALOCADO",
    em_picking: "EM PICKING",
    concluido: "CONCLUÍDO",
    cancelado: "CANCELADO",
  };
  const statusLabel = STATUS_LABELS[status] ?? status.toUpperCase();
  const statusColor = status === "alocado" ? "#1a7a3a" : status === "cancelado" ? "#c0392b" : "#1a3a5c";

  const itemsRows = items
    ? items.split("|").map((it) => `<div style="font-size:11px;padding:2px 0;">${it.trim()}</div>`).join("")
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Etiqueta Pallet ${code}</title>
<style>
  @page { size: 10cm 15cm; margin: 4mm; }
  body { margin: 0; font-family: Arial, sans-serif; font-size: 10px; }
  * { box-sizing: border-box; }
  .label { width: 100%; border: 1px solid #333; display: flex; flex-direction: column; min-height: 14cm; }
  .header { background: #1a3a5c; color: white; padding: 5px 8px; display: flex; justify-content: space-between; align-items: center; }
  .code-bar { background: #e8f4fd; border-bottom: 2px solid ${statusColor}; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; }
  .code-label { font-size: 9px; color: #555; }
  .code-value { font-weight: bold; font-size: 22px; color: #1a3a5c; }
  .status-badge { background: ${statusColor}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
  .section { padding: 6px 8px; border-bottom: 1px solid #ddd; }
  .sec-label { font-size: 9px; color: #555; margin-bottom: 2px; }
  .address-value { font-weight: bold; font-size: 16px; letter-spacing: 1px; }
  .barcode-area { padding: 8px; text-align: center; display: flex; align-items: center; justify-content: center; }
  .barcode-placeholder { border: 2px solid #333; padding: 8px 16px; font-size: 28px; font-family: monospace; letter-spacing: 3px; }
  .footer { padding: 6px 8px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-text { font-size: 9px; color: #555; }
</style>
</head>
<body>
<div class="label">
  <div class="header">
    <span style="font-weight:bold;font-size:13px;">${company}</span>
    <span style="font-size:11px;">ETIQUETA DE PALLET</span>
  </div>
  <div class="code-bar">
    <div>
      <div class="code-label">CÓDIGO DO PALLET</div>
      <div class="code-value">${code}</div>
    </div>
    ${statusLabel ? `<div class="status-badge">${statusLabel}</div>` : ""}
  </div>
  ${address ? `
  <div class="section" style="background:#fffbe6;">
    <div class="sec-label">ENDEREÇO WMS</div>
    <div class="address-value">${address}</div>
  </div>` : ""}
  ${items ? `
  <div class="section" style="flex:1;">
    <div class="sec-label">CONTEÚDO</div>
    ${itemsRows}
  </div>` : ""}
  ${(nf || lot) ? `
  <div class="section" style="display:flex;gap:12px;">
    ${nf ? `<div style="flex:1;"><div class="sec-label">NF</div><div style="font-weight:bold;font-size:12px;">${nf}</div></div>` : ""}
    ${lot ? `<div style="flex:1;"><div class="sec-label">LOTE</div><div style="font-weight:bold;font-size:12px;">${lot}</div></div>` : ""}
  </div>` : ""}
  <div class="barcode-area">
    <div class="barcode-placeholder">${code}</div>
  </div>
  <div class="footer">
    <div class="footer-text">
      ${operator ? `<div>Operador: <strong>${operator}</strong></div>` : ""}
      <div>Emissão: <strong>${date}</strong></div>
    </div>
    <div style="font-size:9px;color:#555;">PAL:${code}${address ? `:${address}` : ""}</div>
  </div>
</div>
</body>
</html>`;
}
