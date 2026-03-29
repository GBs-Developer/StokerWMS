import { useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { QRCodeSVG } from "qrcode.react";

/**
 * Página de etiqueta de VOLUME — aberta em nova aba, imprime automaticamente.
 *
 * Parâmetros de URL (query string):
 *   order       — número do pedido ERP
 *   customer    — nome do cliente
 *   city        — cidade
 *   state       — UF
 *   vol         — número do volume atual
 *   totalVol    — total de volumes do pedido
 *   route       — nome/código da rota (opcional)
 *   loadCode    — código de carga (opcional)
 *   operator    — nome do operador (opcional)
 *   date        — data de emissão (opcional, padrão = hoje)
 *   company     — nome da empresa (opcional)
 */
export default function VolumeLabelPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);

  const order    = params.get("order")    ?? "—";
  const customer = params.get("customer") ?? "—";
  const city     = params.get("city")     ?? "";
  const state    = params.get("state")    ?? "";
  const vol      = params.get("vol")      ?? "1";
  const totalVol = params.get("totalVol") ?? "1";
  const route    = params.get("route")    ?? "";
  const loadCode = params.get("loadCode") ?? "";
  const operator = params.get("operator") ?? "";
  const date     = params.get("date")     ?? new Date().toLocaleDateString("pt-BR");
  const company  = params.get("company")  ?? "Stoker WMS";

  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (barcodeRef.current && order !== "—") {
      import("jsbarcode").then(({ default: JsBarcode }) => {
        JsBarcode(barcodeRef.current!, order, {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: true,
          fontOptions: "bold",
          fontSize: 14,
          margin: 4,
        });
      });
    }
  }, [order]);

  useEffect(() => {
    const timeout = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timeout);
  }, []);

  const destination = [city, state].filter(Boolean).join(" - ");

  return (
    <>
      <style>{`
        @page {
          size: 10cm 15cm;
          margin: 4mm;
        }
        body {
          margin: 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          background: white;
          color: black;
        }
        * { box-sizing: border-box; }
        @media screen {
          body { padding: 8px; background: #f0f0f0; }
          .label { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
        }
      `}</style>

      <div className="label" style={{
        width: "100%",
        maxWidth: "10cm",
        minHeight: "15cm",
        background: "white",
        border: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        margin: "0 auto",
      }}>
        {/* Cabeçalho */}
        <div style={{
          background: "#1a3a5c",
          color: "white",
          padding: "5px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontWeight: "bold", fontSize: 13 }}>{company}</span>
          <span style={{ fontSize: 11 }}>ETIQUETA DE VOLUME</span>
        </div>

        {/* Volume destaque */}
        <div style={{
          background: "#e8f4fd",
          borderBottom: "2px solid #1a3a5c",
          padding: "6px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 9, color: "#555" }}>PEDIDO</div>
            <div style={{ fontWeight: "bold", fontSize: 18 }}>{order}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "#555" }}>VOLUME</div>
            <div style={{ fontWeight: "bold", fontSize: 22, color: "#1a3a5c" }}>
              {vol} / {totalVol}
            </div>
          </div>
        </div>

        {/* Destinatário */}
        <div style={{ padding: "6px 8px", borderBottom: "1px solid #ddd" }}>
          <div style={{ fontSize: 9, color: "#555", marginBottom: 2 }}>DESTINATÁRIO</div>
          <div style={{ fontWeight: "bold", fontSize: 13, lineHeight: 1.3 }}>{customer}</div>
          {destination && (
            <div style={{ fontSize: 11, color: "#333", marginTop: 2 }}>{destination}</div>
          )}
        </div>

        {/* Detalhes */}
        <div style={{ padding: "6px 8px", borderBottom: "1px solid #ddd", display: "flex", gap: 12 }}>
          {loadCode && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "#555" }}>CARGA</div>
              <div style={{ fontWeight: "bold", fontSize: 12 }}>{loadCode}</div>
            </div>
          )}
          {route && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "#555" }}>ROTA</div>
              <div style={{ fontWeight: "bold", fontSize: 12 }}>{route}</div>
            </div>
          )}
        </div>

        {/* Código de barras */}
        <div style={{ padding: "8px", textAlign: "center", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg ref={barcodeRef} style={{ maxWidth: "100%", height: "auto" }} />
        </div>

        {/* QR + Rodapé */}
        <div style={{
          padding: "6px 8px",
          borderTop: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}>
          <div style={{ fontSize: 9, color: "#555" }}>
            {operator && <div>Operador: <strong>{operator}</strong></div>}
            <div>Emissão: <strong>{date}</strong></div>
          </div>
          <QRCodeSVG
            value={`VOL:${order}:${vol}/${totalVol}`}
            size={56}
            level="M"
          />
        </div>
      </div>
    </>
  );
}

/** Gera o HTML completo da etiqueta de volume para impressão direta no servidor */
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
  .barcode-placeholder { border: 2px solid #333; padding: 10px 20px; font-family: 'Libre Barcode 128', monospace; font-size: 36px; letter-spacing: 3px; }
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
