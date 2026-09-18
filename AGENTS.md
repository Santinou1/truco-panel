# La Pulpería — Administración

- React, TypeScript y Vite. Panel independiente de truco-front, API compartida de truco-back.
- SDD por feature: spec.md y criterios antes de implementar; mantener plan.md, tasks.md y verification.md en docs/specs.
- Specs y evidencia permanecen locales e ignoradas por Git. Versionar código, tests, assets, fuentes, licencias y guías técnicas.
- Respetar Rye y Bree Serif locales, verde oscuro, madera y dorado. Catálogo en src/catalog.json; imágenes por URLs HTTPS publicadas de https://lapulperia.cloud/media/ en src/asset-manifest.json. No copiar ni descargar imágenes al panel. Al incorporar diseños mantener correspondencia con el catálogo del backend y verificar las URLs publicadas.
- El backend es autoridad para roles y precios. No crear permisos desde el cliente ni persistir tokens en localStorage/sessionStorage. Cookies HttpOnly y cabecera X-Requested-With en mutaciones.
- Desarrollo: npm start en 5176, proxy /api a 3002. No detener otros proyectos ni modificar la DB de desarrollo para probar permisos.
- Antes de entregar: npm test, npm run build y npm run test:browser. Este último inicia Vite 5177/API 3004 y PostgreSQL pulperia_panel_browser_test con correo simulado; exige truco-back instalado y DB disponible. Distinguir OAuth simulado de consentimiento real.
- Mantener teclado, móvil 320 px, foco visible, estados anunciados y movimiento reducido.
