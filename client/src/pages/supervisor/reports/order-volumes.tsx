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

    const addressLine = [vol.address, vol.addressNumber ? `nº ${vol.addressNumber}` : ""].filter(Boolean).join(", ");
    const cityLine = [vol.city, vol.state].filter(Boolean).join(" - ");

    const labels = Array.from({ length: vol.totalVolumes }, (_, i) => {
        const volNum = i + 1;
        const barcode = `${vol.erpOrderId}${String(volNum).padStart(3, "0")}`;
        return `
<div class="label">
  <div class="hdr">
    <div class="hdr-left">
      <div class="hdr-tag">PEDIDO</div>
      <div class="hdr-os">${e(vol.erpOrderId)}</div>
    </div>
    <div class="hdr-right">
      <div class="hdr-tag" style="text-align:right">VOLUME</div>
      <div class="hdr-vol">${volNum}<span class="hdr-vol-total"> / ${vol.totalVolumes}</span></div>
    </div>
  </div>

  <div class="two-col">
    <div class="col-cell">
      <div class="field-label">ROTA ID</div>
      <div class="col-val">${e(vol.routeCode) || "—"}</div>
    </div>
    <div class="col-cell col-right">
      <div class="field-label" style="text-align:right">PACOTE ID</div>
      <div class="col-val" style="text-align:right">${volNum}</div>
    </div>
  </div>

  <div class="section customer-section">
    <div class="field-label">DESTINATÁRIO</div>
    <div class="customer-name">${e(vol.customerName) || "—"}</div>
    ${addressLine ? `<div class="address-line">${e(addressLine)}</div>` : ""}
    ${vol.neighborhood ? `<div class="address-line">${e(vol.neighborhood)}</div>` : ""}
    ${cityLine ? `<div class="address-line city-line">${e(cityLine)}</div>` : ""}
  </div>

  <div class="pkg-row">
    <div class="pkg-cell"><div class="pkg-label">SACOLA</div><div class="pkg-val">${vol.sacola}</div></div>
    <div class="pkg-cell"><div class="pkg-label">CAIXA</div><div class="pkg-val">${vol.caixa}</div></div>
    <div class="pkg-cell"><div class="pkg-label">SACO</div><div class="pkg-val">${vol.saco}</div></div>
    <div class="pkg-cell"><div class="pkg-label">AVULSO</div><div class="pkg-val">${vol.avulso}</div></div>
  </div>

  <div class="volume-center">
    <div class="vol-label">VOLUME</div>
    <div class="vol-num">${volNum}<span class="vol-total"> / ${vol.totalVolumes}</span></div>
  </div>

  <div class="footer">
    <div class="footer-row">
      <div class="footer-item">
        <span class="footer-label">CONFERIDO POR</span>
        <span class="footer-val">—</span>
      </div>
      <div class="footer-item footer-right">
        <span class="footer-label">DATA/HORA</span>
        <span class="footer-val">${e(createdAt)}</span>
      </div>
    </div>
  </div>

  <div class="barcode-area">
    <div class="barcode">${e(barcode)}</div>
  </div>
</div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128+Text&display=swap" rel="stylesheet">
<style>
@page { size: 10cm 15cm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; background: #fff; font-size: 11px; color: #000; }
.label { width: 10cm; height: 15cm; border: 1.5px solid #000; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
.label:last-child { page-break-after: avoid; }

.hdr { background: #111; color: #fff; display: flex; justify-content: space-between; align-items: flex-end; padding: 5px 8px; border-bottom: 2px solid #000; }
.hdr-left, .hdr-right { display: flex; flex-direction: column; }
.hdr-right { align-items: flex-end; }
.hdr-tag { font-size: 8px; color: #aaa; letter-spacing: .5px; text-transform: uppercase; }
.hdr-os { font-size: 18px; font-weight: bold; line-height: 1; }
.hdr-vol { font-size: 32px; font-weight: 900; line-height: 1; }
.hdr-vol-total { font-size: 16px; font-weight: 400; color: #aaa; }

.two-col { display: flex; border-bottom: 1px solid #ccc; }
.col-cell { flex: 1; padding: 4px 8px; }
.col-right { border-left: 1px solid #ccc; }
.field-label { font-size: 7.5px; color: #777; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 1px; }
.col-val { font-size: 13px; font-weight: bold; }

.section { padding: 5px 8px; border-bottom: 1px solid #ccc; }
.customer-section { background: #f7faff; }
.customer-name { font-size: 13px; font-weight: bold; line-height: 1.2; margin-bottom: 2px; }
.address-line { font-size: 10px; color: #333; line-height: 1.3; }
.city-line { font-weight: 600; }

.volume-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-bottom: 1px solid #ccc; padding: 4px; }
.vol-label { font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 1px; }
.vol-num { font-size: 52px; font-weight: 900; line-height: 1; color: #111; }
.vol-total { font-size: 26px; font-weight: 400; color: #555; }

.footer { padding: 5px 8px; background: #f0f4f8; border-bottom: 1px solid #ccc; }
.footer-row { display: flex; justify-content: space-between; align-items: flex-start; }
.footer-item { display: flex; flex-direction: column; }
.footer-right { align-items: flex-end; }
.footer-label { font-size: 7.5px; color: #888; text-transform: uppercase; }
.footer-val { font-size: 10px; font-weight: bold; color: #111; }

.pkg-row { display: flex; border-bottom: 1px solid #ccc; background: #fafafa; }
.pkg-cell { flex: 1; padding: 3px 4px; text-align: center; border-right: 1px solid #ccc; }
.pkg-cell:last-child { border-right: 0; }
.pkg-label { font-size: 7px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
.pkg-val { font-size: 15px; font-weight: 900; color: #111; }
.barcode-area { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px 8px 3px; }
.barcode { font-family: 'Libre Barcode 128 Text', monospace; font-size: 48px; line-height: 1; white-space: nowrap; max-width: 100%; overflow: hidden; }
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
                        <h1 className="text-3xl font-bold text-white">Etiquetas de Volume</h1>
                        <p className="text-white/80">Visualize e reimprima etiquetas geradas na conferência</p>
                    </div>
                    <Link href="/supervisor/reports">
                        <Button variant="ghost" className="text-white hover:bg-white/10">
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
