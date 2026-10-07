import type { WebSocket } from "ws";

// Tickets de un solo uso para conectar sin exponer el token.
// Cada persona puede tener varias pestañas abiertas, asi que se guarda
// una lista de enchufes por usuario y no uno solo.
const TTL_TICKET_MS = 60 * 1000;
const ABIERTO = 1;

interface Ticket {
    usuarioId: string;
    expiraEn: number;
}

const tickets = new Map<string, Ticket>();
const conexiones = new Map<string, Set<WebSocket>>();

function limpiarTickets() {
    const ahora = Date.now();
    for (const [clave, ticket] of tickets) {
        if (ticket.expiraEn <= ahora) {
            tickets.delete(clave);
        }
    }
}

export function crearTicket(usuarioId: string) {
    limpiarTickets();
    const ticket = crypto.randomUUID();
    tickets.set(ticket, {
        usuarioId,
        expiraEn: Date.now() + TTL_TICKET_MS
    });
    return ticket;
}

// Consume el ticket una sola vez y devuelve el usuario. Si ya se uso o caduco
// devuelve null y el enchufe se cierra con ticket no valido.
export function consumirTicket(ticket: string): string | null {
    limpiarTickets();
    const guardado = tickets.get(ticket);
    if (!guardado) return null;

    tickets.delete(ticket);
    if (guardado.expiraEn <= Date.now()) return null;
    return guardado.usuarioId;
}

export function suscribir(usuarioId: string, socket: WebSocket) {
    let conjunto = conexiones.get(usuarioId);
    if (!conjunto) {
        conjunto = new Set();
        conexiones.set(usuarioId, conjunto);
    }
    conjunto.add(socket);

    return () => {
        const actual = conexiones.get(usuarioId);
        if (!actual) return;
        actual.delete(socket);
        if (actual.size === 0) {
            conexiones.delete(usuarioId);
        }
    };
}

export function emitirAUsuarios(usuarioIds: string[], evento: Record<string, unknown>) {
    const serializado = JSON.stringify(evento);
    for (const usuarioId of new Set(usuarioIds)) {
        const conjunto = conexiones.get(usuarioId);
        if (!conjunto) continue;
        for (const socket of conjunto) {
            if (socket.readyState === ABIERTO) {
                socket.send(serializado);
            }
        }
    }
}
