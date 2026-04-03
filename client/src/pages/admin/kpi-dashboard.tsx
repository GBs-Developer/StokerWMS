import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft, Users, Clock, Package, AlertTriangle, CheckCircle2,
  TrendingUp, Minus, BarChart3, Trophy,
  ChevronDown, ChevronUp, RefreshCw, Boxes, Zap, Timer, Target,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line, Legend,
} from "recharts";

interface WorkUnitDetalhe {
  orderId: string;
  type: "separacao" | "conferencia";
  section: string | null;
  completedAt: string;
  duracaoMin: number | null;
}

interface DiarioItem {
  dia: string;
  sep: number;
  conf: number;
  tempoMedioSep: number | null;
}

interface OperatorKPI {
  userId: string;
  userName: string;
  username: string;
  role: string;
  pedidosSeparados: number;
  pedidosAndamento: number;
  tempoMedioSepMin: number | null;
  tempoMinSepMin: number | null;
  tempoMaxSepMin: number | null;
  tempoP50SepMin: number | null;
  pedidosConferidos: number;
  tempoMedioConfMin: number | null;
  tempoMinConfMin: number | null;
  tempoMaxConfMin: number | null;
  totalItens: number;
  totalQtyPicked: number;
  totalQtyEsperada: number;
  itensExcedidos: number;
  totalExcecoes: number;
  taxaExcecao: number;
  excNaoEncontrado: number;
  excAvariado: number;
  excVencido: number;
  pedidosComVolume: number;
  totalVolumes: number;
  diario: DiarioItem[];
  workUnitsDetalhe: WorkUnitDetalhe[];
}

interface GlobalDailyItem {
  dia: string;
  sep: number;
  conf: number;
  tempoMedioSep: number | null;
}

interface KPIResponse {
  operators: OperatorKPI[];
  from: string;
  to: string;
  companyId: number;
  dailyGlobal: GlobalDailyItem[];
}

const ROLE_LABELS: Record<string, string> = {
  separacao: "Separação",
  conferencia: "Conferência",
  supervisor: "Supervisor",
  administrador: "Admin",
  balcao: "Balcão",
  recebedor: "Recebedor",
  empilhador: "Empilhador",
  conferente_wms: "WMS",
};

