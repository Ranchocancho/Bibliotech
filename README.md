# Ludoteca

Tu colección de videojuegos y películas en una estantería de madera, pensada para el móvil.

- Cuatro estanterías: **DS · 3DS**, **Switch** (1 y 2), **PlayStation** (4 y 5) y **Películas** (DVD y Blu-ray).
- Escribes el título, eliges el tuyo y la caja aparece con su portada, contraportada y disco o cartucho.
- Toca una caja para sacarla: gira para ver la contraportada y se abre para ver el interior.
- Elige qué cajas van de frente y cuáles de lado.
- Lista de deseos, filtros por género (con etiquetas propias), búsqueda y orden dentro de cada balda.
- Visor a pantalla completa con zoom y "Elegir otra imagen" entre todas las versiones de los catálogos.
- Comparte tu estantería con un enlace y cotillea las de tus amigos (pestaña Amigos), con los juegos en común marcados.
- Estadísticas de tu colección.
- Escáner de códigos de barras (Android con Chrome) como atajo.
- Funciona sin conexión y se instala como una app. Nadie necesita cuenta.

## Publicarla (una sola vez)

1. Crea una cuenta gratuita en GitHub y un repositorio nuevo, por ejemplo `ludoteca`.
2. Sube **todo** el contenido de esta carpeta al repositorio (incluida la carpeta `.github`).
3. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Ve a **Actions → Publicar Ludoteca → Run workflow**. En unos minutos tendrás la app en
   `https://TU-USUARIO.github.io/ludoteca/`.
5. Abre ese enlace en el móvil con Chrome → menú ⋮ → **Instalar app** (o desde Ajustes dentro de Ludoteca).

Después, cada lunes se actualiza sola con los juegos nuevos del catálogo. Pásale el enlace a tus amigos y listo.

## Cómo funciona por dentro

| Pieza | Qué hace |
|---|---|
| `tools/build_index.py` | Descarga LaunchBox (`Metadata.zip`) y, para DS, 3DS y Switch, GameTDB (`tools/gametdb.py`): títulos en español y una edición por juego, prefiriendo la española y luego la europea. Genera un índice ligero por plataforma. |
| `site/` | La app (HTML, CSS y JavaScript sin dependencias). La colección se guarda en el propio móvil. |
| `site/sw.js` | Hace que funcione sin conexión y guarda las portadas de tu colección. |
| Películas | TMDB en español (títulos y carteles de España), con Wikipedia de respaldo. No hay fuente abierta de contraportadas de DVD/Blu-ray: la trasera se muestra lisa. |
| Juegos que faltan | Botón "¿No aparece?": se buscan en Wikipedia (solo portada). |
| Compartir | El enlace lleva tu colección comprimida (solo identificadores, no imágenes). |
| Escáner | Lee el código con la cámara y consulta UPCitemdb (gratis, sin registro, 100 consultas al día). Si no lo reconoce, escribes el título. |

## Probarla en el ordenador sin conexión

```bash
python3 tests/make_fixture.py /tmp/ludo-test        # catálogo de mentira
cp -r site/* /tmp/ludo-test/
python3 tools/build_index.py --zip /tmp/ludo-test/Metadata.zip --out /tmp/ludo-test/data --img-base test-img/
cd /tmp/ludo-test && python3 -m http.server 8765    # abre http://localhost:8765
```

## Créditos

Juegos: [GameTDB](https://www.gametdb.com) y [LaunchBox Games Database](https://gamesdb.launchbox-app.com/), mantenidas por sus comunidades.
Películas: [TMDB](https://www.themoviedb.org) (este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB), Wikipedia y Wikidata. Proyecto personal y sin ánimo de lucro: no la uses para vender nada.
