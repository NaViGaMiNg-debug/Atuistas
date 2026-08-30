const webpush = require("web-push");

const VAPID_PUBLIC_KEY = "BGl6iWRTlAgUesQA3Y5d8SFPylipUJ9uKSFjiR_nAqhhUtzLK81OXc0a6fu2v_lVDX5vjt0U2UicYX6b-C_73gI";
const VAPID_PRIVATE_KEY = "Gd1o4QU6iyh5QXTH7lZgq009oPpHKftRTFgqAIi7XAI";

webpush.setVapidDetails(
    "mailto:imorenonatera@gmail.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

console.log("Servidor de notificaciones iniciado");