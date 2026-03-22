import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const boolean = (name: string) => integer(name, { mode: 'boolean' });
const timestamp = (name: string) => text(name);

export const userRoleEnum = ["administrador", "supervisor", "separacao", "conferencia", "balcao", "fila_pedidos", "recebedor", "empilhador", "conferente_wms"] as const;
export type UserRole = typeof userRoleEnum[number];

export const orderStatusEnum = ["pendente", "em_separacao", "separado", "em_conferencia", "conferido", "finalizado", "cancelado"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const workUnitStatusEnum = ["pendente", "em_andamento", "concluido", "recontagem", "excecao"] as const;
export type WorkUnitStatus = typeof workUnitStatusEnum[number];

export const itemStatusEnum = ["pendente", "separado", "conferido", "excecao", "recontagem"] as const;
export type ItemStatus = typeof itemStatusEnum[number];

export const exceptionTypeEnum = ["nao_encontrado", "avariado", "vencido"] as const;
export type ExceptionType = typeof exceptionTypeEnum[number];

export const workUnitTypeEnum = ["separacao", "conferencia", "balcao"] as const;
export type WorkUnitType = typeof workUnitTypeEnum[number];

export const palletStatusEnum = ["sem_endereco", "alocado", "em_transferencia", "cancelado"] as const;
export type PalletStatus = typeof palletStatusEnum[number];

export const palletMovementTypeEnum = ["created", "allocated", "transferred", "split", "cancelled", "counted"] as const;
export type PalletMovementType = typeof palletMovementTypeEnum[number];

export const wmsAddressTypeEnum = ["standard", "picking", "recebimento", "expedicao"] as const;
export type WmsAddressType = typeof wmsAddressTypeEnum[number];

export const countingCycleTypeEnum = ["por_endereco", "por_produto"] as const;
export type CountingCycleType = typeof countingCycleTypeEnum[number];

export const countingCycleStatusEnum = ["pendente", "em_andamento", "concluido", "aprovado", "rejeitado"] as const;
export type CountingCycleStatus = typeof countingCycleStatusEnum[number];

export const countingCycleItemStatusEnum = ["pendente", "contado", "divergente", "aprovado"] as const;
export type CountingCycleItemStatus = typeof countingCycleItemStatusEnum[number];

export const nfStatusEnum = ["pendente", "em_recebimento", "recebida", "cancelada"] as const;
export type NfStatus = typeof nfStatusEnum[number];

export interface UserSettings {
  allowManualQty?: boolean;
  allowMultiplier?: boolean;
  canAuthorizeOwnExceptions?: boolean;
}

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("separacao").$type<UserRole>(),
  sections: text("sections", { mode: "json" }),
  settings: text("settings", { mode: "json" }).$type<UserSettings>().default({}),
  active: boolean("active").notNull().default(true),
  badgeCode: text("badge_code"),
  defaultCompanyId: integer("default_company_id"),
  allowedCompanies: text("allowed_companies", { mode: "json" }).$type<number[]>().default([1, 3]),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const routes = sqliteTable("routes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const sections = sqliteTable("sections", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const pickupPoints = sqliteTable("pickup_points", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

export const sectionGroups = sqliteTable("section_groups", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  sections: text("sections", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
  updatedAt: timestamp("updated_at").notNull().default(new Date().toISOString()),
});

export const cacheOrcamentos = sqliteTable("cache_orcamentos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chave: text("CHAVE").notNull(),
  idEmpresa: integer("IDEMPRESA"),
  idOrcamento: integer("IDORCAMENTO"),
  idProduto: text("IDPRODUTO"),
  idSubProduto: text("IDSUBPRODUTO"),
  numSequencia: integer("NUMSEQUENCIA"),
  qtdProduto: real("QTDPRODUTO"),
  unidade: text("UNIDADE"),
  fabricante: text("FABRICANTE"),
  valUnitBruto: real("VALUNITBRUTO"),
  valTotLiquido: real("VALTOTLIQUIDO"),
  descrResProduto: text("DESCRRESPRODUTO"),
  idVendedor: text("IDVENDEDOR"),
  idLocalRetirada: integer("IDLOCALRETIRADA"),
  idSecao: integer("IDSECAO"),
  descrSecao: text("DESCRSECAO"),
  tipoEntrega: text("TIPOENTREGA"),
  nomeVendedor: text("NOMEVENDEDOR"),
  tipoEntregaDescr: text("TIPOENTREGA_DESCR"),
  localRetEstoque: text("LOCALRETESTOQUE"),
  flagCancelado: text("FLAGCANCELADO"),
  idCliFor: text("IDCLIFOR"),
  desCliente: text("DESCLIENTE"),
  dtMovimento: text("DTMOVIMENTO"),
  idRecebimento: text("IDRECEBIMENTO"),
  descrRecebimento: text("DESCRRECEBIMENTO"),
  flagPrenotaPaga: text("FLAGPRENOTAPAGA"),
  syncAt: text("sync_at"),
  codBarras: text("CODBARRAS"),
  codBarrasCaixa: text("CODBARRAS_CAIXA"),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  erpCode: text("erp_code").notNull(),
  barcode: text("barcode"),
  boxBarcode: text("box_barcode"),
  boxBarcodes: text("box_barcodes", { mode: "json" }).$type<{ code: string, qty: number }[]>(),
  name: text("name").notNull(),
  section: text("section").notNull(),
  pickupPoint: integer("pickup_point").notNull(),
  unit: text("unit").notNull().default("UN"),
  manufacturer: text("manufacturer"),
  price: real("price").notNull().default(0),
  stockQty: real("stock_qty").notNull().default(0),
  erpUpdatedAt: timestamp("erp_updated_at"),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  erpOrderId: text("erp_order_id").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerCode: text("customer_code"),
  totalValue: real("total_value").notNull().default(0),
  observation: text("observation"),
  observation2: text("observation2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  cnpjCpf: text("cnpj_cpf"),
  addressNumber: text("address_number"),
  status: text("status").notNull().default("pendente").$type<OrderStatus>(),
  priority: integer("priority").notNull().default(0),
  isLaunched: boolean("is_launched").notNull().default(false),
  launchedAt: timestamp("launched_at"),
  separatedAt: timestamp("separated_at"),
  loadCode: text("load_code"),
  routeId: text("route_id").references(() => routes.id),
  separationCode: text("separation_code"),
  pickupPoints: text("pickup_points", { mode: "json" }),
  erpUpdatedAt: timestamp("erp_updated_at"),
  financialStatus: text("financial_status").notNull().default("pendente"),
  companyId: integer("company_id"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
  updatedAt: timestamp("updated_at").notNull().default(new Date().toISOString()),
});

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id").notNull().references(() => orders.id),
  productId: text("product_id").notNull().references(() => products.id),
  quantity: real("quantity").notNull(),
  separatedQty: real("separated_qty").notNull().default(0),
  checkedQty: real("checked_qty").notNull().default(0),
  section: text("section").notNull(),
  pickupPoint: integer("pickup_point").notNull(),
  qtyPicked: real("qty_picked").default(0),
  qtyChecked: real("qty_checked").default(0),
  status: text("status").default("pendente").$type<ItemStatus>(),
  exceptionType: text("exception_type").$type<ExceptionType>(),
});

export const pickingSessions = sqliteTable("picking_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  orderId: text("order_id").notNull().references(() => orders.id),
  sectionId: text("section_id").notNull(),
  lastHeartbeat: timestamp("last_heartbeat").notNull().default(new Date().toISOString()),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
}, (table) => {
  return {};
});

