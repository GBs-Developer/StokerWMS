
import { useEffect, useRef } from 'react';

type SSEEvent<T = any> = {
    type: string;
    data: T;
};

export function useSSE(url: string, eventTypes: string[], onMessage: (type: string, data: any) => void) {
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // cleanup previous
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        const listeners: { type: string; listener: (e: MessageEvent) => void }[] = [];

        eventTypes.forEach((type) => {
            const listener = (event: MessageEvent) => {
                try {
                    const parsedData = JSON.parse(event.data);
                    onMessage(type, parsedData);
                } catch (error) {
                    console.error(`Error parsing SSE data for ${type}:`, error);
                }
            };
            eventSource.addEventListener(type, listener);
            listeners.push({ type, listener });
        });

        eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            // Optional: Logic to reconnect or handle error
            // EventSource auto-reconnects by default usually, but close on fatal
            if (eventSource.readyState === EventSource.CLOSED) {
                // managed by browser
            }
        };

        return () => {
            listeners.forEach(({ type, listener }) => {
                eventSource.removeEventListener(type, listener);
            });
            eventSource.close();
        };
    }, [url, JSON.stringify(eventTypes), onMessage]); // JSON.stringify to avoid loop on array dependency

    return eventSourceRef.current;
}
