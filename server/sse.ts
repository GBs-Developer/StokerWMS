import { Response, Request, Express } from 'express';

// Store active connections
let clients: { id: number; res: Response; userId?: string }[] = [];

/**
 * Setup Server-Sent Events (SSE) endpoint
 */
export function setupSSE(app: Express) {
    app.get('/api/sse', (req: Request, res: Response) => {
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const clientId = Date.now();
        const userId = (req as any).user?.id; // Optional: identify user if auth middleware runs before

        const newClient = {
            id: clientId,
            res,
            userId
        };

        clients.push(newClient);
        // console.log(`[SSE] Client connected: ${clientId} (User: ${userId || 'anonymous'})`);

        // Send initial connection message
        res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

        // Remove client on close
        req.on('close', () => {
            // console.log(`[SSE] Client disconnected: ${clientId}`);
            clients = clients.filter(client => client.id !== clientId);
        });
    });
}

/**
 * Broadcast an event to all connected clients
 */
export function broadcastSSE(type: string, data: any) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    clients.forEach(client => {
        client.res.write(message);
    });
}

/**
 * Send an event to specific user(s)
 */
export function sendToUserSSE(userId: string, type: string, data: any) {
    const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    clients
        .filter(client => client.userId === userId)
        .forEach(client => {
            client.res.write(message);
        });
}
