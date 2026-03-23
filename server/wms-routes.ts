import type { Express, Request, Response } from "express";
import { isAuthenticated, requireRole, requireCompany, getTokenFromRequest } from "./auth";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import {
  wmsAddresses, pallets, palletItems, palletMovements, nfCache, nfItems,
  countingCycles, countingCycleItems, productCompanyStock, products,
  type WmsAddress, type Pallet, type PalletItem,
} from "@shared/schema";
import { z } from "zod";
import { broadcastSSE } from "./sse";
import { randomUUID } from "crypto";

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
      const { bairro, rua, bloco, nivel, type } = req.body;
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

      let created = 0;
      let skipped = 0;

      for (const addr of addresses) {
        const code = `${addr.bairro}-${addr.rua}-${addr.bloco}-${addr.nivel}`;
        const existing = await db.select().from(wmsAddresses)
          .where(and(eq(wmsAddresses.companyId, companyId), eq(wmsAddresses.code, code)));

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db.insert(wmsAddresses).values({
          companyId,
          bairro: addr.bairro,
          rua: addr.rua,
          bloco: addr.bloco,
          nivel: addr.nivel,
          code,
          type: addr.type || "standard",
          createdBy: getUserId(req),
          createdAt: new Date().toISOString(),
        });
        created++;
      }

      await createAuditLog(req, "import", "wms_address", "", `Importação: ${created} criados, ${skipped} ignorados`);
      res.json({ created, skipped });
    } catch (error) {
      console.error("Import addresses error:", error);
      res.status(500).json({ error: "Erro ao importar endereços" });
    }
  });

  app.get("/api/pallets", ...authMiddleware, anyWmsRole, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const statusFilter = req.query.status as string | undefined;

      let query = db.select().from(pallets).where(eq(pallets.companyId, companyId));
      if (statusFilter) {
        query = db.select().from(pallets).where(and(eq(pallets.companyId, companyId), eq(pallets.status, statusFilter as any)));
      }

      const result = await query.orderBy(desc(pallets.createdAt));

      const enriched = await Promise.all(result.map(async (p) => {
        const items = await db.select().from(palletItems).where(eq(palletItems.palletId, p.id));
        let address = null;
        if (p.addressId) {
          const [addr] = await db.select().from(wmsAddresses).where(eq(wmsAddresses.id, p.addressId));
          address = addr || null;
        }
        return { ...p, items, address };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Get pallets error:", error);
      res.status(500).json({ error: "Erro ao buscar pallets" });
    }
  });

  app.post("/api/pallets", ...authMiddleware, receiverRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const userId = getUserId(req);
      const { items, nfIds } = req.body;

      const code = `PLT-${companyId}-${Date.now().toString(36).toUpperCase()}`;

      const [pallet] = await db.insert(pallets).values({
        companyId,
        code,
        status: "sem_endereco",
        createdBy: userId,
        createdAt: new Date().toISOString(),
      }).returning();

      if (Array.isArray(items)) {
        for (const item of items) {
          await db.insert(palletItems).values({
            palletId: pallet.id,
            productId: item.productId,
            erpNfId: item.erpNfId || null,
            quantity: item.quantity,
            lot: item.lot || null,
            expiryDate: item.expiryDate || null,
            fefoEnabled: item.fefoEnabled || false,
            companyId,
            createdAt: new Date().toISOString(),
          });
        }
      }

      await db.insert(palletMovements).values({
        palletId: pallet.id,
        companyId,
        movementType: "created",
        userId,
        notes: nfIds ? `NFs: ${nfIds.join(", ")}` : null,
        createdAt: new Date().toISOString(),
      });

      await createAuditLog(req, "create", "pallet", pallet.id, `Pallet criado: ${code}`);
      broadcastSSE("pallet_created", { palletId: pallet.id, code, companyId });

      const palletItems2 = await db.select().from(palletItems).where(eq(palletItems.palletId, pallet.id));
      res.json({ ...pallet, items: palletItems2 });
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

      const enrichedItems = await Promise.all(items.map(async (item) => {
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        return { ...item, product };
      }));

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

      if (Array.isArray(items)) {
        await db.delete(palletItems).where(eq(palletItems.palletId, id));
        for (const item of items) {
          await db.insert(palletItems).values({
            palletId: id,
            productId: item.productId,
            erpNfId: item.erpNfId || null,
            quantity: item.quantity,
            lot: item.lot || null,
            expiryDate: item.expiryDate || null,
            fefoEnabled: item.fefoEnabled || false,
            companyId,
            createdAt: new Date().toISOString(),
          });
        }
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
      const { addressId } = req.body;

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

      const occupant = await db.select().from(pallets)
        .where(and(
          eq(pallets.addressId, addressId),
          sql`${pallets.status} != 'cancelado'`,
          sql`${pallets.id} != ${id}`,
        ));
      if (occupant.length > 0) {
        return res.status(400).json({ error: "Endereço já ocupado por outro pallet" });
      }

      const now = new Date().toISOString();
      await db.update(pallets).set({
        addressId,
        status: "alocado",
        allocatedAt: now,
      }).where(eq(pallets.id, id));

      await db.insert(palletMovements).values({
        palletId: id,
        companyId,
        movementType: "allocated",
        fromAddressId: pallet.addressId || null,
        toAddressId: addressId,
        userId: getUserId(req),
        createdAt: now,
      });

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

      const [pallet] = await db.select().from(pallets)
        .where(and(eq(pallets.id, id), eq(pallets.companyId, companyId)));
      if (!pallet) {
        return res.status(404).json({ error: "Pallet não encontrado" });
      }
      if (pallet.status === "cancelado") {
        return res.status(400).json({ error: "Pallet cancelado" });
      }

      const [toAddress] = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.id, toAddressId), eq(wmsAddresses.companyId, companyId)));
      if (!toAddress) {
        return res.status(404).json({ error: "Endereço destino não encontrado" });
      }

      const occupant = await db.select().from(pallets)
        .where(and(
          eq(pallets.addressId, toAddressId),
          sql`${pallets.status} != 'cancelado'`,
          sql`${pallets.id} != ${id}`,
        ));
      if (occupant.length > 0) {
        return res.status(400).json({ error: "Endereço destino já ocupado" });
      }

      const now = new Date().toISOString();
      const fromAddressId = pallet.addressId;
      await db.update(pallets).set({
        addressId: toAddressId,
        status: "alocado",
      }).where(eq(pallets.id, id));

      await db.insert(palletMovements).values({
        palletId: id,
        companyId,
        movementType: "transferred",
        fromAddressId: fromAddressId || null,
        toAddressId,
        userId: getUserId(req),
        createdAt: now,
      });

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

      const newCode = `PLT-${companyId}-${Date.now().toString(36).toUpperCase()}`;
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

      const pickingAddresses = await db.select().from(wmsAddresses)
        .where(and(eq(wmsAddresses.companyId, companyId), eq(wmsAddresses.type, "picking")));

      let pickingAddressId: string | null = null;
      if (pickingAddresses.length > 0) {
        pickingAddressId = pickingAddresses[0].id;
      }

      const now = new Date().toISOString();
      await db.update(pallets).set({
        status: "cancelado",
        addressId: pickingAddressId,
        cancelledAt: now,
        cancelledBy: getUserId(req),
        cancelReason: reason || null,
      }).where(eq(pallets.id, id));

      await db.insert(palletMovements).values({
        palletId: id,
        companyId,
        movementType: "cancelled",
        fromAddressId: pallet.addressId || null,
        toAddressId: pickingAddressId,
        userId: getUserId(req),
        notes: reason || "Cancelamento",
        createdAt: now,
      });

      await createAuditLog(req, "cancel", "pallet", id, `Pallet ${pallet.code} cancelado: ${reason || 'sem motivo'}`);
      broadcastSSE("pallet_cancelled", { palletId: id, companyId });

      res.json({ success: true });
    } catch (error) {
      console.error("Cancel pallet error:", error);
      res.status(500).json({ error: "Erro ao cancelar pallet" });
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
      const enrichedItems = await Promise.all(items.map(async (item) => {
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        return { ...item, product };
      }));

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
      res.json({ ...nf, items });
    } catch (error) {
      console.error("Get NF error:", error);
      res.status(500).json({ error: "Erro ao buscar NF" });
    }
  });

  app.post("/api/nf/sync", ...authMiddleware, supervisorRoles, async (req: Request, res: Response) => {
    res.json({
      message: "Sincronização de NF pendente. O SQL de sync da NF no DB2 ainda não foi fornecido.",
      status: "pending_integration",
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

      const [cycle] = await db.insert(countingCycles).values({
        companyId,
        type: type || "por_endereco",
        status: "pendente",
        createdBy: getUserId(req),
        notes: notes || null,
        createdAt: new Date().toISOString(),
      }).returning();

      if (Array.isArray(items)) {
        for (const item of items) {
          await db.insert(countingCycleItems).values({
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

      res.json({ ...cycle, items });
    } catch (error) {
      console.error("Get counting cycle error:", error);
      res.status(500).json({ error: "Erro ao buscar ciclo" });
    }
  });

  app.patch("/api/counting-cycles/:id/item", ...authMiddleware, wmsCounterRoles, async (req: Request, res: Response) => {
    try {
      const companyId = getCompanyId(req);
      const { id } = req.params;
      const { itemId, countedQty, lot, expiryDate } = req.body;

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

      await db.update(countingCycleItems).set(updates).where(eq(countingCycleItems.id, itemId));

      const allItems = await db.select().from(countingCycleItems)
        .where(eq(countingCycleItems.cycleId, id));
      const allCounted = allItems.every(i => i.id === itemId ? true : i.status !== "pendente");
      if (allCounted) {
        await db.update(countingCycles).set({
          status: "concluido",
          completedAt: now,
        }).where(eq(countingCycles.id, id));
      } else if (cycle.status === "pendente") {
        await db.update(countingCycles).set({ status: "em_andamento" }).where(eq(countingCycles.id, id));
      }

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
      await db.update(countingCycles).set({
        status: "aprovado",
        approvedBy: getUserId(req),
        approvedAt: now,
      }).where(eq(countingCycles.id, id));

      const items = await db.select().from(countingCycleItems)
        .where(eq(countingCycleItems.cycleId, id));

      for (const item of items) {
        if (item.countedQty !== null && item.productId) {
          const existing = await db.select().from(productCompanyStock)
            .where(and(
              eq(productCompanyStock.productId, item.productId),
              eq(productCompanyStock.companyId, companyId),
            ));

          if (existing.length > 0) {
            await db.update(productCompanyStock).set({
              stockQty: item.countedQty,
              erpUpdatedAt: now,
            }).where(eq(productCompanyStock.id, existing[0].id));
          } else {
            await db.insert(productCompanyStock).values({
              productId: item.productId,
              companyId,
              stockQty: item.countedQty,
              erpUpdatedAt: now,
            });
          }

          if (item.palletId && item.lot !== undefined) {
            await db.update(palletItems).set({
              lot: item.lot,
              expiryDate: item.expiryDate,
            }).where(and(
              eq(palletItems.palletId, item.palletId),
              eq(palletItems.productId, item.productId),
            ));
          }
        }

        await db.update(countingCycleItems).set({ status: "aprovado" })
          .where(eq(countingCycleItems.id, item.id));
      }

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
      if (q.length < 2) {
        return res.json([]);
      }

      const companyId = getCompanyId(req);
      const searchPattern = `%${q}%`;

      const results = await db.select().from(products)
        .where(
          sql`(${products.name} LIKE ${searchPattern} COLLATE NOCASE
            OR ${products.erpCode} LIKE ${searchPattern} COLLATE NOCASE
            OR ${products.barcode} LIKE ${searchPattern} COLLATE NOCASE)`
        )
        .limit(50);

      const withStock = await Promise.all(results.map(async (p) => {
        const [cs] = await db.select().from(productCompanyStock)
          .where(and(eq(productCompanyStock.productId, p.id), eq(productCompanyStock.companyId, companyId)));
        return {
          ...p,
          companyStockQty: cs?.stockQty ?? p.stockQty,
        };
      }));

      res.json(withStock);
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
}
