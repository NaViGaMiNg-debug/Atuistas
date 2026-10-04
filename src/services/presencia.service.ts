// Qué está viendo cada usuario ahora mismo. Vive en memoria: es una pista
// para no molestar con avisos de lo que ya tiene delante, no un dato que haya
// que guardar. Si el navegador se cierra sin avisar, el estado caduca solo.
interface Vista {
    chatId: string | null;
    servidorId: string | null;
    actualizado: number;
}

const vistas = new Map<string, Vista>();

// Si el cliente deja de refrescar, se considera que ya no está mirando: mejor
// enviar un aviso de más que perder uno.
const CADUCA_MS = 3 * 60 * 1000;

function vigente(usuarioId: string): Vista | null {
    const vista = vistas.get(usuarioId);
    if (!vista) return null;
    if (Date.now() - vista.actualizado > CADUCA_MS) {
        vistas.delete(usuarioId);
        return null;
    }
    return vista;
}

// El cliente avisa al abrir un chat o un servidor, y al salir deja la vista
// vacía (si no, caduca sola en tres minutos).
export function marcarVista(
    usuarioId: string,
    datos: { chatId?: string | null; servidorId?: string | null } = {}
) {
    const chatId = datos.chatId ?? null;
    const servidorId = datos.servidorId ?? null;
    if (!chatId && !servidorId) {
        vistas.delete(usuarioId);
        return { chatId: null, servidorId: null };
    }
    const vista: Vista = { chatId, servidorId, actualizado: Date.now() };
    vistas.set(usuarioId, vista);
    return { chatId, servidorId };
}

export function estaViendoA(usuarioId: string, autorId: string) {
    const vista = vigente(usuarioId);
    return Boolean(vista && vista.chatId === autorId);
}

export function estaViendoServidor(usuarioId: string, servidorId: string) {
    const vista = vigente(usuarioId);
    return Boolean(vista && vista.servidorId === servidorId);
}