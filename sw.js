self.addEventListener("push", event => {

    if (!event.data) {
        return;
    }

    const datos = event.data.json();

    const titulo =
        datos.titulo || "El Grupo";

    const opciones = {
        body: datos.mensaje || "Tienes un mensaje nuevo.",
        icon: datos.icono || "/assets/icon.png",
        badge: datos.icono || "/assets/icon.png",
        data: {
            chatId: datos.chatId || null
        }
    };

    event.waitUntil(
        self.registration.showNotification(
            titulo,
            opciones
        )
    );

});


self.addEventListener("notificationclick", event => {

    event.notification.close();

    const chatId =
        event.notification.data?.chatId;

    event.waitUntil(

        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then(clientes => {

            for (const cliente of clientes) {

                if ("focus" in cliente) {

                    cliente.focus();

                    if (chatId) {

                        cliente.postMessage({
                            tipo: "abrir-chat",
                            chatId: chatId
                        });

                    }

                    return;
                }

            }

            return clients.openWindow(
                "/"
            );

        })

    );

});