const ROLE_COLORS: Record<string, string> = {
  separacao:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  conferencia:  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  supervisor:   "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  administrador:"bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function fmtTime(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${min.toFixed(0)}min`;
  return `${(min / 60).toFixed(1)}h`;
}

function fmtDate(iso: string): string {
  try { return format(parseISO(iso.slice(0, 10) + "T12:00:00"), "dd/MM", { locale: ptBR }); }
  catch { return iso.slice(5, 10); }
}

function fmtDateFull(iso: string): string {
  try { return format(parseISO(iso.replace("T", " ").slice(0, 19)), "dd/MM HH:mm", { locale: ptBR }); }
  catch { return iso.slice(0, 16); }
}

function RateIndicator({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />0%</span>;
  if (pct <= 2)  return <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><Minus className="h-3 w-3" />{pct}%</span>;
  return <span className="text-xs text-red-600 font-semibold flex items-center gap-1"><TrendingUp className="h-3 w-3" />{pct}%</span>;
}

function TimeBar({ min, max, avg, p50 }: { min: number | null; max: number | null; avg: number | null; p50: number | null }) {
  if (min === null || max === null || avg === null) return null;
  const range = max - min || 1;
  const avgPct = ((avg - min) / range) * 100;
  const p50Pct = p50 !== null ? ((p50 - min) / range) * 100 : null;
  return (
    <div className="space-y-1.5">
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-green-400/60 via-amber-400/60 to-red-400/60 rounded-full" />
        <div
          className="absolute top-0 h-full w-0.5 bg-amber-600 dark:bg-amber-400"
          style={{ left: `${Math.min(Math.max(avgPct, 2), 98)}%` }}
          title={`Média: ${fmtTime(avg)}`}
        />
        {p50Pct !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-blue-600 dark:bg-blue-400"
            style={{ left: `${Math.min(Math.max(p50Pct, 2), 98)}%` }}
            title={`Mediana: ${fmtTime(p50)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>min {fmtTime(min)}</span>
        <span className="flex gap-2">
          <span className="text-amber-600 dark:text-amber-400">↑ méd {fmtTime(avg)}</span>
          {p50 && <span className="text-blue-600 dark:text-blue-400">● p50 {fmtTime(p50)}</span>}
        </span>
        <span>max {fmtTime(max)}</span>
      </div>
    </div>
  );
}

function WorkUnitsTable({ wus }: { wus: WorkUnitDetalhe[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? wus : wus.slice(0, 10);

  if (!wus.length) return <p className="text-xs text-muted-foreground/50 italic">Sem registros individuais no período.</p>;

  return (
    <div className="space-y-1.5">
      <div className="rounded-xl overflow-hidden border border-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border/50">
              <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Pedido</th>
              <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Tipo</th>
              <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Seção</th>
              <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Duração</th>
              <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Concluído</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((wu, i) => (
              <tr
                key={i}
                className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-2 py-1.5 font-mono text-[10px] text-foreground/70">
                  {wu.orderId.slice(0, 8)}…
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-medium
                    ${wu.type === "separacao"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"}`}>
                    {wu.type === "separacao" ? "Sep" : "Conf"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{wu.section || "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  {wu.duracaoMin !== null ? (
                    <span className={`font-semibold tabular-nums
                      ${wu.duracaoMin < 5 ? "text-green-600 dark:text-green-400"
                        : wu.duracaoMin < 20 ? "text-foreground"
                        : "text-red-600 dark:text-red-400"}`}>
                      {fmtTime(wu.duracaoMin)}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right text-muted-foreground text-[10px]">
                  {fmtDateFull(wu.completedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wus.length > 10 && (
        <button
          onClick={() => setShowAll(p => !p)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showAll ? "Mostrar menos" : `Ver todos os ${wus.length} registros`}
        </button>
      )}
    </div>
  );
}

function OperatorCard({ op, rank }: { op: OperatorKPI; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const last7 = op.diario.slice(-7);
  const maxDia = Math.max(...last7.map(d => d.sep + d.conf), 1);

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden" data-testid={`card-kpi-${op.userId}`}>
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0
          ${rank === 1 ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40" :
            rank === 2 ? "bg-slate-100 text-slate-500 dark:bg-slate-800" :
            rank === 3 ? "bg-orange-100 text-orange-500 dark:bg-orange-900/40" :
            "bg-muted text-muted-foreground"}`}>
          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm truncate">{op.userName}</p>
            <Badge className={`text-[10px] px-2 py-0 h-5 ${ROLE_COLORS[op.role] ?? "bg-muted text-muted-foreground"}`}>
              {ROLE_LABELS[op.role] ?? op.role}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">@{op.username}</p>
        </div>

        <div className="w-20 shrink-0">
          <div className="flex items-end gap-0.5 h-8">
            {last7.map(({ dia, sep, conf }) => {
              const total = sep + conf;
              return (
                <div key={dia} className="flex-1 relative group" title={`${fmtDate(dia)}: ${sep}s ${conf}c`}>
                  <div className="w-full rounded-sm overflow-hidden" style={{ height: `${Math.max(4, (total / maxDia) * 32)}px` }}>
                    <div className="bg-blue-500/70 w-full" style={{ height: `${sep / (total || 1) * 100}%` }} />
                    <div className="bg-green-500/70 w-full" style={{ height: `${conf / (total || 1) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={() => setExpanded(p => !p)} className="text-muted-foreground hover:text-foreground ml-1" data-testid={`btn-kpi-expand-${op.userId}`}>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="px-4 pb-3 grid grid-cols-4 gap-2">
        <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 px-2 py-2 text-center">
          <p className="text-[11px] text-blue-600/70 dark:text-blue-400/60 leading-tight">Separados</p>
          <p className="text-xl font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">{op.pedidosSeparados}</p>
        </div>
        <div className="rounded-xl bg-green-50 dark:bg-green-950/30 px-2 py-2 text-center">
          <p className="text-[11px] text-green-600/70 dark:text-green-400/60 leading-tight">Conferidos</p>
          <p className="text-xl font-extrabold text-green-700 dark:text-green-300 tabular-nums">{op.pedidosConferidos}</p>
        </div>
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-2 py-2 text-center">
          <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 leading-tight">T.Médio</p>
          <p className="text-base font-extrabold text-amber-700 dark:text-amber-300">{fmtTime(op.tempoMedioSepMin)}</p>
        </div>
        <div className={`rounded-xl px-2 py-2 text-center ${op.totalExcecoes > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted"}`}>
          <p className={`text-[11px] leading-tight ${op.totalExcecoes > 0 ? "text-red-600/70 dark:text-red-400/60" : "text-muted-foreground"}`}>Exceções</p>
          <p className={`text-xl font-extrabold tabular-nums ${op.totalExcecoes > 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>{op.totalExcecoes}</p>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-4 space-y-5 bg-muted/20">

          {op.pedidosSeparados > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Separação</p>
              <div className="grid grid-cols-2 gap-2">
                <DetailPill label="Pedidos" value={op.pedidosSeparados} />
                <DetailPill label="Em andamento" value={op.pedidosAndamento} />
                <DetailPill label="Itens coletados" value={op.totalItens} />
                <DetailPill label="Qtd coletada" value={op.totalQtyPicked.toFixed(0)} />
                <DetailPill label="Itens excedidos" value={op.itensExcedidos} accent={op.itensExcedidos > 0 ? "amber" : undefined} />
                <DetailPill label="Taxa exceção" value={`${op.taxaExcecao}%`} accent={op.taxaExcecao > 2 ? "red" : op.taxaExcecao > 0 ? "amber" : undefined} />
              </div>
              {op.tempoMinSepMin !== null && op.tempoMaxSepMin !== null && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground font-medium">Distribuição de tempo por pedido</p>
                  <TimeBar min={op.tempoMinSepMin} max={op.tempoMaxSepMin} avg={op.tempoMedioSepMin} p50={op.tempoP50SepMin} />
                </div>
              )}
            </div>
          )}

          {op.pedidosConferidos > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conferência</p>
              <div className="grid grid-cols-2 gap-2">
                <DetailPill label="Pedidos" value={op.pedidosConferidos} />
                <DetailPill label="T. Médio" value={fmtTime(op.tempoMedioConfMin)} />
                <DetailPill label="Volumes gerados" value={op.totalVolumes} />
                <DetailPill label="Pedidos c/ volume" value={op.pedidosComVolume} />
              </div>
              {op.tempoMinConfMin !== null && op.tempoMaxConfMin !== null && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground font-medium">Distribuição de tempo (conferência)</p>
                  <TimeBar min={op.tempoMinConfMin} max={op.tempoMaxConfMin} avg={op.tempoMedioConfMin} p50={null} />
                </div>
              )}
            </div>
          )}

          {op.totalExcecoes > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exceções</p>
              <div className="grid grid-cols-3 gap-2">
                <DetailPill label="Não encontrado" value={op.excNaoEncontrado} accent={op.excNaoEncontrado > 0 ? "red" : undefined} />
                <DetailPill label="Avariado" value={op.excAvariado} accent={op.excAvariado > 0 ? "red" : undefined} />
                <DetailPill label="Vencido" value={op.excVencido} accent={op.excVencido > 0 ? "red" : undefined} />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Taxa de erro:</p>
                <RateIndicator pct={op.taxaExcecao} />
              </div>
            </div>
          )}

          {op.diario.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atividade diária (período)</p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={last7} margin={{ top: 2, right: 0, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="dia" tickFormatter={fmtDate} tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: any, name: string) => [v, name === "sep" ? "Separação" : name === "conf" ? "Conferência" : "T.Médio (min)"]}
                      labelFormatter={fmtDate}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="sep" stackId="a" fill="#3b82f6" opacity={0.8} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="conf" stackId="a" fill="#22c55e" opacity={0.8} radius={[2, 2, 0, 0]} />
                    {last7.some(d => d.tempoMedioSep !== null) && (
                      <Line type="monotone" dataKey="tempoMedioSep" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} yAxisId={0} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {op.workUnitsDetalhe.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Registros individuais
                <span className="ml-1 text-muted-foreground/50 normal-case font-normal">(mais recentes)</span>
              </p>
              <WorkUnitsTable wus={op.workUnitsDetalhe} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPill({ label, value, accent }: { label: string; value: string | number; accent?: "red" | "amber" | "green" }) {
  const colorMap = {
    red:   "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
    green: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300",
  };
  return (
    <div className={`rounded-xl px-3 py-2 flex justify-between items-center ${accent ? colorMap[accent] : "bg-background border border-border/50"}`}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${accent ? "" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: {
  icon: any; label: string; value: string | number; color: string;
}) {
  const colors: Record<string, string> = {
    blue:    "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    green:   "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    amber:   "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    red:     "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    slate:   "bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300",
    violet:  "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
  };
  return (
    <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${colors[color] ?? colors.slate}`}>
      <Icon className="h-5 w-5 shrink-0 opacity-70" />
      <div className="min-w-0">
        <p className="text-[11px] opacity-70 leading-tight truncate">{label}</p>
        <p className="text-xl font-extrabold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function InsightCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub?: string; color: string;
}) {
  const colors: Record<string, string> = {
    blue:  "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20",
    green: "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20",
    amber: "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
    red:   "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20",
    violet:"border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20",
  };
  const iconColors: Record<string, string> = {
    blue:  "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red:   "text-red-600 dark:text-red-400",
    violet:"text-violet-600 dark:text-violet-400",
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-start gap-3 ${colors[color]}`}>
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColors[color]}`} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover shadow-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold text-foreground">{label ? fmtDate(label) : ""}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">
            {p.dataKey === "sep" ? "Separação" : p.dataKey === "conf" ? "Conferência" : "T.Médio (min)"}:
          </span>
          <span className="font-semibold">{p.dataKey === "tempoMedioSep" ? fmtTime(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function KpiDashboardPage() {
  const [, navigate] = useLocation();
  const { companyId } = useAuth();
  const [from, setFrom] = useState(() => format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [to, setTo]     = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput]     = useState(to);

  const kpiUrl = companyId
    ? `/api/kpi/operators?companyId=${companyId}&from=${from}&to=${to}`
    : null;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<KPIResponse>({
    queryKey: [kpiUrl],
    enabled: !!kpiUrl,
  });

  const applyFilter = () => { setFrom(fromInput); setTo(toInput); };

  const ops = data?.operators ?? [];
  const dailyGlobal = data?.dailyGlobal ?? [];

  const totalPedidosSep  = ops.reduce((s, o) => s + o.pedidosSeparados, 0);
  const totalPedidosConf = ops.reduce((s, o) => s + o.pedidosConferidos, 0);
  const totalExcecoes    = ops.reduce((s, o) => s + o.totalExcecoes, 0);
  const totalVolumes     = ops.reduce((s, o) => s + o.totalVolumes, 0);

  const temposValidos = ops.filter(o => o.tempoMedioSepMin !== null).map(o => o.tempoMedioSepMin as number);
  const avgTempo = temposValidos.length ? (temposValidos.reduce((a, b) => a + b, 0) / temposValidos.length) : null;

  const maisRapido  = ops.filter(o => o.tempoMedioSepMin !== null).sort((a, b) => (a.tempoMedioSepMin ?? 999) - (b.tempoMedioSepMin ?? 999))[0];
  const maisProdut  = [...ops].sort((a, b) => b.pedidosSeparados - a.pedidosSeparados)[0];
  const picoGlobal  = [...dailyGlobal].sort((a, b) => (b.sep + b.conf) - (a.sep + a.conf))[0];

  return (
    <div className="min-h-[100dvh] bg-background pb-safe">
      <GradientHeader compact>
        <div className="relative flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/70 hover:text-white -ml-1 p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-white text-lg leading-tight">Dashboard de KPIs</h1>
            <p className="text-white/60 text-xs">Análise de desempenho operacional</p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-white/70 hover:text-white p-1"
            title="Atualizar"
            data-testid="btn-kpi-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </GradientHeader>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* Filtro de período */}
        <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período de análise</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">De</p>
              <Input type="date" value={fromInput} onChange={e => setFromInput(e.target.value)} className="h-10 rounded-xl text-sm" data-testid="input-kpi-from" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">Até</p>
              <Input type="date" value={toInput} onChange={e => setToInput(e.target.value)} className="h-10 rounded-xl text-sm" data-testid="input-kpi-to" />
            </div>
            <div className="flex items-end">
              <Button onClick={applyFilter} className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white" disabled={isFetching} data-testid="btn-kpi-filter">
                {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[{ label: "7 dias", days: 7 }, { label: "15 dias", days: 15 }, { label: "30 dias", days: 30 }, { label: "90 dias", days: 90 }].map(({ label, days }) => (
              <button
                key={days}
                onClick={() => {
                  const f = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
                  const t = format(new Date(), "yyyy-MM-dd");
                  setFromInput(f); setToInput(t); setFrom(f); setTo(t);
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-border/50 hover:bg-muted transition-colors"
                data-testid={`btn-kpi-preset-${days}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-2xl" />
            <div className="grid grid-cols-2 gap-2">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
            {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-border/50 bg-card p-4 space-y-3"><Skeleton className="h-5 w-40" /><div className="grid grid-cols-4 gap-2">{[1,2,3,4].map(j => <Skeleton key={j} className="h-14 rounded-xl" />)}</div></div>)}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive/60 mx-auto mb-2" />
            <p className="text-sm text-destructive font-medium">Falha ao carregar KPIs</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Tentar novamente</Button>
          </div>
        )}

        {/* Sem dados */}
        {!isLoading && !isError && ops.length === 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-10 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum operador com atividade no período selecionado.</p>
          </div>
        )}

        {!isLoading && !isError && ops.length > 0 && (
          <>
            {/* Resumo geral */}
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard icon={Users}        label="Operadores ativos"   value={ops.length}            color="blue" />
              <SummaryCard icon={Package}      label="Pedidos separados"   value={totalPedidosSep}       color="green" />
              <SummaryCard icon={CheckCircle2} label="Pedidos conferidos"  value={totalPedidosConf}      color="emerald" />
              <SummaryCard icon={Clock}        label="T. médio separação"  value={fmtTime(avgTempo)}     color="amber" />
              <SummaryCard icon={AlertTriangle}label="Total exceções"      value={totalExcecoes}         color={totalExcecoes > 0 ? "red" : "slate"} />
              <SummaryCard icon={Boxes}        label="Volumes gerados"     value={totalVolumes}          color="violet" />
            </div>

            {/* Gráfico de produção diária */}
            {dailyGlobal.length > 0 && (
              <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Produção diária</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/80 inline-block" />Sep</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/80 inline-block" />Conf</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />T.Médio</span>
                  </div>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyGlobal} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis
                        dataKey="dia"
                        tickFormatter={fmtDate}
                        tick={{ fontSize: 10 }}
                        interval={dailyGlobal.length > 14 ? Math.floor(dailyGlobal.length / 10) : 0}
                      />
                      <YAxis yAxisId="qty" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis yAxisId="tempo" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}m`} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar yAxisId="qty" dataKey="sep" stackId="a" fill="#3b82f6" opacity={0.85} name="Separação" />
                      <Bar yAxisId="qty" dataKey="conf" stackId="a" fill="#22c55e" opacity={0.85} radius={[3, 3, 0, 0]} name="Conferência" />
                      {dailyGlobal.some(d => d.tempoMedioSep !== null) && (
                        <Line yAxisId="tempo" type="monotone" dataKey="tempoMedioSep" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2, fill: "#f59e0b" }} name="T.Médio (min)" connectNulls />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Insights */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> Insights do período
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {maisRapido && (
                  <InsightCard
                    icon={Timer}
                    color="green"
                    label="Operador mais rápido"
                    value={maisRapido.userName}
                    sub={`Média de ${fmtTime(maisRapido.tempoMedioSepMin)} por pedido`}
                  />
                )}
                {maisProdut && maisProdut.pedidosSeparados > 0 && (
                  <InsightCard
                    icon={Trophy}
                    color="blue"
                    label="Mais produtivo"
                    value={maisProdut.userName}
                    sub={`${maisProdut.pedidosSeparados} pedidos separados`}
                  />
                )}
                {picoGlobal && (
                  <InsightCard
                    icon={TrendingUp}
                    color="violet"
                    label="Dia mais movimentado"
                    value={fmtDate(picoGlobal.dia)}
                    sub={`${picoGlobal.sep + picoGlobal.conf} pedidos concluídos`}
                  />
                )}
                {avgTempo !== null && (
                  <InsightCard
                    icon={Target}
                    color="amber"
                    label="Tempo médio geral de separação"
                    value={fmtTime(avgTempo)}
                    sub={`Meta: quanto menor, melhor`}
                  />
                )}
                {totalExcecoes > 0 && (
                  <InsightCard
                    icon={AlertTriangle}
                    color="red"
                    label="Taxa de exceção geral"
                    value={`${ops.reduce((s, o) => s + o.totalItens, 0) > 0
                      ? ((totalExcecoes / ops.reduce((s, o) => s + o.totalItens, 0)) * 100).toFixed(1)
                      : 0}%`}
                    sub={`${totalExcecoes} exceção(ões) no total`}
                  />
                )}
              </div>
            </div>

            {/* Ranking de operadores */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold">Ranking de operadores</p>
                <Badge variant="outline" className="ml-auto text-xs">{ops.length} operadores</Badge>
              </div>
              {ops.map((op, i) => (
                <OperatorCard key={op.userId} op={op} rank={i + 1} />
              ))}
            </div>

            {/* Legenda */}
            <div className="rounded-2xl border border-border/50 bg-card px-4 py-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/70 inline-block" />Separação</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/70 inline-block" />Conferência</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-amber-500 inline-block" />Tempo médio</div>
              <div className="ml-auto">Clique no operador para ver detalhe individual</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
