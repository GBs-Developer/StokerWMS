import { Response, Request, Express } from 'express';
import { getTokenFromRequest, getUserFromToken } from './auth';

let clients: { id: number; res: Response; userId?: string; companyId?: number }[] = [];

export function setupSSE(app: Express) {
    app.get('/api/sse', async (req: Request, res: Response) => {
        const token = getTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ error: 'Não autenticado' });
        }
        const result = await getUserFromToken(token);
        if (!result) {
            return res.status(401).json({ error: 'Token inválido' });
        }
        (req as any).user = result.user;
        (req as any).companyId = result.companyId;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const clientId = Date.now();
        const userId = result.user.id;
        const companyId = result.companyId;

        const newClient = {
            id: clientId,
            res,
            userId,
            companyId
        };

        clients.push(newClient);

        res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

        req.on('close', () => {
            clients = clients.filter(client => client.id !== clientId);
        });
    });
}

export function broadcastSSE(type: string, data: any, companyId?: number) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    clients.forEach(client => {
        if (companyId) {
            if (client.companyId !== companyId) return;
        }
        client.res.write(message);
    });
}

export function sendToUserSSE(userId: string, type: string, data: any) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    clients
        .filter(client => client.userId === userId)
        .forEach(client => {
            client.res.write(message);
        });
}
