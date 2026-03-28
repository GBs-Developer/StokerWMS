import type { Express, Request, Response } from "express";
import { isAuthenticated, requireRole, requireCompany, getTokenFromRequest } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, sql, desc, isNull, ilike, or, inArray, ne } from "drizzle-orm";
import {
  wmsAddresses, pallets, palletItems, palletMovements, nfCache, nfItems,
  countingCycles, countingCycleItems, productCompanyStock, products,
  type WmsAddress, type Pallet, type PalletItem,
} from "@shared/schema";
import { z } from "zod";
import { broadcastSSE } from "./sse";
import { randomUUID } from "crypto";

const addressSchema = z.object({
  bairro: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  rua: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  bloco: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  nivel: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  type: z.string().max(30).optional(),
});

const palletItemSchema = z.object({
  productId: z.string().min(1),
  erpNfId: z.string().nullable().optional(),
  quantity: z.number().positive(),
  lot: z.string().max(100).nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  fefoEnabled: z.boolean().optional(),
});

const createPalletSchema = z.object({
  items: z.array(palletItemSchema).min(1),
  nfIds: z.array(z.string()).optional(),
});

const allocatePalletSchema = z.object({
  addressId: z.string().min(1),
});

const countItemSchema = z.object({
  itemId: z.string().min(1),
  countedQty: z.number().min(0),
  lot: z.string().max(100).optional(),
  expiryDate: z.string().optional(),
});

function getCompanyId(req: Request): number {
  return (req as any).companyId;
}

function getUserId(req: Request): string {
  return (req as any).user.id;
}

function getClientIp(req: Request): string | undefined {
  const ip = req.ip;
  if (Array.isArray(ip)) return ip[0];
  return ip;
}

function getUserAgent(req: Request): string | undefined {
  const ua = req.headers["user-agent"];
  if (Array.isArray(ua)) return ua[0];
  return ua;
}