export const workUnits = sqliteTable("work_units", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id").notNull().references(() => orders.id),
  pickupPoint: integer("pickup_point").notNull(),
  section: text("section"),
  type: text("type").notNull().$type<WorkUnitType>(),
  status: text("status").notNull().default("pendente").$type<WorkUnitStatus>(),
  lockedBy: text("locked_by").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  lockExpiresAt: timestamp("lock_expires_at"),
  cartQrCode: text("cart_qr_code"),
  palletQrCode: text("pallet_qr_code"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  companyId: integer("company_id"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const exceptions = sqliteTable("exceptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workUnitId: text("work_unit_id").references(() => workUnits.id),
  orderItemId: text("order_item_id").notNull().references(() => orderItems.id),
  type: text("type").notNull().$type<ExceptionType>(),
  quantity: real("quantity").notNull(),
  observation: text("observation"),
  reportedBy: text("reported_by").notNull().references(() => users.id),
  authorizedBy: text("authorized_by").references(() => users.id),
  authorizedByName: text("authorized_by_name"),
  authorizedAt: timestamp("authorized_at"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  companyId: integer("company_id"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const orderVolumes = sqliteTable("order_volumes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text("order_id").notNull().references(() => orders.id),
  erpOrderId: text("erp_order_id").notNull(),
  sacola: integer("sacola").notNull().default(0),
  caixa: integer("caixa").notNull().default(0),
  saco: integer("saco").notNull().default(0),
  avulso: integer("avulso").notNull().default(0),
  totalVolumes: integer("total_volumes").notNull().default(0),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
  updatedAt: timestamp("updated_at").notNull().default(new Date().toISOString()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),
  sessionKey: text("session_key").notNull(),
  companyId: integer("company_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const manualQtyRuleTypeEnum = ["product_code", "barcode", "description_keyword", "manufacturer"] as const;
export type ManualQtyRuleType = typeof manualQtyRuleTypeEnum[number];

export const manualQtyRules = sqliteTable("manual_qty_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ruleType: text("rule_type").notNull().$type<ManualQtyRuleType>(),
  value: text("value").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const db2Mappings = sqliteTable("db2_mappings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dataset: text("dataset").notNull(),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(false),
  mappingJson: text("mapping_json", { mode: "json" }).$type<MappingField[]>().notNull(),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
  updatedAt: timestamp("updated_at").notNull().default(new Date().toISOString()),
});

export const productCompanyStock = sqliteTable("product_company_stock", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id").notNull().references(() => products.id),
  companyId: integer("company_id").notNull(),
  stockQty: real("stock_qty").notNull().default(0),
  erpUpdatedAt: timestamp("erp_updated_at"),
}, (table) => ({
  productCompanyUnique: uniqueIndex("idx_product_company_stock_unique").on(table.productId, table.companyId),
}));

export const wmsAddresses = sqliteTable("wms_addresses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: integer("company_id").notNull(),
  bairro: text("bairro").notNull(),
  rua: text("rua").notNull(),
  bloco: text("bloco").notNull(),
  nivel: text("nivel").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("standard").$type<WmsAddressType>(),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
}, (table) => ({
  companyCodeIdx: index("idx_wms_addresses_company_code").on(table.companyId, table.code),
}));

export const pallets = sqliteTable("pallets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: integer("company_id").notNull(),
  code: text("code").notNull(),
  status: text("status").notNull().default("sem_endereco").$type<PalletStatus>(),
  addressId: text("address_id").references(() => wmsAddresses.id),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
  allocatedAt: timestamp("allocated_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: text("cancelled_by").references(() => users.id),
  cancelReason: text("cancel_reason"),
}, (table) => ({
  companyStatusIdx: index("idx_pallets_company_status").on(table.companyId, table.status),
}));

export const palletItems = sqliteTable("pallet_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  palletId: text("pallet_id").notNull().references(() => pallets.id),
  productId: text("product_id").notNull().references(() => products.id),
  erpNfId: text("erp_nf_id"),
  quantity: real("quantity").notNull(),
  lot: text("lot"),
  expiryDate: text("expiry_date"),
  fefoEnabled: boolean("fefo_enabled").notNull().default(false),
  companyId: integer("company_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
}, (table) => ({
  palletIdx: index("idx_pallet_items_pallet").on(table.palletId),
}));

export const palletMovements = sqliteTable("pallet_movements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  palletId: text("pallet_id").notNull().references(() => pallets.id),
  companyId: integer("company_id").notNull(),
  movementType: text("movement_type").notNull().$type<PalletMovementType>(),
  fromAddressId: text("from_address_id").references(() => wmsAddresses.id),
  toAddressId: text("to_address_id").references(() => wmsAddresses.id),
  fromPalletId: text("from_pallet_id"),
  userId: text("user_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export const nfCache = sqliteTable("nf_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: integer("company_id").notNull(),
  nfNumber: text("nf_number").notNull(),
  nfSeries: text("nf_series"),
  supplierName: text("supplier_name"),
  supplierCnpj: text("supplier_cnpj"),
  issueDate: text("issue_date"),
  totalValue: real("total_value"),
  status: text("status").notNull().default("pendente").$type<NfStatus>(),
  syncedAt: timestamp("synced_at"),
}, (table) => ({
  companyNfIdx: index("idx_nf_cache_company_nf").on(table.companyId, table.nfNumber),
}));

export const nfItems = sqliteTable("nf_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nfId: text("nf_id").notNull().references(() => nfCache.id),
  productId: text("product_id"),
  erpCode: text("erp_code"),
  productName: text("product_name"),
  quantity: real("quantity").notNull(),
  unit: text("unit"),
  lot: text("lot"),
  expiryDate: text("expiry_date"),
  companyId: integer("company_id").notNull(),
});

export const countingCycles = sqliteTable("counting_cycles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  companyId: integer("company_id").notNull(),
  type: text("type").notNull().$type<CountingCycleType>(),
  status: text("status").notNull().default("pendente").$type<CountingCycleStatus>(),
  createdBy: text("created_by").references(() => users.id),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  companyStatusIdx: index("idx_counting_cycles_company_status").on(table.companyId, table.status),
}));

export const countingCycleItems = sqliteTable("counting_cycle_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cycleId: text("cycle_id").notNull().references(() => countingCycles.id),
  companyId: integer("company_id").notNull(),
  addressId: text("address_id").references(() => wmsAddresses.id),
  productId: text("product_id").references(() => products.id),
  palletId: text("pallet_id").references(() => pallets.id),
  expectedQty: real("expected_qty"),
  countedQty: real("counted_qty"),
  lot: text("lot"),
  expiryDate: text("expiry_date"),
  oldLot: text("old_lot"),
  oldExpiryDate: text("old_expiry_date"),
  status: text("status").notNull().default("pendente").$type<CountingCycleItemStatus>(),
  countedBy: text("counted_by").references(() => users.id),
  countedAt: timestamp("counted_at"),
  divergencePct: real("divergence_pct"),
  createdAt: timestamp("created_at").notNull().default(new Date().toISOString()),
});

export interface MappingField {
  appField: string;
  type: "string" | "number" | "date" | "boolean";
  required: boolean;
  dbExpression: string;
  cast?: string;
  defaultValue?: string;
}

export interface DataContractField {
  appField: string;
  type: "string" | "number" | "date" | "boolean";
  required: boolean;
  description: string;
  example: string;
}

export const datasetEnum = ["orders", "products", "order_items", "work_units"] as const;
export type DatasetName = typeof datasetEnum[number];

export type Db2Mapping = typeof db2Mappings.$inferSelect;
export type InsertDb2Mapping = typeof db2Mappings.$inferInsert;

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertRouteSchema = createInsertSchema(routes).omit({ id: true }).extend({ code: z.string().optional() });
export const insertSectionSchema = createInsertSchema(sections);
export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertWorkUnitSchema = createInsertSchema(workUnits).omit({ id: true });
export const insertPickingSessionSchema = createInsertSchema(pickingSessions).omit({ id: true, createdAt: true, lastHeartbeat: true });
export const insertExceptionSchema = createInsertSchema(exceptions).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertManualQtyRuleSchema = createInsertSchema(manualQtyRules).omit({ id: true, createdAt: true });
export const insertOrderVolumeSchema = createInsertSchema(orderVolumes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWmsAddressSchema = createInsertSchema(wmsAddresses).omit({ id: true, createdAt: true });
export const insertPalletSchema = createInsertSchema(pallets).omit({ id: true, createdAt: true });
export const insertPalletItemSchema = createInsertSchema(palletItems).omit({ id: true, createdAt: true });
export const insertPalletMovementSchema = createInsertSchema(palletMovements).omit({ id: true, createdAt: true });
export const insertNfCacheSchema = createInsertSchema(nfCache).omit({ id: true });
export const insertNfItemSchema = createInsertSchema(nfItems).omit({ id: true });
export const insertCountingCycleSchema = createInsertSchema(countingCycles).omit({ id: true, createdAt: true });
export const insertCountingCycleItemSchema = createInsertSchema(countingCycleItems).omit({ id: true, createdAt: true });
export const insertProductCompanyStockSchema = createInsertSchema(productCompanyStock).omit({ id: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertRoute = z.infer<typeof insertRouteSchema>;
export type Route = typeof routes.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertWorkUnit = z.infer<typeof insertWorkUnitSchema>;
export type WorkUnit = typeof workUnits.$inferSelect;
export type InsertPickingSession = z.infer<typeof insertPickingSessionSchema>;
export type PickingSession = typeof pickingSessions.$inferSelect;
export type InsertException = z.infer<typeof insertExceptionSchema>;
export type Exception = typeof exceptions.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SectionGroup = typeof sectionGroups.$inferSelect;
export type OrderVolume = typeof orderVolumes.$inferSelect;
export type InsertOrderVolume = z.infer<typeof insertOrderVolumeSchema>;
export type WmsAddress = typeof wmsAddresses.$inferSelect;
export type InsertWmsAddress = z.infer<typeof insertWmsAddressSchema>;
export type Pallet = typeof pallets.$inferSelect;
export type InsertPallet = z.infer<typeof insertPalletSchema>;
export type PalletItem = typeof palletItems.$inferSelect;
export type InsertPalletItem = z.infer<typeof insertPalletItemSchema>;
export type PalletMovement = typeof palletMovements.$inferSelect;
export type InsertPalletMovement = z.infer<typeof insertPalletMovementSchema>;
export type NfCache = typeof nfCache.$inferSelect;
export type InsertNfCache = z.infer<typeof insertNfCacheSchema>;
export type NfItem = typeof nfItems.$inferSelect;
export type InsertNfItem = z.infer<typeof insertNfItemSchema>;
export type CountingCycle = typeof countingCycles.$inferSelect;
export type InsertCountingCycle = z.infer<typeof insertCountingCycleSchema>;
export type CountingCycleItem = typeof countingCycleItems.$inferSelect;
export type InsertCountingCycleItem = z.infer<typeof insertCountingCycleItemSchema>;
export type ProductCompanyStock = typeof productCompanyStock.$inferSelect;
export type InsertProductCompanyStock = z.infer<typeof insertProductCompanyStockSchema>;

export interface BatchSyncItem {
  orderItemId: string;
  qtyToAdd: number;
}

export interface BatchSyncException {
  orderItemId: string;
  type: ExceptionType;
  quantity: number;
  observation?: string;
  authorizedBy?: string;
  authorizedByName?: string;
}

export interface BatchSyncPayload {
  items: BatchSyncItem[];
  exceptions: BatchSyncException[];
}
export type InsertSectionGroup = typeof sectionGroups.$inferInsert;
export type ManualQtyRule = typeof manualQtyRules.$inferSelect;
export type InsertManualQtyRule = z.infer<typeof insertManualQtyRuleSchema>;


export const loginSchema = z.object({
  username: z.string().min(1, "Usuário é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
  companyId: z.number().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type OrderWithItems = Order & {
  items: (OrderItem & { product: Product })[];
  route?: Route | null;
  pickingSessions?: PickingSession[];
};

export type WorkUnitWithDetails = WorkUnit & {
  order: Order;
  items: (OrderItem & { product: Product })[];
  lockedByUser?: User | null;
  lockedByName?: string;
};

export type PalletWithItems = Pallet & {
  items: PalletItem[];
  address?: WmsAddress | null;
};

export type Section = typeof sections.$inferSelect;
