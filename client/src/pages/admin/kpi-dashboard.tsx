import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { GradientHeader } from "@/components/ui/gradient-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  ArrowLeft, Clock, Package, AlertTriangle, CheckCircle2,
  TrendingUp, BarChart3, Trophy, ChevronDown, ChevronUp,
  RefreshCw, Boxes, Timer, Zap,
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line,
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

interface KPIResponse {
  operators: OperatorKPI[];
  from: string;
  to: string;
  companyId: number;
  dailyGlobal: { dia: string; sep: number; conf: number; tempoMedioSep: number | null }[];
}

const ROLE_LABELS: Record<string, string> = {
  separacao: "Separação", conferencia: "Conferência", supervisor: "Supervisor",
  administrador: "Admin", balcao: "Balcão", recebedor: "Recebedor",
  empilhador: "Empilhador", conferente_wms: "WMS",
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

function fmtDateTime(iso: string): string {
  try { return format(parseISO(iso.replace(" ", "T").slice(0, 19)), "dd/MM HH:mm", { locale: ptBR }); }
  catch { return iso.slice(0, 16); }
}

const PRESET_DAYS = [
  { label: "7d", days: 7 },
  { label: "15d", days: 15 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function StatRow({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${accent ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function OperatorCard({ op, rank }: { op: OperatorKPI; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const [showAllWu, setShowAllWu] = useState(false);
  const wus = showAllWu ? op.workUnitsDetalhe : op.workUnitsDetalhe.slice(0, 8);

  const medalLabel = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden" data-testid={`card-kpi-${op.userId}`}>

      {/* Linha principal */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        {/* Rank */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0
          ${rank <= 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
          {medalLabel}
        </div>

        {/* Nome + cargo */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{op.userName}</p>
          <Badge className={`text-[9px] px-1.5 py-0 h-4 mt-0.5 ${ROLE_COLORS[op.role] ?? "bg-muted text-muted-foreground"}`}>
            {ROLE_LABELS[op.role] ?? op.role}
          </Badge>
        </div>

        {/* 3 métricas inline */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <p className="text-base font-extrabold tabular-nums text-blue-600 dark:text-blue-400 leading-none">{op.pedidosSeparados}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">sep</p>
          </div>
          <div className="text-center">
            <p className="text-base font-extrabold tabular-nums text-amber-600 dark:text-amber-400 leading-none">{fmtTime(op.tempoMedioSepMin)}</p>
            <p className="text-[9px] text-muted-foreground leading-tight">t.méd</p>
          </div>
          {op.totalExcecoes > 0 ? (
            <div className="text-center">
              <p className="text-base font-extrabold tabular-nums text-red-600 dark:text-red-400 leading-none">{op.totalExcecoes}</p>
              <p className="text-[9px] text-muted-foreground leading-tight">exc</p>
            </div>
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          )}
        </div>

        {/* Toggle */}
        <div className="text-muted-foreground ml-1 shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Detalhe expandido */}
      {expanded && (
        <div className="border-t border-border/40 bg-muted/20 px-4 py-4 space-y-4">

          {/* Separação */}
          {op.pedidosSeparados > 0 && (
            <section className="space-y-0.5">
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2">Separação</p>
              <StatRow label="Pedidos concluídos" value={op.pedidosSeparados} />
              <StatRow label="Em andamento" value={op.pedidosAndamento} />
              <StatRow label="Tempo médio" value={fmtTime(op.tempoMedioSepMin)} />
              {op.tempoMinSepMin !== null && <StatRow label="Mais rápido / mais lento" value={`${fmtTime(op.tempoMinSepMin)} / ${fmtTime(op.tempoMaxSepMin)}`} />}
              {op.tempoP50SepMin !== null && <StatRow label="Mediana (50%)" value={fmtTime(op.tempoP50SepMin)} />}
              <StatRow label="Itens coletados" value={op.totalItens} />
              <StatRow label="Qtd coletada" value={op.totalQtyPicked.toFixed(0)} />
              {op.itensExcedidos > 0 && <StatRow label="Itens com excesso" value={op.itensExcedidos} accent />}
            </section>
          )}

          {/* Conferência */}
          {op.pedidosConferidos > 0 && (
            <section className="space-y-0.5">
              <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-2">Conferência</p>
              <StatRow label="Pedidos conferidos" value={op.pedidosConferidos} />
              <StatRow label="Tempo médio" value={fmtTime(op.tempoMedioConfMin)} />
              {op.tempoMinConfMin !== null && <StatRow label="Mais rápido / mais lento" value={`${fmtTime(op.tempoMinConfMin)} / ${fmtTime(op.tempoMaxConfMin)}`} />}
              <StatRow label="Volumes gerados" value={op.totalVolumes} />
            </section>
          )}

          {/* Exceções */}
          {op.totalExcecoes > 0 && (
            <section className="space-y-0.5">
              <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mb-2">Exceções</p>
              <StatRow label="Total" value={op.totalExcecoes} accent />
              <StatRow label="Taxa" value={`${op.taxaExcecao}%`} accent />
              {op.excNaoEncontrado > 0 && <StatRow label="Não encontrado" value={op.excNaoEncontrado} accent />}
              {op.excAvariado > 0 && <StatRow label="Avariado" value={op.excAvariado} accent />}
              {op.excVencido > 0 && <StatRow label="Vencido" value={op.excVencido} accent />}
            </section>
          )}

          {/* Gráfico diário compacto */}
          {op.diario.length > 0 && (
            <section>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Atividade diária</p>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={op.diario.slice(-14)} margin={{ top: 0, right: 0, left: -32, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="dia" tickFormatter={fmtDate} tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 8 }} allowDecimals={false} />
                    <Tooltip
                      labelFormatter={fmtDate}
                      formatter={(v: any, k: string) => [v, k === "sep" ? "Sep" : k === "conf" ? "Conf" : "T.méd (min)"]}
                      contentStyle={{ fontSize: 10, borderRadius: 8 }}
                    />
                    <Bar dataKey="sep" stackId="a" fill="#3b82f6" opacity={0.85} />
                    <Bar dataKey="conf" stackId="a" fill="#22c55e" opacity={0.85} radius={[2, 2, 0, 0]} />
                    {op.diario.some(d => d.tempoMedioSep !== null) && (
                      <Line type="monotone" dataKey="tempoMedioSep" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Registros individuais */}
          {op.workUnitsDetalhe.length > 0 && (
            <section>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                Registros individuais
              </p>
              <div className="rounded-xl overflow-hidden border border-border/40">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">Tipo</th>
                      <th className="px-2 py-1.5 text-left font-medium">Seção</th>
                      <th className="px-2 py-1.5 text-right font-medium">Duração</th>
                      <th className="px-2 py-1.5 text-right font-medium">Concluído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wus.map((wu, i) => (
                      <tr key={i} className="border-t border-border/20 hover:bg-muted/30">
                        <td className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold
                            ${wu.type === "separacao"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"}`}>
                            {wu.type === "separacao" ? "Sep" : "Conf"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{wu.section || "—"}</td>
                        <td className="px-2 py-1.5 text-right">
                          {wu.duracaoMin !== null ? (
                            <span className={`font-semibold
                              ${wu.duracaoMin < 5 ? "text-green-600 dark:text-green-400"
                                : wu.duracaoMin > 20 ? "text-red-600 dark:text-red-400"
                                : "text-foreground"}`}>
                              {fmtTime(wu.duracaoMin)}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{fmtDateTime(wu.completedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {op.workUnitsDetalhe.length > 8 && (
                <button
                  onClick={() => setShowAllWu(p => !p)}
                  className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showAllWu ? "Mostrar menos" : `Ver todos (${op.workUnitsDetalhe.length})`}
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover shadow px-3 py-2 text-[11px] space-y-1">
      <p className="font-semibold">{fmtDate(label)}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.dataKey === "sep" ? "Sep" : p.dataKey === "conf" ? "Conf" : "T.méd"}:</span>
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

  const kpiUrl = companyId ? `/api/kpi/operators?companyId=${companyId}&from=${from}&to=${to}` : null;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<KPIResponse>({
    queryKey: [kpiUrl],
    enabled: !!kpiUrl,
  });

  const applyFilter = () => { setFrom(fromInput); setTo(toInput); };

  const setPreset = (days: number) => {
    const f = format(subDays(new Date(), days - 1), "yyyy-MM-dd");
    const t = format(new Date(), "yyyy-MM-dd");
    setFromInput(f); setToInput(t); setFrom(f); setTo(t);
  };

  const ops = data?.operators ?? [];
  const dailyGlobal = data?.dailyGlobal ?? [];
  const totalSep   = ops.reduce((s, o) => s + o.pedidosSeparados, 0);
  const totalConf  = ops.reduce((s, o) => s + o.pedidosConferidos, 0);
  const totalExc   = ops.reduce((s, o) => s + o.totalExcecoes, 0);
  const tempos     = ops.filter(o => o.tempoMedioSepMin !== null).map(o => o.tempoMedioSepMin as number);
  const avgTempo   = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  const maisRapido = [...ops].filter(o => o.tempoMedioSepMin !== null).sort((a, b) => (a.tempoMedioSepMin ?? 999) - (b.tempoMedioSepMin ?? 999))[0];
  const picoGlobal = [...dailyGlobal].sort((a, b) => (b.sep + b.conf) - (a.sep + a.conf))[0];

  return (
    <div className="min-h-[100dvh] bg-background pb-safe">
      <GradientHeader compact>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground p-1 -ml-1 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-foreground text-base leading-tight">KPIs de Operadores</h1>
            <p className="text-muted-foreground text-[11px]">Análise de desempenho</p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-foreground p-2 rounded-lg"
            data-testid="btn-kpi-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </GradientHeader>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">

        {/* Filtro */}
        <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">De</p>
              <input
                type="date"
                value={fromInput}
                onChange={e => setFromInput(e.target.value)}
                className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-kpi-from"
              />
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-muted-foreground mb-1">Até</p>
              <input
                type="date"
                value={toInput}
                onChange={e => setToInput(e.target.value)}
                className="w-full h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-kpi-to"
              />
            </div>
            <Button
              onClick={applyFilter}
              disabled={isFetching}
              className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              data-testid="btn-kpi-filter"
            >
              {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            {PRESET_DAYS.map(({ label, days }) => (
              <Button
                key={days}
                variant="outline"
                size="sm"
                onClick={() => setPreset(days)}
                className="h-8 flex-1 rounded-lg text-xs"
                data-testid={`btn-kpi-preset-${days}`}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="h-7 w-7 text-destructive/60 mx-auto mb-2" />
            <p className="text-sm font-medium text-destructive">Falha ao carregar KPIs</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">Tentar novamente</Button>
          </div>
        )}

        {/* Sem dados */}
        {!isLoading && !isError && ops.length === 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-10 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade no período.</p>
          </div>
        )}

        {!isLoading && !isError && ops.length > 0 && (
          <>
            {/* Totais */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Package,       label: "Separados",  value: totalSep,            color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-950/30" },
                { icon: CheckCircle2,  label: "Conferidos", value: totalConf,            color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30" },
                { icon: Clock,         label: "T.Médio sep", value: fmtTime(avgTempo),   color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className={`rounded-2xl ${bg} px-3 py-3 flex flex-col items-center gap-0.5`}>
                  <Icon className={`h-4 w-4 ${color} opacity-70`} />
                  <p className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Boxes,         label: "Volumes",    value: ops.reduce((s,o) => s+o.totalVolumes, 0), color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30" },
                { icon: AlertTriangle, label: "Exceções",   value: totalExc,            color: totalExc > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground", bg: totalExc > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className={`rounded-2xl ${bg} px-3 py-3 flex items-center gap-3`}>
                  <Icon className={`h-4 w-4 ${color} opacity-70 shrink-0`} />
                  <div>
                    <p className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Insights compactos */}
            {(maisRapido || picoGlobal) && (
              <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40">
                <p className="px-4 pt-3 pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-amber-500" />Destaques
                </p>
                {maisRapido && (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <Timer className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{maisRapido.userName}</p>
                      <p className="text-[10px] text-muted-foreground">Mais rápido · {fmtTime(maisRapido.tempoMedioSepMin)} por pedido</p>
                    </div>
                  </div>
                )}
                {picoGlobal && (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <TrendingUp className="h-4 w-4 text-violet-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{fmtDate(picoGlobal.dia)}</p>
                      <p className="text-[10px] text-muted-foreground">Dia mais movimentado · {picoGlobal.sep + picoGlobal.conf} pedidos</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gráfico diário global */}
            {dailyGlobal.length > 0 && (
              <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Produção diária</p>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />Sep</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />Conf</span>
                    <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 inline-block" />T.méd</span>
                  </div>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={dailyGlobal} margin={{ top: 2, right: 4, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis
                        dataKey="dia"
                        tickFormatter={fmtDate}
                        tick={{ fontSize: 9 }}
                        interval={dailyGlobal.length > 14 ? Math.floor(dailyGlobal.length / 8) : 0}
                      />
                      <YAxis yAxisId="qty" tick={{ fontSize: 9 }} allowDecimals={false} />
                      <YAxis yAxisId="tempo" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `${v}m`} width={28} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar yAxisId="qty" dataKey="sep" stackId="a" fill="#3b82f6" opacity={0.85} />
                      <Bar yAxisId="qty" dataKey="conf" stackId="a" fill="#22c55e" opacity={0.85} radius={[2, 2, 0, 0]} />
                      {dailyGlobal.some(d => d.tempoMedioSep !== null) && (
                        <Line yAxisId="tempo" type="monotone" dataKey="tempoMedioSep" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Ranking */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-sm font-semibold">Ranking</p>
                <Badge variant="outline" className="ml-auto text-[10px] h-5">{ops.length} operadores</Badge>
              </div>
              {ops.map((op, i) => <OperatorCard key={op.userId} op={op} rank={i + 1} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
