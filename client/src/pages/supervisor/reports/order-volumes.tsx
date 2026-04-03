import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, PackageOpen, ShoppingBag, Archive, Box, Tag } from "lucide-react";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OrderVolume {
    id: string;
    orderId: string;
    erpOrderId: string;
    sacola: number;
    caixa: number;
    saco: number;
    avulso: number;
    totalVolumes: number;
    createdAt: string;
    updatedAt: string;
    customerName?: string;
    address?: string;
    addressNumber?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    routeCode?: string;
}

const e = (s?: string | null) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildReimpressaoHtml(vol: OrderVolume): string {
    const createdAt = vol.createdAt
        ? format(new Date(vol.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
        : format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

    const route = e(vol.routeCode) || "—";
    const addressParts = [vol.address, vol.addressNumber ? `nº ${vol.addressNumber}` : ""].filter(Boolean).join(", ");
    const cityLine = [vol.city, vol.state].filter(Boolean).join(" - ");

    const labels = Array.from({ length: vol.totalVolumes }, (_, i) => {
        const volNum = i + 1;
        const barcode = `${vol.erpOrderId}${String(volNum).padStart(3, "0")}`;
        return `
<div class="label">

  <!-- HERO: PEDIDO (esq.) + VOLUME (dir.) -->
  <div class="hero">
    <div class="hero-left">
      <div class="hero-tag">PEDIDO</div>
      <div class="hero-order">${e(vol.erpOrderId)}</div>
      <div class="hero-rota">ROTA&nbsp;&nbsp;${route}</div>
    </div>
    <div class="hero-divider"></div>
    <div class="hero-right">
      <div class="hero-tag" style="text-align:right">VOLUME</div>
      <div class="hero-vol">${volNum}<span class="hero-vol-total">/${vol.totalVolumes}</span></div>
    </div>
  </div>

  <!-- DESTINATÁRIO -->
  <div class="customer-section">
    <div class="field-label">DESTINATÁRIO</div>
    <div class="customer-name">${e(vol.customerName) || "—"}</div>
    ${addressParts ? `<div class="address-line">${e(addressParts)}</div>` : ""}
    ${vol.neighborhood ? `<div class="address-line">${e(vol.neighborhood)}</div>` : ""}
    ${cityLine ? `<div class="address-line city-line">${e(cityLine)}</div>` : ""}
  </div>

  <!-- INFO STRIP: ROTA | SACOLA | CAIXA | SACO | AVULSO -->
  <div class="info-strip">
    <div class="info-cell"><div class="info-lbl">ROTA</div><div class="info-val">${route}</div></div>
    <div class="info-cell"><div class="info-lbl">SACOLA</div><div class="info-val">${vol.sacola}</div></div>
    <div class="info-cell"><div class="info-lbl">CAIXA</div><div class="info-val">${vol.caixa}</div></div>
    <div class="info-cell"><div class="info-lbl">SACO</div><div class="info-val">${vol.saco}</div></div>
    <div class="info-cell"><div class="info-lbl">AVULSO</div><div class="info-val">${vol.avulso}</div></div>
  </div>

  <!-- CÓDIGO DE BARRAS -->
  <div class="barcode-area">
    <div class="barcode">${e(barcode)}</div>
  </div>

  <!-- RODAPÉ -->
  <div class="footer">
    <div class="footer-col">
      <span class="footer-lbl">CONFERIDO POR</span>
      <span class="footer-val">—</span>
    </div>
    <div class="footer-col footer-right">
      <span class="footer-lbl">DATA/HORA</span>
      <span class="footer-val">${e(createdAt)}</span>
    </div>
  </div>

</div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet">
<style>
@page { size: 10cm 15cm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; background: #fff; color: #000; }
.label { width: 10cm; height: 15cm; border: 1.5px solid #000; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
.label:last-child { page-break-after: avoid; }

/* ── HERO (55mm) ─────────────────────────────────────────── */
.hero { background: #111; color: #fff; display: flex; height: 55mm; flex-shrink: 0; }
.hero-left  { flex: 1; padding: 7px 8px 7px 8px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.hero-right { flex: 1; padding: 7px 8px 7px 0;   display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; overflow: hidden; }
.hero-divider { width: 1px; background: #2a2a2a; margin: 7px 0; flex-shrink: 0; }
.hero-tag  { font-size: 7.5px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
.hero-order { font-size: 36px; font-weight: 900; line-height: 1; word-break: break-all; }
.hero-rota  { font-size: 9px; color: #666; }
.hero-vol   { font-size: 62px; font-weight: 900; line-height: 1; word-break: break-all; text-align: right; }
.hero-vol-total { font-size: 30px; font-weight: 400; color: #999; }

/* ── DESTINATÁRIO (30mm) ──────────────────────────────────── */
.customer-section { background: #f5f8ff; padding: 6px 8px; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; height: 30mm; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.field-label  { font-size: 6.5px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
.customer-name { font-size: 13px; font-weight: bold; line-height: 1.15; }
.address-line  { font-size: 9.5px; color: #333; line-height: 1.25; }
.city-line     { font-weight: 600; }

/* ── INFO STRIP (16mm) ────────────────────────────────────── */
.info-strip { display: flex; height: 16mm; flex-shrink: 0; background: #eee; border-bottom: 1px solid #ccc; }
.info-cell  { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-right: 1px solid #ccc; }
.info-cell:last-child { border-right: 0; }
.info-lbl { font-size: 6px; color: #888; text-transform: uppercase; letter-spacing: .3px; }
.info-val { font-size: 12px; font-weight: 900; color: #111; }

/* ── BARCODE (flex: 1 → ~35mm) ───────────────────────────── */
.barcode-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 6px; min-height: 30mm; }
.barcode { font-family: 'Libre Barcode 128 Text', monospace; font-size: 58px; line-height: 1; white-space: nowrap; max-width: 100%; overflow: hidden; }

/* ── RODAPÉ (14mm) ────────────────────────────────────────── */
.footer { background: #f0f4f8; padding: 5px 8px; border-top: 1px solid #ccc; display: flex; justify-content: space-between; height: 14mm; align-items: center; flex-shrink: 0; }
.footer-col { display: flex; flex-direction: column; gap: 2px; }
.footer-right { align-items: flex-end; }
.footer-lbl { font-size: 6px; color: #888; text-transform: uppercase; letter-spacing: .3px; }
.footer-val { font-size: 9.5px; font-weight: bold; color: #111; }
</style>
<script>window.onload = function() { window.print(); }</script>
</head><body>${labels}</body></html>`;
}

export default function OrderVolumesReport() {
    const { toast } = useToast();
    const [printingId, setPrintingId] = useState<string | null>(null);

    const { data: volumes, isLoading } = useQuery<OrderVolume[]>({
        queryKey: ["/api/order-volumes"],
    });

    const handlePrint = (vol: OrderVolume) => {
        setPrintingId(vol.id);
        const html = buildReimpressaoHtml(vol);
        const win = window.open("", "_blank");
        if (win) {
            win.document.write(html);
            win.document.close();
            toast({ title: "Etiquetas geradas!", description: `${vol.totalVolumes} etiqueta(s) do pedido ${vol.erpOrderId}.` });
        }
        setPrintingId(null);
    };

    const formatDate = (dateStr: string) => {
        try { return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
        catch { return dateStr; }
    };

    return (
        <div className="min-h-screen bg-background">
            <GradientHeader>
                <div className="flex items-center justify-between w-full">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Etiquetas de Volume</h1>
                        <p className="text-muted-foreground">Visualize e reimprima etiquetas geradas na conferência</p>
                    </div>
                    <Link href="/supervisor/reports">
                        <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Voltar
                        </Button>
                    </Link>
                </div>
            </GradientHeader>

            <div className="p-6 max-w-4xl mx-auto">
                {isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : !volumes || volumes.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
                            <PackageOpen className="h-12 w-12 mb-4 opacity-20" />
                            <p>Nenhuma etiqueta de volume gerada ainda.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {volumes.map(vol => (
                            <Card key={vol.id} className="border border-orange-100 dark:border-orange-900/30">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-4 flex-wrap">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-base">{vol.erpOrderId}</span>
                                                <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded text-xs font-semibold">
                                                    {vol.totalVolumes} vol
                                                </span>
                                                {vol.routeCode && (
                                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-xs">
                                                        Rota {vol.routeCode}
                                                    </span>
                                                )}
                                            </div>
                                            {vol.customerName && (
                                                <div className="text-sm font-medium text-foreground">{vol.customerName}</div>
                                            )}
                                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                                {vol.sacola > 0 && <span><ShoppingBag className="inline h-3 w-3 mr-0.5" />Sacola: {vol.sacola}</span>}
                                                {vol.caixa > 0 && <span><Box className="inline h-3 w-3 mr-0.5" />Caixa: {vol.caixa}</span>}
                                                {vol.saco > 0 && <span><Archive className="inline h-3 w-3 mr-0.5" />Saco: {vol.saco}</span>}
                                                {vol.avulso > 0 && <span><Tag className="inline h-3 w-3 mr-0.5" />Avulso: {vol.avulso}</span>}
                                            </div>
                                            <div className="text-xs text-muted-foreground">Gerado em: {formatDate(vol.createdAt)}</div>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                                            onClick={() => handlePrint(vol)}
                                            disabled={printingId === vol.id}
                                            data-testid={`btn-reprint-${vol.id}`}
                                        >
                                            {printingId === vol.id
                                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                : <PackageOpen className="h-4 w-4 mr-2" />
                                            }
                                            Reimprimir
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
