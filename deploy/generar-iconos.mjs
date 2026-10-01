/**
 * Genera los iconos PNG que Android necesita para instalar la PWA.
 *
 * Android no acepta el SVG del manifest: hace falta un raster en 192 y 512 px,
 * y uno "maskable" que no pierda el centro al recortarlo en circulo.
 *
 *   node deploy/generar-iconos.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(aqui, "..", "public");

// El mismo diseno que public/icon.svg, dibujado con un margen de seguridad
// para que el recorte circular de Android no se coma la letra.
const dibujo = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#171717"/>
  <path d="M55 131 82 61h28l27 70h-22l-5-15H82l-5 15H55Zm32-32h17l-8-23h-1l-8 23Z" fill="#f1f1f1"/>
  <circle cx="135" cy="61" r="10" fill="#bb655c"/>
</svg>`;

const normal = Buffer.from(dibujo);

// El maskable necesita el motivo dentro del 80% central: Android recorta los
// bordes, asi que se reduce y se deja el fondo hasta el borde.
const maskable = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#171717"/>
  <g transform="translate(96 96) scale(0.72) translate(-96 -96)">
    <path d="M55 131 82 61h28l27 70h-22l-5-15H82l-5 15H55Zm32-32h17l-8-23h-1l-8 23Z" fill="#f1f1f1"/>
    <circle cx="135" cy="61" r="10" fill="#bb655c"/>
  </g>
</svg>`);

const salidas = [
    { archivo: "icon-192.png", tamano: 192, fuente: normal },
    { archivo: "icon-512.png", tamano: 512, fuente: normal },
    { archivo: "icon-maskable-512.png", tamano: 512, fuente: maskable }
];

for (const { archivo, tamano, fuente } of salidas) {
    const destino = path.join(publicDir, archivo);
    await sharp(fuente, { density: 384 })
        .resize(tamano, tamano)
        .png({ compressionLevel: 9 })
        .toFile(destino);
    const { size } = await fs.stat(destino);
    console.log(`${archivo}  ${tamano}x${tamano}  ${(size / 1024).toFixed(1)} KB`);
}

console.log("Iconos generados en public/");