async function createAuditLog(req: Request, action: string, entityType: string, entityId: string, details: string) {
  await storage.createAuditLog({
    userId: getUserId(req),
    action,
    entityType,
    entityId,
    details,
    companyId: getCompanyId(req),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
}

export function registerWmsRoutes(app: Express) {
  const authMiddleware = [isAuthenticated, requireCompany];
  const supervisorRoles = requireRole("supervisor", "administrador");
  const receiverRoles = requireRole("recebedor", "supervisor", "administrador");
  const forkliftRoles = requireRole("empilhador", "supervisor", "administrador");
  const wmsCounterRoles = requireRole("conferente_wms", "supervisor", "administrador");
  const anyWmsRole = requireRole("recebedor", "empilhador", "conferente_wms", "supervisor", "administrador");

  app.get("/api/wms-addresses", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const addresses = await db.select().from(wmsAddresses)
        .where(eq(wmsAddresses.companyId, companyId))
        .orderBy(wmsAddresses.code);
      res.json(addresses);
    } catch (error) {
      console.error("Get addresses error:", error);
      res.status(500).json({ error: "Erro ao buscar endereços" });
    }
  });

  app.post("/api/wms-addresses", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const parsed = addressSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      }
      const { bairro, rua, bloco, nivel, type } = parsed.data;
      const code = `${bairro}-${rua}-${bloco}-${nivel}`;

      const existing = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.companyId, companyId), eq(wmsAddresses.code, code)));
      if (existing.length > 0) {
        return res.status(400).json({ error: "Endereço já existe" });
      }

      const [address] = await db.insert(wmsAddresses).values({
        companyId,
        bairro,
        rua,
        bloco,
        nivel,
        code,
        type: type || "standard",
        createdBy: getUserId(req),
        createdAt: new Date().toISOString(),
      }).returning();

      await createAuditLog(req, "create", "wms_address", address.id, `Endereço criado: ${code}`);
      res.json(address);
    } catch (error) {
      console.error("Create address error:", error);
      res.status(500).json({ error: "Erro ao criar endereço" });
    }
  });

  app.patch("/api/wms-addresses/:id", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { bairro, rua, bloco, nivel, type, active } = req.body;

      const [existing] = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.id, id), eq(wmsAddresses.companyId, companyId)));
      if (!existing) {
        return res.status(404).json({ error: "Endereço não encontrado" });
      }

      const updates: any = {};
      if (bairro !== undefined) updates.bairro = bairro;
      if (rua !== undefined) updates.rua = rua;
      if (bloco !== undefined) updates.bloco = bloco;
      if (nivel !== undefined) updates.nivel = nivel;
      if (type !== undefined) updates.type = type;
      if (active !== undefined) updates.active = active;

      if (updates.bairro || updates.rua || updates.bloco || updates.nivel) {
        updates.code = `${updates.bairro || existing.bairro}-${updates.rua || existing.rua}-${updates.bloco || existing.bloco}-${updates.nivel || existing.nivel}`;
      }

      const [updated] = await db.update(wmsAddresses).set(updates).where(eq(wmsAddresses.id, id)).returning();
      await createAuditLog(req, "update", "wms_address", id, `Endereço atualizado: ${updated.code}`);
      res.json(updated);
    } catch (error) {
      console.error("Update address error:", error);
      res.status(500).json({ error: "Erro ao atualizar endereço" });
    }
  });

  app.delete("/api/wms-addresses/:id", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [existing] = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.id, id), eq(wmsAddresses.companyId, companyId)));
      if (!existing) {
        return res.status(404).json({ error: "Endereço não encontrado" });
      }

      const activePallets = await db.select().from(pallets)
        .where(and(eq(pallets.addressId, id), sql`${pallets.status} != 'cancelado'`));
      if (activePallets.length > 0) {
        return res.status(400).json({ error: "Endereço possui pallets alocados" });
      }

      await db.delete(wmsAddresses).where(eq(wmsAddresses.id, id));
      await createAuditLog(req, "delete", "wms_address", id, `Endereço apagado: ${existing.code}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete address error:", error);
      res.status(500).json({ error: "Erro ao apagar endereço" });
    }
  });

  app.get("/api/wms-addresses/with-occupancy", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const allAddresses = await db.select().from(wmsAddresses)
        .where(eq(wmsAddresses.companyId, companyId))
        .orderBy(wmsAddresses.code);

      const occupiedPallets = await db.select({
        addressId: pallets.addressId,
        palletId: pallets.id,
        palletCode: pallets.code,
        palletStatus: pallets.status,
      }).from(pallets)
        .where(and(
          eq(pallets.companyId, companyId),
          sql`${pallets.status} != 'cancelado'`,
          sql`${pallets.addressId} IS NOT NULL`,
        ));

      const occupancyMap = new Map<string, { palletId: string; palletCode: string; palletStatus: string }>();
      for (const p of occupiedPallets) {
        if (p.addressId) {
          occupancyMap.set(p.addressId, { palletId: p.palletId, palletCode: p.palletCode, palletStatus: p.palletStatus });
        }
      }

      const enriched = allAddresses.map(addr => ({
        ...addr,
        occupied: occupancyMap.has(addr.id),
        pallet: occupancyMap.get(addr.id) || null,
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Get addresses with occupancy error:", error);
      res.status(500).json({ error: "Erro ao buscar endereços" });
    }
  });

  app.get("/api/wms-addresses/available", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const allAddresses = await db.select().from(wmsAddresses)
        .where(and(
          eq(wmsAddresses.companyId, companyId),
          eq(wmsAddresses.active, true),
          eq(wmsAddresses.type, "standard"),
        ));

      const occupiedAddressIds = await db.select({ addressId: pallets.addressId }).from(pallets)
        .where(and(
          eq(pallets.companyId, companyId),
          sql`${pallets.status} IN ('sem_endereco', 'alocado', 'em_transferencia')`,
          sql`${pallets.addressId} IS NOT NULL`,
        ));

      const occupiedSet = new Set(occupiedAddressIds.map(p => p.addressId).filter(Boolean));
      const available = allAddresses.filter(a => !occupiedSet.has(a.id));
      res.json(available);
    } catch (error) {
      console.error("Get available addresses error:", error);
      res.status(500).json({ error: "Erro ao buscar endereços disponíveis" });
    }
  });

  app.post("/api/wms-addresses/import", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { addresses } = req.body;

      if (!Array.isArray(addresses)) {
        return res.status(400).json({ error: "Lista de endereços inválida" });
      }

      const result = await db.transaction(async (tx) => {
        let created = 0;
        let skipped = 0;

        for (const addr of addresses) {
          if (!addr.bairro || !addr.rua || !addr.bloco || !addr.nivel) {
            skipped++;
            continue;
          }
          const code = `${String(addr.bairro)}-${String(addr.rua)}-${String(addr.bloco)}-${String(addr.nivel)}`;
          const existing = await tx.select().from(wmsAddresses)
            .where(and(eq(wmsAddresses.companyId, companyId), eq(wmsAddresses.code, code)));

          if (existing.length > 0) {
            skipped++;
            continue;
          }

          await tx.insert(wmsAddresses).values({
            companyId,
            bairro: String(addr.bairro),
            rua: String(addr.rua),
            bloco: String(addr.bloco),
            nivel: String(addr.nivel),
            code,
            type: addr.type || "standard",
            createdBy: getUserId(req),
            createdAt: new Date().toISOString(),
          });
          created++;
        }

        return { created, skipped };
      });

      await createAuditLog(req, "import", "wms_address", "", `Importação: ${result.created} criados, ${result.skipped} ignorados`);
      res.json(result);
    } catch (error) {
      console.error("Import addresses error:", error);
      res.status(500).json({ error: "Erro ao importar endereços" });
    }
  });

  app.get("/api/pallets", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const statusFilter = req.query.status as string | undefined;

      const conditions = [eq(pallets.companyId, companyId)];
      if (statusFilter) {
        conditions.push(eq(pallets.status, statusFilter as any));
      }

      const result = await db.select().from(pallets)
        .where(and(...conditions))
        .orderBy(desc(pallets.createdAt))
        .limit(500);

      const palletIds = result.map(p => p.id);
      const addressIds = result.map(p => p.addressId).filter(Boolean) as string[];

      const allItems = palletIds.length > 0
        ? await db.select().from(palletItems).where(sql`${palletItems.palletId} IN (${sql.join(palletIds.map(id => sql`${id}`), sql`, `)})`)
        : [];

      const allAddresses = addressIds.length > 0
        ? await db.select().from(wmsAddresses).where(sql`${wmsAddresses.id} IN (${sql.join(addressIds.map(id => sql`${id}`), sql`, `)})`)
        : [];

      const itemsByPallet = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const list = itemsByPallet.get(item.palletId) || [];
        list.push(item);
        itemsByPallet.set(item.palletId, list);
      }

      const addressMap = new Map<string, (typeof allAddresses)[0]>();
      for (const addr of allAddresses) {
        addressMap.set(addr.id, addr);
      }

      const enriched = result.map(p => ({
        ...p,
        items: itemsByPallet.get(p.id) || [],
        address: p.addressId ? addressMap.get(p.addressId) || null : null,
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Get pallets error:", error);
      res.status(500).json({ error: "Erro ao buscar pallets" });
    }
  });

  app.post("/api/pallets", ...authMiddleware, receiverRoles, async (req: Request, res: Response) => {
    try {
      const parsed = createPalletSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      }
      const { items, nfIds } = parsed.data;
      const companyId = getCompanyId(req);
      const userId = getUserId(req);

      // Validação de estoque real do ERP
      if (Array.isArray(items)) {
        for (const item of items) {
          const [stockRecord] = await db.select()
            .from(productCompanyStock)
            .where(and(
              eq(productCompanyStock.productId, item.productId),
              eq(productCompanyStock.companyId, companyId)
            ));

          const erpStock = Number(stockRecord?.stockQty || 0);

          const otherPalletsItems = await db.select({
            quantity: sql<number>`SUM(${palletItems.quantity})`
          })
          .from(palletItems)
          .innerJoin(pallets, eq(palletItems.palletId, pallets.id))
          .where(and(
            eq(palletItems.productId, item.productId),
            eq(palletItems.companyId, companyId),
            sql`${pallets.status} != 'cancelado'`
          ));

          const alreadyInPallets = Number(otherPalletsItems[0]?.quantity || 0);
          const currentPalletRequestTotal = items
            .filter(i => i.productId === item.productId)
            .reduce((acc, curr) => acc + Number(curr.quantity), 0);

          if (alreadyInPallets + currentPalletRequestTotal > erpStock) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            return res.status(400).json({ 
              error: `Estoque insuficiente para o produto ${product?.erpCode || item.productId}. ERP: ${erpStock.toLocaleString()}, Já em pallets: ${alreadyInPallets.toLocaleString()}, Solicitado: ${currentPalletRequestTotal.toLocaleString()}` 
            });
          }
        }
      }

      const seq = Date.now().toString(36).toUpperCase().slice(-6);
      const code = `P${companyId}-${seq}`;
      const now = new Date().toISOString();

      const { pallet, createdItems } = await db.transaction(async (tx) => {
        const [pallet] = await tx.insert(pallets).values({
          companyId,
          code,
          status: "sem_endereco",
          createdBy: userId,
          createdAt: now,
        }).returning();

        const createdItems = [];
        if (Array.isArray(items)) {
          for (const item of items) {
            const [inserted] = await tx.insert(palletItems).values({
              palletId: pallet.id,
              productId: item.productId,
              erpNfId: item.erpNfId || null,
              quantity: item.quantity,
              lot: item.lot || null,
              expiryDate: item.expiryDate || null,
              fefoEnabled: item.fefoEnabled || false,
              companyId,
              createdAt: now,
            }).returning();
            createdItems.push(inserted);
          }
        }

        await tx.insert(palletMovements).values({
          palletId: pallet.id,
          companyId,
          movementType: "created",
          userId,
          notes: nfIds ? `NFs: ${nfIds.join(", ")}` : null,
          createdAt: now,
        });

        return { pallet, createdItems };
      });

      await createAuditLog(req, "create", "pallet", pallet.id, `Pallet criado: ${code}`);
      broadcastSSE("pallet_created", { palletId: pallet.id, code, companyId });

      res.json({ ...pallet, items: createdItems });
    } catch (error) {
      console.error("Create pallet error:", error);
      res.status(500).json({ error: "Erro ao criar pallet" });
    }
  });

  app.get("/api/pallets/:id", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }

      const items = await db.select().from(palletItems).where(eq(palletItems.palletId, id));
      let address = null;
      if (pallet.addressId) {
        const [addr] = await db.select().from(wmsAddresses).where(eq(wmsAddresses.id, pallet.addressId));
        address = addr || null;
      }

      const movements = await db.select().from(palletMovements)
        .where(eq(palletMovements.palletId, id))
        .orderBy(desc(palletMovements.createdAt));

      const itemProductIds = [...new Set(items.map(i => i.productId))];
      const itemProducts = itemProductIds.length > 0
        ? await db.select().from(products).where(inArray(products.id, itemProductIds))
        : [];
      const itemProductMap = new Map(itemProducts.map(p => [p.id, p]));
      const enrichedItems = items.map(item => ({ ...item, product: itemProductMap.get(item.productId) || null }));

      res.json({ ...pallet, items: enrichedItems, address, movements });
    } catch (error) {
      console.error("Get pallet error:", error);
      res.status(500).json({ error: "Erro ao buscar pallet" });
    }
  });

  app.patch("/api/pallets/:id", ...authMiddleware, receiverRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { items } = req.body;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }

      if (pallet.status === "cancelado") {
        return res.status(400).json({ error: "Pallet cancelado não pode ser editado" });
      }

      // Validação de estoque real do ERP
      if (Array.isArray(items)) {
        for (const item of items) {
          const [stockRecord] = await db.select()
            .from(productCompanyStock)
            .where(and(
              eq(productCompanyStock.productId, item.productId),
              eq(productCompanyStock.companyId, companyId)
            ));

          const erpStock = Number(stockRecord?.stockQty || 0);

          const otherPalletsItems = await db.select({
            quantity: sql<number>`SUM(${palletItems.quantity})`
          })
          .from(palletItems)
          .innerJoin(pallets, eq(palletItems.palletId, pallets.id))
          .where(and(
            eq(palletItems.productId, item.productId),
            eq(palletItems.companyId, companyId),
            sql`${pallets.status} != 'cancelado'`,
            sql`${pallets.id} != ${id}`
          ));

          const alreadyInPallets = Number(otherPalletsItems[0]?.quantity || 0);
          const currentPalletRequestTotal = items
            .filter(i => i.productId === item.productId)
            .reduce((acc, curr) => acc + Number(curr.quantity), 0);

          if (alreadyInPallets + currentPalletRequestTotal > erpStock) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            return res.status(400).json({ 
              error: `Estoque insuficiente para o produto ${product?.erpCode || item.productId}. ERP: ${erpStock.toLocaleString()}, Já em outros pallets: ${alreadyInPallets.toLocaleString()}, Solicitado: ${currentPalletRequestTotal.toLocaleString()}` 
            });
          }
        }
      }

      if (Array.isArray(items)) {
        const updateNow = new Date().toISOString();
        await db.transaction(async (tx) => {
          await tx.delete(palletItems).where(eq(palletItems.palletId, id));
          for (const item of items) {
            await tx.insert(palletItems).values({
              palletId: id,
              productId: item.productId,
              erpNfId: item.erpNfId || null,
              quantity: item.quantity,
              lot: item.lot || null,
              expiryDate: item.expiryDate || null,
              fefoEnabled: item.fefoEnabled || false,
              companyId,
              createdAt: updateNow,
            });
          }
        });
      }

      await createAuditLog(req, "update", "pallet", id, `Pallet atualizado: ${pallet.code}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Update pallet error:", error);
      res.status(500).json({ error: "Erro ao atualizar pallet" });
    }
  });

  app.post("/api/pallets/:id/allocate", ...authMiddleware, forkliftRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const parsed = allocatePalletSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "ID do endereço é obrigatório" });
      }
      const { addressId } = parsed.data;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }
      if (pallet.status === "cancelado") {
        return res.status(400).json({ error: "Pallet cancelado" });
      }

      const [address] = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.id, addressId), eq(wmsAddresses.companyId, companyId)));
      if (!address) {
        return res.status(404).json({ error: "Endereço não encontrado ou de outra empresa" });
      }
      if (!address.active) {
        return res.status(400).json({ error: "Endereço inativo" });
      }

      const now = new Date().toISOString();

      const allocationResult = await db.transaction(async (tx) => {
        const occupant = await tx.select().from(pallets)
          .where(and(
            eq(pallets.addressId, addressId),
            sql`${pallets.status} != 'cancelado'`,
            sql`${pallets.id} != ${id}`,
          ));
        if (occupant.length > 0) {
          return { error: "Endereço já ocupado por outro pallet" } as const;
        }

        await tx.update(pallets).set({
          addressId,
          status: "alocado",
          allocatedAt: now,
        }).where(eq(pallets.id, id));

        await tx.insert(palletMovements).values({
          palletId: id,
          companyId,
          movementType: "allocated",
          fromAddressId: pallet.addressId || null,
          toAddressId: addressId,
          userId: getUserId(req),
          createdAt: now,
        });

        return { success: true } as const;
      });

      if ("error" in allocationResult) {
        return res.status(400).json({ error: allocationResult.error });
      }

      await createAuditLog(req, "allocate", "pallet", id, `Pallet ${pallet.code} alocado em ${address.code}`);
      broadcastSSE("pallet_allocated", { palletId: id, addressId, companyId });

      res.json({ success: true });
    } catch (error) {
      console.error("Allocate pallet error:", error);
      res.status(500).json({ error: "Erro ao alocar pallet" });
    }
  });

  app.post("/api/pallets/:id/transfer", ...authMiddleware, forkliftRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { toAddressId } = req.body;
      if (!toAddressId || typeof toAddressId !== "string") {
        return res.status(400).json({ error: "Endereço de destino é obrigatório" });
      }

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }
      if (pallet.status === "cancelado") {
        return res.status(400).json({ error: "Pallet cancelado não pode ser transferido" });
      }
      if (pallet.status === "sem_endereco") {
        return res.status(400).json({ error: "Pallet sem endereço. Use o módulo de Check-in para alocar primeiro." });
      }

      if (!toAddressId) {
        return res.status(400).json({ error: "Selecione um endereço de destino" });
      }

      if (pallet.addressId === toAddressId) {
        return res.status(400).json({ error: "Endereço de destino é o mesmo endereço atual do pallet" });
      }

      const [toAddress] = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.id, toAddressId), eq(wmsAddresses.companyId, companyId)));
      if (!toAddress) {
        return res.status(404).json({ error: "Endereço destino não encontrado" });
      }
      if (!toAddress.active) {
        return res.status(400).json({ error: "Endereço destino está inativo" });
      }

      const now = new Date().toISOString();
      const fromAddressId = pallet.addressId;

      const transferResult = await db.transaction(async (tx) => {
        const occupant = await tx.select().from(pallets)
          .where(and(
            eq(pallets.addressId, toAddressId),
            sql`${pallets.status} != 'cancelado'`,
            sql`${pallets.id} != ${id}`,
          ));
        if (occupant.length > 0) {
          return { error: "Endereço destino já ocupado por outro pallet" } as const;
        }

        await tx.update(pallets).set({
          addressId: toAddressId,
          status: "alocado",
        }).where(eq(pallets.id, id));

        await tx.insert(palletMovements).values({
          palletId: id,
          companyId,
          movementType: "transferred",
          fromAddressId: fromAddressId || null,
          toAddressId,
          userId: getUserId(req),
          createdAt: now,
        });

        return { success: true } as const;
      });

      if ("error" in transferResult) {
        return res.status(400).json({ error: transferResult.error });
      }

      await createAuditLog(req, "transfer", "pallet", id, `Pallet ${pallet.code} transferido para ${toAddress.code}`);
      broadcastSSE("pallet_transferred", { palletId: id, fromAddressId, toAddressId, companyId });

      res.json({ success: true });
    } catch (error) {
      console.error("Transfer pallet error:", error);
      res.status(500).json({ error: "Erro ao transferir pallet" });
    }
  });

  app.post("/api/pallets/:id/split", ...authMiddleware, forkliftRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { itemIds } = req.body;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }
      if (pallet.status === "cancelado") {
        return res.status(400).json({ error: "Pallet cancelado" });
      }

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Selecione itens para dividir" });
      }

      const allItems = await db.select().from(palletItems).where(eq(palletItems.palletId, id));
      if (itemIds.length >= allItems.length) {
        return res.status(400).json({ error: "Não é possível mover todos os itens" });
      }

      const newCode = `P${companyId}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const now = new Date().toISOString();

      const [newPallet] = await db.insert(pallets).values({
        companyId,
        code: newCode,
        status: "sem_endereco",
        createdBy: getUserId(req),
        createdAt: now,
      }).returning();

      for (const itemId of itemIds) {
        await db.update(palletItems).set({ palletId: newPallet.id }).where(eq(palletItems.id, itemId));
      }

      await db.insert(palletMovements).values({
        palletId: newPallet.id,
        companyId,
        movementType: "split",
        fromPalletId: id,
        userId: getUserId(req),
        notes: `Dividido de ${pallet.code}`,
        createdAt: now,
      });

      await createAuditLog(req, "split", "pallet", id, `Pallet ${pallet.code} dividido -> ${newCode}`);
      res.json({ originalPallet: pallet, newPallet });
    } catch (error) {
      console.error("Split pallet error:", error);
      res.status(500).json({ error: "Erro ao dividir pallet" });
    }
  });

  app.post("/api/pallets/:id/cancel", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { reason } = req.body;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }
      if (pallet.status === "cancelado") {
        return res.status(400).json({ error: "Pallet já cancelado" });
      }

      if (!reason || reason.trim().length < 3) {
        return res.status(400).json({ error: "Informe o motivo do cancelamento (mínimo 3 caracteres)" });
      }

      const pickingAddresses = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.companyId, companyId), eq(wmsAddresses.type, "picking")));

      let pickingAddressId: string | null = null;
      if (pickingAddresses.length > 0) {
        pickingAddressId = pickingAddresses[0].id;
      }

      const now = new Date().toISOString();
      const cancelUserId = getUserId(req);

      await db.transaction(async (tx) => {
        await tx.update(pallets).set({
          status: "cancelado",
          addressId: pickingAddressId,
          cancelledAt: now,
          cancelledBy: cancelUserId,
          cancelReason: reason || null,
        }).where(eq(pallets.id, id));

        await tx.insert(palletMovements).values({
          palletId: id,
          companyId,
          movementType: "cancelled",
          fromAddressId: pallet.addressId || null,
          toAddressId: pickingAddressId,
          userId: cancelUserId,
          notes: reason || "Cancelamento",
          createdAt: now,
        });
      });

      await createAuditLog(req, "cancel", "pallet", id, `Pallet ${pallet.code} cancelado: ${reason || 'sem motivo'}`);
      broadcastSSE("pallet_cancelled", { palletId: id, companyId });

      res.json({ success: true });
    } catch (error) {
      console.error("Cancel pallet error:", error);
      res.status(500).json({ error: "Erro ao cancelar pallet" });
    }
  });

  app.post("/api/pallets/:id/cancel-unaddressed", ...authMiddleware,
    requireRole("recebedor", "empilhador", "supervisor", "administrador"),
    async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) return res.status(404).json({ error: "Pallet não encontrado" });
      if (pallet.status !== "sem_endereco") return res.status(400).json({ error: "Apenas pallets sem endereço podem ser cancelados aqui" });

      const now = new Date().toISOString();
      const userId = getUserId(req);

      await db.transaction(async (tx) => {
        await tx.update(pallets).set({
          status: "cancelado",
          cancelledAt: now,
          cancelledBy: userId,
          cancelReason: "Cancelado pelo operador",
        }).where(eq(pallets.id, id));

        await tx.delete(palletItems).where(eq(palletItems.palletId, id));

        await tx.insert(palletMovements).values({
          palletId: id,
          companyId,
          movementType: "cancelled",
          fromAddressId: null,
          userId,
          notes: "Cancelado pelo operador (sem endereço)",
          createdAt: now,
        });
      });

      await createAuditLog(req, "cancel", "pallet", id, `Pallet ${pallet.code} cancelado pelo operador (sem endereço)`);
      res.json({ success: true });
    } catch (error) {
      console.error("Cancel unaddressed pallet error:", error);
      res.status(500).json({ error: "Erro ao cancelar pallet" });
    }
  });

  app.post("/api/pallets/:id/partial-transfer", ...authMiddleware, forkliftRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { items, toAddressId } = req.body;

      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Selecione itens para transferir" });
      if (!toAddressId) return res.status(400).json({ error: "Endereço de destino obrigatório" });

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) return res.status(404).json({ error: "Pallet não encontrado" });
      if (pallet.status === "cancelado") return res.status(400).json({ error: "Pallet cancelado" });

      const [toAddress] = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.id, toAddressId), eq(wmsAddresses.companyId, companyId)));
      if (!toAddress) return res.status(404).json({ error: "Endereço não encontrado ou de outra empresa" });
      if (!toAddress.active) return res.status(400).json({ error: "Endereço de destino está inativo" });

      if (pallet.addressId === toAddressId) {
        return res.status(400).json({ error: "Endereço de destino é o mesmo endereço atual do pallet" });
      }

      const allItems = await db.select().from(palletItems).where(eq(palletItems.palletId, id));
      const now = new Date().toISOString();
      const userId = getUserId(req);

      const newCode = `P${companyId}-${Date.now().toString(36).toUpperCase().slice(-6)}`;

      const newPallet = await db.transaction(async (tx) => {
        const [newPallet] = await tx.insert(pallets).values({
          companyId,
          code: newCode,
          status: "alocado",
          addressId: toAddressId,
          createdBy: userId,
          createdAt: now,
          allocatedAt: now,
        }).returning();

        let anyTransferred = false;
        for (const reqItem of items) {
          const existing = allItems.find(i => i.productId === reqItem.productId);
          if (!existing) continue;
          const qty = Math.min(Number(reqItem.quantity), Number(existing.quantity));
          if (qty <= 0) continue;

          anyTransferred = true;
          await tx.insert(palletItems).values({
            palletId: newPallet.id,
            productId: existing.productId,
            quantity: qty,
            lot: existing.lot,
            expiryDate: existing.expiryDate,
            fefoEnabled: existing.fefoEnabled,
            companyId,
            createdAt: now,
          });

          const remaining = Number(existing.quantity) - qty;
          if (remaining <= 0) {
            await tx.delete(palletItems).where(eq(palletItems.id, existing.id));
          } else {
            await tx.update(palletItems).set({ quantity: remaining }).where(eq(palletItems.id, existing.id));
          }
        }

        if (!anyTransferred) throw new Error("Nenhum item válido para transferência");

        const remainingItems = await tx.select().from(palletItems).where(eq(palletItems.palletId, id));
        if (remainingItems.length === 0) {
          await tx.update(pallets).set({ status: "cancelado", cancelledAt: now }).where(eq(pallets.id, id));
        }

        await tx.insert(palletMovements).values({
          palletId: newPallet.id,
          companyId,
          movementType: "partial_transfer",
          fromAddressId: pallet.addressId,
          toAddressId,
          fromPalletId: id,
          userId,
          notes: `Transferência parcial de ${pallet.code}`,
          createdAt: now,
        });

        return newPallet;
      });

      await createAuditLog(req, "partial_transfer", "pallet", id, `Transferência parcial de ${pallet.code} para ${toAddress.code}`);
      res.json({ success: true, newPallet });
    } catch (error) {
      console.error("Partial transfer error:", error);
      res.status(500).json({ error: "Erro ao realizar transferência parcial" });
    }
  });

  app.get("/api/pallets/:id/print-label", ...authMiddleware, receiverRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }

      const items = await db.select().from(palletItems).where(eq(palletItems.palletId, id));
      const labelProductIds = [...new Set(items.map(i => i.productId))];
      const labelProducts = labelProductIds.length > 0
        ? await db.select().from(products).where(inArray(products.id, labelProductIds))
        : [];
      const labelProductMap = new Map(labelProducts.map(p => [p.id, p]));
      const enrichedItems = items.map(item => ({ ...item, product: labelProductMap.get(item.productId) || null }));

      let address = null;
      if (pallet.addressId) {
        const [addr] = await db.select().from(wmsAddresses).where(eq(wmsAddresses.id, pallet.addressId));
        address = addr;
      }

      const label = {
        palletCode: pallet.code,
        companyId: pallet.companyId,
        createdAt: pallet.createdAt,
        createdBy: pallet.createdBy,
        address: address?.code || "SEM ENDEREÇO",
        items: enrichedItems.map(i => ({
          product: i.product?.name || "Produto",
          erpCode: i.product?.erpCode || "",
          quantity: i.quantity,
          lot: i.lot,
          expiryDate: i.expiryDate,
          unit: i.product?.unit || "UN",
        })),
        nfIds: [...new Set(items.map(i => i.erpNfId).filter(Boolean))],
        qrData: pallet.code,
      };

      res.json(label);
    } catch (error) {
      console.error("Print label error:", error);
      res.status(500).json({ error: "Erro ao gerar etiqueta" });
    }
  });

  app.get("/api/pallets/by-address/:id", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const result = await db.select().from(pallets)
        .where(and(eq(pallets.addressId, id), eq(pallets.companyId, companyId), sql`${pallets.status} != 'cancelado'`));

      res.json(result);
    } catch (error) {
      console.error("Get pallet by address error:", error);
      res.status(500).json({ error: "Erro ao buscar pallet por endereço" });
    }
  });

  app.get("/api/nf/list", ...authMiddleware, receiverRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const q = (req.query.q as string || "").trim();

      let conditions = [eq(nfCache.companyId, companyId)];
      if (q) {
        conditions.push(
          sql`(${nfCache.nfNumber} ILIKE ${'%' + q + '%'} OR ${nfCache.supplierName} ILIKE ${'%' + q + '%'})`
        );
      }

      const results = await db.select().from(nfCache)
        .where(and(...conditions))
        .orderBy(desc(nfCache.syncedAt))
        .limit(50);

      res.json(results);
    } catch (error) {
      console.error("List NF error:", error);
      res.status(500).json({ error: "Erro ao listar NFs" });
    }
  });

  app.get("/api/nf/:nfNumber", ...authMiddleware, receiverRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { nfNumber } = req.params;

      const [nf] = await db.select().from(nfCache)
        .where(and(eq(nfCache.companyId, companyId), eq(nfCache.nfNumber, nfNumber)));

      if (!nf) {
        return res.status(404).json({ error: "NF não encontrada. Verifique o número ou aguarde sincronização." });
      }

      const items = await db.select().from(nfItems).where(eq(nfItems.nfId, nf.id));
      
      const productIds = items.map(i => i.productId).filter(Boolean) as string[];
      const productStock = productIds.length > 0 
        ? await db.select({
            productId: productCompanyStock.productId,
            stockQty: productCompanyStock.stockQty
          })
          .from(productCompanyStock)
          .where(and(
            inArray(productCompanyStock.productId, productIds),
            eq(productCompanyStock.companyId, companyId)
          ))
        : [];
        
      const alocadoStock = productIds.length > 0
        ? await db.select({
            productId: palletItems.productId,
            total: sql<number>`SUM(${palletItems.quantity})`
          })
          .from(palletItems)
          .innerJoin(pallets, eq(palletItems.palletId, pallets.id))
          .where(and(
             inArray(palletItems.productId, productIds),
             eq(palletItems.companyId, companyId),
             ne(pallets.status, "cancelado"),
             sql`${pallets.addressId} IS NOT NULL`
          ))
          .groupBy(palletItems.productId)
        : [];

      const stockMap = new Map();
      productStock.forEach(s => stockMap.set(s.productId, Number(s.stockQty)));
      
      const alocadoMap = new Map();
      alocadoStock.forEach(s => alocadoMap.set(s.productId, Number(s.total)));

      const enrichedItems = items.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        currentStock: item.productId ? (stockMap.get(item.productId) || 0) : 0,
        alocadoStock: item.productId ? (alocadoMap.get(item.productId) || 0) : 0,
      }));

      res.json({ ...nf, totalValue: Number(nf.totalValue), items: enrichedItems });
    } catch (error) {
      console.error("Get NF error:", error);
      res.status(500).json({ error: "Erro ao buscar NF" });
    }
  });

  app.post("/api/nf/sync", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    res.json({
      message: "Sincronização executada automaticamente a cada 10 minutos via sync_db2.py. Use POST /api/sync para forçar.",
      status: "ok",
    });
  });

  app.get("/api/pallet-movements", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const palletId = req.query.palletId as string | undefined;

      let conditions = [eq(palletMovements.companyId, companyId)];
      if (palletId) {
        conditions.push(eq(palletMovements.palletId, palletId));
      }

      const movements = await db.select().from(palletMovements)
        .where(and(...conditions))
        .orderBy(desc(palletMovements.createdAt))
        .limit(200);

      res.json(movements);
    } catch (error) {
      console.error("Get movements error:", error);
      res.status(500).json({ error: "Erro ao buscar movimentações" });
    }
  });

  app.get("/api/counting-cycles", ...authMiddleware, wmsCounterRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const result = await db.select().from(countingCycles)
        .where(eq(countingCycles.companyId, companyId))
        .orderBy(desc(countingCycles.createdAt));
      res.json(result);
    } catch (error) {
      console.error("Get counting cycles error:", error);
      res.status(500).json({ error: "Erro ao buscar ciclos" });
    }
  });

  app.post("/api/counting-cycles", ...authMiddleware, wmsCounterRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { type, items, notes } = req.body;

      const cycle = await db.transaction(async (tx) => {
        const [cycle] = await tx.insert(countingCycles).values({
          companyId,
          type: type || "por_endereco",
          status: "pendente",
          createdBy: getUserId(req),
          notes: notes || null,
          createdAt: new Date().toISOString(),
        }).returning();

        if (Array.isArray(items)) {
          for (const item of items) {
            await tx.insert(countingCycleItems).values({
              cycleId: cycle.id,
              companyId,
              addressId: item.addressId || null,
              productId: item.productId || null,
              palletId: item.palletId || null,
              expectedQty: item.expectedQty ?? null,
              status: "pendente",
              createdAt: new Date().toISOString(),
            });
          }
        }

        return cycle;
      });

      await createAuditLog(req, "create", "counting_cycle", cycle.id, `Ciclo de contagem criado`);
      res.json(cycle);
    } catch (error) {
      console.error("Create counting cycle error:", error);
      res.status(500).json({ error: "Erro ao criar ciclo" });
    }
  });

  app.get("/api/counting-cycles/:id", ...authMiddleware, wmsCounterRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [cycle] = await db.select().from(countingCycles)
        .where(and(eq(countingCycles.id, id), eq(countingCycles.companyId, companyId)));
      if (!cycle) {
        return res.status(404).json({ error: "Ciclo não encontrado" });
      }

      const items = await db.select().from(countingCycleItems)
        .where(eq(countingCycleItems.cycleId, id));

      const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))] as string[];
      const productMap = new Map<string, any>();
      if (productIds.length > 0) {
        const prods = await db.select().from(products)
          .where(sql`${products.id} IN (${sql.join(productIds.map(pid => sql`${pid}`), sql`, `)})`);
        for (const p of prods) productMap.set(p.id, p);
      }

      const enrichedItems = items.map(item => ({
        ...item,
        product: item.productId ? productMap.get(item.productId) || null : null,
      }));

      res.json({ ...cycle, items: enrichedItems });
    } catch (error) {
      console.error("Get counting cycle error:", error);
      res.status(500).json({ error: "Erro ao buscar ciclo" });
    }
  });

  app.post("/api/counting-cycles/:id/items", ...authMiddleware, wmsCounterRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { barcode, productId, palletId, addressId } = req.body;

      const [cycle] = await db.select().from(countingCycles)
        .where(and(eq(countingCycles.id, id), eq(countingCycles.companyId, companyId)));
      if (!cycle) return res.status(404).json({ error: "Ciclo não encontrado" });
      if (cycle.status === "aprovado") return res.status(400).json({ error: "Ciclo já aprovado" });
      if (cycle.status === "em_andamento") return res.status(400).json({ error: "Não é possível adicionar itens a um ciclo em andamento" });

      let resolvedProductId = productId || null;

      if (!resolvedProductId && barcode) {
        const [found] = await db.select().from(products).where(
          or(eq(products.barcode, barcode), eq(products.erpCode, barcode))
        );
        if (!found) return res.status(404).json({ error: "Produto não encontrado para este código" });
        resolvedProductId = found.id;
      }

      const [newItem] = await db.insert(countingCycleItems).values({
        id: `cci-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        cycleId: id,
        companyId,
        productId: resolvedProductId,
        palletId: palletId || null,
        addressId: addressId || null,
        expectedQty: null,
        status: "pendente",
        createdAt: new Date().toISOString(),
      }).returning();

      let productData = null;
      if (resolvedProductId) {
        const [p] = await db.select().from(products).where(eq(products.id, resolvedProductId));
        productData = p || null;
      }

      res.json({ ...newItem, product: productData });
    } catch (error) {
      console.error("Add counting cycle item error:", error);
      res.status(500).json({ error: "Erro ao adicionar item" });
    }
  });

  app.patch("/api/counting-cycles/:id/item", ...authMiddleware, wmsCounterRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const parsed = countItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors });
      }
      const { itemId, countedQty, lot, expiryDate } = parsed.data;

      const [cycle] = await db.select().from(countingCycles)
        .where(and(eq(countingCycles.id, id), eq(countingCycles.companyId, companyId)));
      if (!cycle) {
        return res.status(404).json({ error: "Ciclo não encontrado" });
      }
      if (cycle.status === "aprovado") {
        return res.status(400).json({ error: "Ciclo já aprovado" });
      }

      const [item] = await db.select().from(countingCycleItems)
        .where(and(eq(countingCycleItems.id, itemId), eq(countingCycleItems.cycleId, id)));
      if (!item) {
        return res.status(404).json({ error: "Item não encontrado" });
      }

      const now = new Date().toISOString();
      let divergencePct: number | null = null;
      if (item.expectedQty !== null && item.expectedQty !== undefined && item.expectedQty > 0) {
        divergencePct = Math.abs((countedQty - item.expectedQty) / item.expectedQty) * 100;
      }

      const updates: any = {
        countedQty,
        countedBy: getUserId(req),
        countedAt: now,
        status: "contado",
        divergencePct,
      };

      if (lot !== undefined) {
        updates.oldLot = item.lot;
        updates.lot = lot;
      }
      if (expiryDate !== undefined) {
        updates.oldExpiryDate = item.expiryDate;
        updates.expiryDate = expiryDate;
      }

      if (divergencePct !== null && divergencePct > 0) {
        updates.status = "divergente";
      }

      await db.transaction(async (tx) => {
        await tx.update(countingCycleItems).set(updates).where(eq(countingCycleItems.id, itemId));

        const allItems = await tx.select().from(countingCycleItems)
          .where(eq(countingCycleItems.cycleId, id));
        const allCounted = allItems.every(i => i.id === itemId ? true : i.status !== "pendente");
        if (allCounted) {
          await tx.update(countingCycles).set({
            status: "concluido",
            completedAt: now,
          }).where(eq(countingCycles.id, id));
        } else if (cycle.status === "pendente") {
          await tx.update(countingCycles).set({ status: "em_andamento" }).where(eq(countingCycles.id, id));
        }
      });

      await createAuditLog(req, "count_item", "counting_cycle_item", itemId, `Contagem: ${countedQty} (esperado: ${item.expectedQty})`);
      res.json({ success: true });
    } catch (error) {
      console.error("Count item error:", error);
      res.status(500).json({ error: "Erro ao registrar contagem" });
    }
  });

  app.post("/api/counting-cycles/:id/approve", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [cycle] = await db.select().from(countingCycles)
        .where(and(eq(countingCycles.id, id), eq(countingCycles.companyId, companyId)));
      if (!cycle) {
        return res.status(404).json({ error: "Ciclo não encontrado" });
      }
      if (cycle.status !== "concluido") {
        return res.status(400).json({ error: "Ciclo precisa estar concluído para aprovação" });
      }

      const now = new Date().toISOString();
      const approveUserId = getUserId(req);

      const items = await db.select().from(countingCycleItems)
        .where(eq(countingCycleItems.cycleId, id));

      await db.transaction(async (tx) => {
        await tx.update(countingCycles).set({
          status: "aprovado",
          approvedBy: approveUserId,
          approvedAt: now,
        }).where(eq(countingCycles.id, id));

        for (const item of items) {
          if (item.countedQty !== null && item.productId) {
            const existing = await tx.select().from(productCompanyStock)
              .where(and(
                eq(productCompanyStock.productId, item.productId),
                eq(productCompanyStock.companyId, companyId),
              ));

            if (existing.length > 0) {
              await tx.update(productCompanyStock).set({
                stockQty: item.countedQty,
                erpUpdatedAt: now,
              }).where(eq(productCompanyStock.id, existing[0].id));
            } else {
              await tx.insert(productCompanyStock).values({
                productId: item.productId,
                companyId,
                stockQty: item.countedQty,
                erpUpdatedAt: now,
              });
            }

            if (item.palletId && item.lot !== undefined) {
              await tx.update(palletItems).set({
                lot: item.lot,
                expiryDate: item.expiryDate,
              }).where(and(
                eq(palletItems.palletId, item.palletId),
                eq(palletItems.productId, item.productId),
              ));
            }
          }

          await tx.update(countingCycleItems).set({ status: "aprovado" })
            .where(eq(countingCycleItems.id, item.id));
        }
      });

      await createAuditLog(req, "approve", "counting_cycle", id, `Ciclo aprovado`);
      res.json({ success: true });
    } catch (error) {
      console.error("Approve counting cycle error:", error);
      res.status(500).json({ error: "Erro ao aprovar ciclo" });
    }
  });

  app.post("/api/counting-cycles/:id/reject", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { notes } = req.body;

      const [cycle] = await db.select().from(countingCycles)
        .where(and(eq(countingCycles.id, id), eq(countingCycles.companyId, companyId)));
      if (!cycle) {
        return res.status(404).json({ error: "Ciclo não encontrado" });
      }

      await db.update(countingCycles).set({
        status: "rejeitado",
        notes: notes || cycle.notes,
      }).where(eq(countingCycles.id, id));

      await createAuditLog(req, "reject", "counting_cycle", id, `Ciclo rejeitado: ${notes || ''}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Reject counting cycle error:", error);
      res.status(500).json({ error: "Erro ao rejeitar ciclo" });
    }
  });

  app.delete("/api/counting-cycles/:id", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [cycle] = await db.select().from(countingCycles)
        .where(and(eq(countingCycles.id, id), eq(countingCycles.companyId, companyId)));
      if (!cycle) {
        return res.status(404).json({ error: "Ciclo não encontrado" });
      }

      if (cycle.status === "em_andamento") {
        return res.status(400).json({ error: "Não é possível apagar um ciclo em andamento" });
      }

      await db.delete(countingCycleItems).where(eq(countingCycleItems.cycleId, id));
      await db.delete(countingCycles).where(eq(countingCycles.id, id));

      await createAuditLog(req, "delete", "counting_cycle", id, `Ciclo de contagem apagado (status: ${cycle.status})`);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete counting cycle error:", error);
      res.status(500).json({ error: "Erro ao apagar ciclo" });
    }
  });

  app.get("/api/products/by-barcode/:code", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const companyId = getCompanyId(req);

      let [product] = await db.select().from(products)
        .where(eq(products.barcode, code));

      if (!product) {
        [product] = await db.select().from(products)
          .where(eq(products.erpCode, code));
      }

      if (!product) {
        const boxMatches = await db.select().from(products)
          .where(sql`${products.boxBarcodes} LIKE ${'%' + code + '%'}`);
        product = boxMatches.find(p => {
          if (!p.boxBarcodes) return false;
          try {
            const barcodes = typeof p.boxBarcodes === "string" ? JSON.parse(p.boxBarcodes) : p.boxBarcodes;
            return Array.isArray(barcodes) && barcodes.some((b: any) => b.code === code);
          } catch { return false; }
        }) as any;
      }

      if (!product) {
        return res.status(404).json({ error: "Produto não encontrado" });
      }

      const [cs] = await db.select().from(productCompanyStock)
        .where(and(eq(productCompanyStock.productId, product.id), eq(productCompanyStock.companyId, companyId)));

      let boxQty = null;
      if (product.boxBarcodes) {
        try {
          const barcodes = typeof product.boxBarcodes === "string" ? JSON.parse(product.boxBarcodes) : product.boxBarcodes;
          if (Array.isArray(barcodes)) {
            const match = barcodes.find((b: any) => b.code === code);
            if (match) boxQty = match.qty;
          }
        } catch {}
      }

      res.json({
        ...product,
        companyStockQty: cs?.stockQty ?? product.stockQty,
        boxQty,
      });
    } catch (error) {
      console.error("Product by barcode error:", error);
      res.status(500).json({ error: "Erro ao buscar produto" });
    }
  });

  app.get("/api/products/search", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string || "").trim();
      const companyId = getCompanyId(req);
      const searchType = req.query.type as string || "all";

      const minLen = searchType === "code" ? 1 : 2;
      if (q.length < minLen) {
        return res.json([]);
      }

      const escapedQ = q.replace(/[%_\\]/g, "\\$&");
      const searchPattern = `%${escapedQ.replace(/\s+/g, "%")}%`;
      const exactPattern = `%${escapedQ}%`;

      const conditions = [];

      if (searchType === "code") {
        conditions.push(eq(products.erpCode, q));
      } else if (searchType === "description") {
        conditions.push(ilike(products.name, searchPattern));
      } else {
        conditions.push(or(
          ilike(products.name, searchPattern),
          ilike(products.erpCode, exactPattern),
          ilike(products.barcode, exactPattern)
        ));
      }

      let query = db.select().from(products);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const results = await query.limit(50);

      const productIds = results.map(p => p.id);

      const allCompanyStock = productIds.length > 0
        ? await db.select().from(productCompanyStock)
            .where(and(
              sql`${productCompanyStock.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
              eq(productCompanyStock.companyId, companyId)
            ))
        : [];

      const stockMap = new Map<string, number>();
      for (const cs of allCompanyStock) {
        stockMap.set(cs.productId, Number(cs.stockQty));
      }

      const addressStockAll = productIds.length > 0
        ? await db.select({
            productId: palletItems.productId,
            addressCode: wmsAddresses.code,
            quantity: sql<number>`SUM(${palletItems.quantity})`
          })
          .from(palletItems)
          .innerJoin(pallets, eq(palletItems.palletId, pallets.id))
          .innerJoin(wmsAddresses, eq(pallets.addressId, wmsAddresses.id))
          .where(and(
            sql`${palletItems.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
            eq(palletItems.companyId, companyId),
            sql`${pallets.status} != 'cancelado'`
          ))
          .groupBy(palletItems.productId, wmsAddresses.code)
        : [];

      const addressStockByProduct = new Map<string, Array<{ code: string; quantity: number }>>();
      for (const row of addressStockAll) {
        const list = addressStockByProduct.get(row.productId) || [];
        list.push({ code: row.addressCode, quantity: Number(row.quantity) });
        addressStockByProduct.set(row.productId, list);
      }

      const lastMovements = productIds.length > 0
        ? await db.select({
            productId: palletItems.productId,
            lastMovement: sql<string>`MAX(${palletMovements.createdAt})`,
            lastMovementType: sql<string>`(ARRAY_AGG(${palletMovements.movementType} ORDER BY ${palletMovements.createdAt} DESC))[1]`
          })
          .from(palletMovements)
          .innerJoin(palletItems, eq(palletMovements.palletId, palletItems.palletId))
          .where(and(
            sql`${palletItems.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
            eq(palletItems.companyId, companyId)
          ))
          .groupBy(palletItems.productId)
        : [];

      const lastMovementMap = new Map<string, { date: string; type: string }>();
      for (const m of lastMovements) {
        lastMovementMap.set(m.productId, { date: m.lastMovement, type: m.lastMovementType });
      }

      const withStock = results.map(p => {
        const totalStock = stockMap.get(p.id) ?? Number(p.stockQty ?? 0);
        const addresses = addressStockByProduct.get(p.id) || [];
        const totalInAddresses = addresses.reduce((acc, curr) => acc + curr.quantity, 0);
        const pickingStock = Math.max(0, totalStock - totalInAddresses);
        const lastMove = lastMovementMap.get(p.id);

        return {
          ...p,
          companyStockQty: totalStock,
          totalStock,
          pickingStock,
          addressCount: addresses.length,
          hasNoAddress: addresses.length === 0 && totalStock > 0,
          lastMovementDate: lastMove?.date || null,
          lastMovementType: lastMove?.type || null,
          addresses,
        };
      });

      const sorted = [...withStock].sort((a, b) => {
        if (a.erpCode === q) return -1;
        if (b.erpCode === q) return 1;
        if (a.totalStock > 0 && b.totalStock === 0) return -1;
        if (b.totalStock > 0 && a.totalStock === 0) return 1;
        return (a.name || "").localeCompare(b.name || "");
      });

      res.json(sorted);
    } catch (error) {
      console.error("Product search error:", error);
      res.status(500).json({ error: "Erro ao buscar produtos" });
    }
  });

  app.get("/api/products/:id/stock", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;

      const [product] = await db.select().from(products).where(eq(products.id, id));
      if (!product) {
        return res.status(404).json({ error: "Produto não encontrado" });
      }

      const [companyStock] = await db.select().from(productCompanyStock)
        .where(and(eq(productCompanyStock.productId, id), eq(productCompanyStock.companyId, companyId)));

      res.json({
        productId: id,
        companyId,
        stockQty: companyStock?.stockQty ?? product.stockQty,
        source: companyStock ? "product_company_stock" : "products_legacy",
        erpUpdatedAt: companyStock?.erpUpdatedAt || product.erpUpdatedAt,
      });
    } catch (error) {
      console.error("Get product stock error:", error);
      res.status(500).json({ error: "Erro ao buscar estoque" });
    }
  });

  app.get("/api/reports/counting-cycles", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const statusFilter = req.query.status as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const conditions = [eq(countingCycles.companyId, companyId)];
      if (statusFilter && statusFilter !== "all") {
        conditions.push(eq(countingCycles.status, statusFilter as any));
      }
      if (dateFrom) {
        conditions.push(sql`${countingCycles.createdAt} >= ${dateFrom}`);
      }
      if (dateTo) {
        conditions.push(sql`${countingCycles.createdAt} <= ${dateTo + "T23:59:59"}`);
      }

      const cycles = await db.select().from(countingCycles)
        .where(and(...conditions))
        .orderBy(desc(countingCycles.createdAt));

      const cycleIds = cycles.map(c => c.id);
      const allItems = cycleIds.length > 0
        ? await db.select().from(countingCycleItems)
            .where(sql`${countingCycleItems.cycleId} IN (${sql.join(cycleIds.map(id => sql`${id}`), sql`, `)})`)
        : [];

      const itemsByCycle = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const list = itemsByCycle.get(item.cycleId) || [];
        list.push(item);
        itemsByCycle.set(item.cycleId, list);
      }

      const userIds = new Set<string>();
      cycles.forEach(c => { if (c.createdBy) userIds.add(c.createdBy); if (c.approvedBy) userIds.add(c.approvedBy); });
      allItems.forEach(i => { if (i.countedBy) userIds.add(i.countedBy); });

      const userList = userIds.size > 0
        ? await db.select({ id: users.id, name: users.name }).from(users)
            .where(sql`${users.id} IN (${sql.join([...userIds].map(id => sql`${id}`), sql`, `)})`)
        : [];
      const userMap = new Map<string, string>();
      for (const u of userList) userMap.set(u.id, u.name);

      const productIds = new Set<string>();
      const addressIds = new Set<string>();
      allItems.forEach(i => {
        if (i.productId) productIds.add(i.productId);
        if (i.addressId) addressIds.add(i.addressId);
      });

      const productList = productIds.size > 0
        ? await db.select({ id: products.id, name: products.name, erpCode: products.erpCode }).from(products)
            .where(sql`${products.id} IN (${sql.join([...productIds].map(id => sql`${id}`), sql`, `)})`)
        : [];
      const productMap = new Map<string, { name: string; erpCode: string }>();
      for (const p of productList) productMap.set(p.id, { name: p.name, erpCode: p.erpCode });

      const addressList = addressIds.size > 0
        ? await db.select({ id: wmsAddresses.id, code: wmsAddresses.code }).from(wmsAddresses)
            .where(sql`${wmsAddresses.id} IN (${sql.join([...addressIds].map(id => sql`${id}`), sql`, `)})`)
        : [];
      const addressMap = new Map<string, string>();
      for (const a of addressList) addressMap.set(a.id, a.code);

      const enriched = cycles.map(c => {
        const items = itemsByCycle.get(c.id) || [];
        const totalItems = items.length;
        const countedItems = items.filter(i => i.status === "contado" || i.status === "divergente").length;
        const divergentItems = items.filter(i => i.status === "divergente").length;
        const avgDivergence = divergentItems > 0
          ? items.filter(i => i.divergencePct !== null).reduce((sum, i) => sum + Math.abs(Number(i.divergencePct || 0)), 0) / Math.max(1, items.filter(i => i.divergencePct !== null).length)
          : 0;

        return {
          ...c,
          createdByName: c.createdBy ? userMap.get(c.createdBy) || "—" : "—",
          approvedByName: c.approvedBy ? userMap.get(c.approvedBy) || "—" : "—",
          totalItems,
          countedItems,
          divergentItems,
          avgDivergencePct: Math.round(avgDivergence * 100) / 100,
          items: items.map(i => ({
            ...i,
            productName: i.productId ? productMap.get(i.productId)?.name || "—" : "—",
            productErpCode: i.productId ? productMap.get(i.productId)?.erpCode || "—" : "—",
            addressCode: i.addressId ? addressMap.get(i.addressId) || "—" : "—",
            countedByName: i.countedBy ? userMap.get(i.countedBy) || "—" : "—",
          })),
        };
      });

      const summary = {
        totalCycles: cycles.length,
        byStatus: {
          pendente: cycles.filter(c => c.status === "pendente").length,
          em_andamento: cycles.filter(c => c.status === "em_andamento").length,
          concluido: cycles.filter(c => c.status === "concluido").length,
          aprovado: cycles.filter(c => c.status === "aprovado").length,
          rejeitado: cycles.filter(c => c.status === "rejeitado").length,
        },
        totalItemsCounted: allItems.filter(i => i.countedQty !== null).length,
        totalDivergent: allItems.filter(i => i.status === "divergente").length,
      };

      res.json({ cycles: enriched, summary });
    } catch (error) {
      console.error("Counting cycles report error:", error);
      res.status(500).json({ error: "Erro ao gerar relatório de contagens" });
    }
  });

  app.get("/api/reports/wms-addresses", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const typeFilter = req.query.type as string | undefined;

      const conditions = [eq(wmsAddresses.companyId, companyId)];
      if (typeFilter && typeFilter !== "all") {
        conditions.push(eq(wmsAddresses.type, typeFilter));
      }

      const allAddresses = await db.select().from(wmsAddresses)
        .where(and(...conditions))
        .orderBy(wmsAddresses.code);

      const occupiedPallets = await db.select({
        addressId: pallets.addressId,
        palletId: pallets.id,
        palletCode: pallets.code,
        palletStatus: pallets.status,
      }).from(pallets)
        .where(and(
          eq(pallets.companyId, companyId),
          sql`${pallets.status} != 'cancelado'`,
          sql`${pallets.addressId} IS NOT NULL`,
        ));

      const occupancyMap = new Map<string, { palletId: string; palletCode: string; palletStatus: string }>();
      for (const p of occupiedPallets) {
        if (p.addressId) occupancyMap.set(p.addressId, { palletId: p.palletId, palletCode: p.palletCode, palletStatus: p.palletStatus });
      }

      const palletIds = occupiedPallets.map(p => p.palletId);
      const palletItemsData = palletIds.length > 0
        ? await db.select({
            palletId: palletItems.palletId,
            productId: palletItems.productId,
            quantity: palletItems.quantity,
          }).from(palletItems)
            .where(sql`${palletItems.palletId} IN (${sql.join(palletIds.map(id => sql`${id}`), sql`, `)})`)
        : [];

      const itemsByPallet = new Map<string, number>();
      for (const item of palletItemsData) {
        itemsByPallet.set(item.palletId, (itemsByPallet.get(item.palletId) || 0) + Number(item.quantity));
      }

      const enriched = allAddresses.map(addr => {
        const pallet = occupancyMap.get(addr.id);
        return {
          ...addr,
          occupied: !!pallet,
          palletCode: pallet?.palletCode || null,
          palletStatus: pallet?.palletStatus || null,
          palletItemCount: pallet ? (itemsByPallet.get(pallet.palletId) || 0) : 0,
        };
      });

      const typeLabels: Record<string, string> = { standard: "Padrão", picking: "Picking", recebimento: "Recebimento", expedicao: "Expedição" };
      const summary = {
        total: allAddresses.length,
        active: allAddresses.filter(a => a.active).length,
        inactive: allAddresses.filter(a => !a.active).length,
        occupied: enriched.filter(a => a.occupied).length,
        empty: enriched.filter(a => a.active && !a.occupied).length,
        byType: Object.entries(
          allAddresses.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {} as Record<string, number>)
        ).map(([type, count]) => ({ type, label: typeLabels[type] || type, count })),
        occupancyRate: allAddresses.filter(a => a.active).length > 0
          ? Math.round((enriched.filter(a => a.occupied).length / allAddresses.filter(a => a.active).length) * 100)
          : 0,
      };

      res.json({ addresses: enriched, summary });
    } catch (error) {
      console.error("WMS addresses report error:", error);
      res.status(500).json({ error: "Erro ao gerar relatório de endereços" });
    }
  });

  app.get("/api/reports/pallet-movements", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const movType = req.query.type as string | undefined;

      const conditions = [eq(palletMovements.companyId, companyId)];
      if (dateFrom) {
        conditions.push(sql`${palletMovements.createdAt} >= ${dateFrom}`);
      }
      if (dateTo) {
        conditions.push(sql`${palletMovements.createdAt} <= ${dateTo + "T23:59:59"}`);
      }
      if (movType && movType !== "all") {
        conditions.push(eq(palletMovements.movementType, movType as any));
      }

      const movements = await db.select().from(palletMovements)
        .where(and(...conditions))
        .orderBy(desc(palletMovements.createdAt))
        .limit(500);

      const palletIdsSet = new Set(movements.map(m => m.palletId));
      const addressIdsSet = new Set<string>();
      movements.forEach(m => {
        if (m.fromAddressId) addressIdsSet.add(m.fromAddressId);
        if (m.toAddressId) addressIdsSet.add(m.toAddressId);
      });
      const userIdsSet = new Set(movements.map(m => m.userId).filter(Boolean) as string[]);

      const palletList = palletIdsSet.size > 0
        ? await db.select({ id: pallets.id, code: pallets.code }).from(pallets)
            .where(sql`${pallets.id} IN (${sql.join([...palletIdsSet].map(id => sql`${id}`), sql`, `)})`)
        : [];
      const palletMap = new Map<string, string>();
      for (const p of palletList) palletMap.set(p.id, p.code);

      const addrList = addressIdsSet.size > 0
        ? await db.select({ id: wmsAddresses.id, code: wmsAddresses.code }).from(wmsAddresses)
            .where(sql`${wmsAddresses.id} IN (${sql.join([...addressIdsSet].map(id => sql`${id}`), sql`, `)})`)
        : [];
      const addrMap = new Map<string, string>();
      for (const a of addrList) addrMap.set(a.id, a.code);

      const uList = userIdsSet.size > 0
        ? await db.select({ id: users.id, name: users.name }).from(users)
            .where(sql`${users.id} IN (${sql.join([...userIdsSet].map(id => sql`${id}`), sql`, `)})`)
        : [];
      const uMap = new Map<string, string>();
      for (const u of uList) uMap.set(u.id, u.name);

      const enriched = movements.map(m => ({
        ...m,
        palletCode: palletMap.get(m.palletId) || "—",
        fromAddressCode: m.fromAddressId ? addrMap.get(m.fromAddressId) || "—" : "—",
        toAddressCode: m.toAddressId ? addrMap.get(m.toAddressId) || "—" : "—",
        performedByName: m.userId ? uMap.get(m.userId) || "—" : "—",
      }));

      const movementTypeLabels: Record<string, string> = {
        recebimento: "Recebimento",
        alocacao: "Alocação",
        transferencia: "Transferência",
        cancelamento: "Cancelamento",
        contagem: "Contagem",
      };

      const byType = movements.reduce((acc, m) => {
        acc[m.movementType] = (acc[m.movementType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byDay = movements.reduce((acc, m) => {
        const day = m.createdAt.split("T")[0];
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const summary = {
        totalMovements: movements.length,
        byType: Object.entries(byType).map(([type, count]) => ({ type, label: movementTypeLabels[type] || type, count })),
        byDay: Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([date, count]) => ({ date, count })),
      };

      res.json({ movements: enriched, summary });
    } catch (error) {
      console.error("Pallet movements report error:", error);
      res.status(500).json({ error: "Erro ao gerar relatório de movimentações" });
    }
  });
}
