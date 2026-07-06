/**
 * InmoControl — Script de Seed (Demo Apartamento)
 * ============================================================================
 * Simula un inmueble COMPLETO en la app para probar el flujo entero.
 *
 * IMPORTANTE: La app está en mitad de la refactorización por dominios
 * (AGENTS.md, Fase 2). `App.tsx` todavía lee del storage viejo con keys
 * sueltos ('properties', 'tenants', 'financialRecords', 'user'). El store
 * nuevo de Zustand (`inmocontrol:v1`) existe pero no se consume todavía.
 *
 * Por eso este script escribe a AMBOS storages:
 *   - Storage viejo (lo que la UI lee hoy)  → 'properties', 'tenants', etc.
 *   - Storage nuevo (para la migración)     → 'inmocontrol:v1'
 *   - IndexedDB (inventarios)              → 'inmocontrol-db'
 *
 * Uso:
 *   1. Abre la app en http://localhost:3000
 *   2. DevTools (F12) → Console → escribe: allow pasting → Enter
 *   3. Pega TODO este archivo → Enter
 *   4. Acepta el alert
 *   5. F5 para recargar
 *
 * Para limpiarlo todo:
 *   localStorage.clear();
 *   indexedDB.deleteDatabase('inmocontrol-db');
 *   location.reload();
 */
(function () {
  'use strict';

  const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  // ─── Helpers de fecha ─────────────────────────────────────────────────
  const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const isoMonthsFromNow = (n) => {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d.toISOString();
  };
  const isoMonthsAgo = (n) => isoMonthsFromNow(-n);

  // ─── IDs y constantes ────────────────────────────────────────────────
  const OWNER_ID = 'owner-carlos-ramirez';
  const TENANT_ID = 'tenant-maria-fernandez';
  const PROPERTY_ID = 'prop-apto-502-calle-100';
  const CONTRACT_ID = 'contract-2025-apto-502';
  const INVENTORY_ID = `${PROPERTY_ID}:inicial`;

  // ─── 1. Propietario ──────────────────────────────────────────────────
  const owner = {
    id: OWNER_ID,
    name: 'Carlos Ramírez Vega',
    documentId: '79.123.456',
    email: 'carlos.ramirez@email.com',
    phone: '+57 311 555 1234',
    bankAccount: 'Bancolombia •••• 4521',
  };

  // ─── 2. Inquilino ────────────────────────────────────────────────────
  const tenant = {
    id: TENANT_ID,
    name: 'María Fernández López',
    documentId: '52.987.654',
    email: 'maria.fernandez@email.com',
    phone: '+57 315 777 8899',
  };

  // ─── 3. Property (shape del storage VIEJO: owner/ownerIdNumber inline) ─
  const property = {
    id: PROPERTY_ID,
    address: 'Calle 100 # 15-20, Apto 502',
    chip: 'AAA0148XYZ',
    folio: '50N-12345678',
    owner: owner.name,
    ownerName: owner.name,
    ownerIdNumber: owner.documentId,
    ownerId: OWNER_ID,
    status: 'Arrendado',                       // el viejo usa 'Arrendado'/'Disponible'/'Mantenimiento'
    documents: {                               // el viejo tiene esto en Property
      'Cédula de Ciudadanía': 'demo-cedula.pdf',
      'Certificado de Tradición': 'demo-tradicion.pdf',
      'Impuesto Predial': 'demo-predial.pdf',
      'Rut Actualizado': 'demo-rut.pdf',
    },
  };

  // ─── 4. Contrato (store nuevo) ────────────────────────────────────────
  const contract = {
    id: CONTRACT_ID,
    propertyId: PROPERTY_ID,
    tenantId: TENANT_ID,
    rentAmount: 2500000,
    adminFee: 350000,
    commissionPct: 8,
    insurancePct: 0.5,
    startDate: isoMonthsAgo(2).slice(0, 10),
    endDate: isoMonthsFromNow(10).slice(0, 10),
    noticeDate: isoMonthsFromNow(7).slice(0, 10),
    status: 'active',
    renewalStrategy: 'manual',
    inventoryEndRequired: true,
    notes: 'Contrato firmado con cláusula de inventario inicial y final obligatorio.',
    createdAt: isoMonthsAgo(2),
    updatedAt: isoDaysAgo(5),
    signedAt: isoMonthsAgo(2),
  };

  // ─── 5. User logueado (storage viejo usa esto) ───────────────────────
  const user = {
    id: 'profile-tatiana',
    name: 'Tatiana Pérez',
    email: 'tatiana.perez@inmocontrol.com',
    phone: '+57 300 123 4567',
    role: 'admin',
  };

  // ─── 6. Inventario Inicial ───────────────────────────────────────────
  const COUNTERS = {
    alcobas: 3,
    banos: 2,
    balcones: 1,
    terrazas: 1,
    depositos: 0,
    parqueaderos: 1,
  };

  // Estado pseudo-aleatorio PERO reproducible con seed fijo
  let _seed = 42;
  const rand = () => { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; };

  function statusFor(label, category) {
    const bad = ['Tina', 'Rejillas', 'Mueble Inferior', 'Horno', 'Calentador'];
    const regular = ['Pintura', 'Pisos', 'Paredes', 'Alfombras', 'Grifería', 'Closets'];
    if (bad.some((b) => label.includes(b))) return 'malo';
    if (regular.some((r) => label.includes(r))) return rand() < 0.7 ? 'regular' : 'bueno';
    if (category === 'bano' && label === 'Espejos') return 'regular';
    if (category === 'cocina' && label === 'Campana Extractora') return 'malo';
    if (category === 'patio' && label === 'Calentador') return 'malo';
    return 'bueno';
  }

  function buildArea(area, category) {
    const CATALOG = {
      sala: ['Puertas','Marco de Puerta','Cerradura','Ventana','Vidrios','Rejas','Pisos','Paredes','Techos','Tomas','Interruptores','Rosetas','Apliques','Lámparas','Guarda Escobas'],
      comedor: ['Puertas','Marco de Puerta','Cerradura','Ventana','Vidrios','Rejas','Pisos','Paredes','Techos','Tomas','Interruptores','Rosetas','Apliques','Lámparas','Guarda Escobas'],
      cocina: ['Puerta','Marco Puerta','Ventanas','Vidrios','Pisos','Paredes','Techos','Tomas','Interruptores','Plafones','Apliques','Lavaplatos','Grifería','Estufa y Asador','Horno','Campana Extractora','Mueble Inferior — Entrepaños','Mueble Inferior — Cajones','Mueble Inferior — Puertas','Mueble Superior — Entrepaños','Mueble Superior — Cajones','Mueble Superior — Puertas','Calentador','Plafones / Lámparas'],
      entrada: ['Puerta Principal','Marco de Puerta','Cerradura Puerta Principal','Otras Puertas','Cerradura Otras Puertas','Ventanas','Vidrios Especiales','Otros Vidrios','Rejas','Pisos','Paredes','Alfombras','Techos','Divisiones','Escaleras'],
      pasillo: ['Piso','Pintura','Iluminación','Interruptores','Plafones','Tomas'],
      bano_social: ['Puerta','Marco Puerta','Cerradura','Ventanas','Vidrios','Lavamanos','Sanitario','Grifería Sanitario','Toallero','Jabonera','Espejos','Pisos','Paredes','Tomas','Interruptores','Plafones','Apliques'],
      lavanderia: ['Pisos','Paredes','Techos','Tomas','Interruptores','Instalación Lavadora','Lavadero','Llave Lavadero','Rejilla Piso','Plafones / Lámparas','Calentador','Tenderos de Ropa'],
      alcoba: ['Puerta','Marco Puerta','Cerradura','Rejas','Ventanas','Vidrios','Pisos','Alfombras','Paredes','Cortineros','Techos','Tomas','Interruptores','Plafones','Apliques','Lámparas','Guarda Escobas','Closets — Puertas','Closets — Entrepaños','Closets — Cajones'],
      bano: ['Puerta','Marco Puerta','Cerradura','Ventanas','Vidrios','Lavamanos','Sanitario','Grifería Sanitario','Toallero','Jabonera','Cepillero','Ducha','Grifería Ducha','Espejos','Gabinetes','Divisiones','Pisos','Paredes','Tomas','Interruptores','Plafones','Apliques','Tina','Rejillas'],
      balcon: ['Piso','Baranda / Pasamanos','Iluminación','Rejas'],
      terraza: ['Piso / Impermeabilización','Baranda','Iluminación','Rejas'],
      parqueadero: ['Piso / Pintura demarcación','Señalización (número)','Techo / Cubierta'],
      otros: ['Pintura','Piso','Puerta / Cerradura','Iluminación','Tomas eléctricas','Ventilación'],
    };
    const labels = CATALOG[category] || CATALOG.otros;
    const items = {};
    labels.forEach((label) => {
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      items[id] = { id, label, status: statusFor(label, category) };
    });
    return {
      id: area.id,
      category,
      label: area.label,
      items,
      photos: [],
      ...(category === 'cocina' ? { observations: 'Mueble inferior con humedad en el lado del lavaplatos. Campana extractora no funciona correctamente.' } : {}),
      ...(category === 'bano' && area.label === 'Baño 1' ? { observations: 'La grifería de la ducha gotea. Rejilla del piso oxidada.' } : {}),
    };
  }

  const AREAS = [
    { id: 'single-0', category: 'sala', label: 'Sala' },
    { id: 'single-1', category: 'comedor', label: 'Comedor' },
    { id: 'single-2', category: 'cocina', label: 'Cocina' },
    { id: 'single-3', category: 'entrada', label: 'Entrada' },
    { id: 'single-4', category: 'pasillo', label: 'Pasillo' },
    { id: 'single-5', category: 'bano_social', label: 'Baño Social' },
    { id: 'single-6', category: 'lavanderia', label: 'Zona de Lavandería' },
    { id: 'multi-alcoba-1', category: 'alcoba', label: 'Alcoba 1' },
    { id: 'multi-alcoba-2', category: 'alcoba', label: 'Alcoba 2' },
    { id: 'multi-alcoba-3', category: 'alcoba', label: 'Alcoba 3' },
    { id: 'multi-bano-1', category: 'bano', label: 'Baño 1' },
    { id: 'multi-bano-2', category: 'bano', label: 'Baño 2' },
    { id: 'multi-balcon-1', category: 'balcon', label: 'Balcón 1' },
    { id: 'multi-terraza-1', category: 'terraza', label: 'Terraza 1' },
    { id: 'multi-parqueadero-1', category: 'parqueadero', label: 'Parqueadero 1' },
  ];
  const CUSTOM_AREAS = [{ id: 'custom-estudio', label: 'Cuarto de Estudio' }];
  CUSTOM_AREAS.forEach((c) => {
    AREAS.push({ id: c.id, category: 'otros', label: c.label });
  });

  const builtAreas = AREAS.map((a) => buildArea(a, a.category));

  const inventory = {
    id: INVENTORY_ID,
    propertyId: PROPERTY_ID,
    phase: 'inicial',
    propertyType: 'apartamento',
    counters: COUNTERS,
    customAreas: CUSTOM_AREAS,
    areas: builtAreas,
    photos: [],
    signatures: [],
    createdAt: isoMonthsAgo(2),
    updatedAt: isoDaysAgo(2),
    signedAt: isoDaysAgo(2),
    agentId: 'profile-tatiana',
    agentName: 'Tatiana Pérez',
    tenantId: TENANT_ID,
    tenantName: tenant.name,
  };

  // ─── 7. Recibos de servicios públicos ────────────────────────────────
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStr = lastMonth.toISOString().slice(0, 10);

  const financialRecords = [
    {
      id: 'fin-agua-1',
      contractId: CONTRACT_ID,
      propertyId: PROPERTY_ID,
      date: lastMonthStr,
      type: 'expense',
      category: 'services',
      description: 'Recibo de Agua — Acueducto Bogotá',
      amount: 85400,
      createdAt: lastMonthStr,
    },
    {
      id: 'fin-energia-1',
      contractId: CONTRACT_ID,
      propertyId: PROPERTY_ID,
      date: lastMonthStr,
      type: 'expense',
      category: 'services',
      description: 'Recibo de Energía — Codensa',
      amount: 142300,
      createdAt: lastMonthStr,
    },
  ];

  // ─── 8. Render de firma sintética ────────────────────────────────────
  function drawFakeSignature(name) {
    return new Promise((resolve) => {
      const c = document.createElement('canvas');
      c.width = 400; c.height = 120;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'italic 36px "Brush Script MT", "Lucida Handwriting", cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 20, c.height / 2);
      resolve(c.toDataURL('image/png'));
    });
  }
  function drawFakePhoto(initials, bg = '#6366f1') {
    return new Promise((resolve) => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 200;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initials, c.width / 2, c.height / 2);
      resolve(c.toDataURL('image/png'));
    });
  }

  // ─── Modo Node ───────────────────────────────────────────────────────
  if (!isBrowser) {
    console.log('Pensado para correr en la consola del navegador.');
    console.log('Resumen:', { owner: owner.name, tenant: tenant.name, property: property.address, areas: inventory.areas.length });
    return;
  }

  // ─── Modo Browser ────────────────────────────────────────────────────
  (async () => {
    // === STORAGE VIEJO (lo que la UI lee HOY) ===
    localStorage.setItem('properties', JSON.stringify([property]));
    localStorage.setItem('tenants', JSON.stringify([tenant]));
    localStorage.setItem('financialRecords', JSON.stringify(financialRecords));
    localStorage.setItem('user', JSON.stringify(user));

    // === STORAGE NUEVO (Zustand persist, para la migración) ===
    localStorage.setItem('inmocontrol:v1', JSON.stringify({
      state: { properties: [property], tenants: [tenant], financialRecords },
      version: 0,
    }));
    localStorage.setItem('inmocontrol:contracts:v1', JSON.stringify({
      state: { contracts: [contract] },
      version: 0,
    }));

    // === SETTINGS (solo si no existe) ===
    if (!localStorage.getItem('inmocontrol:settings:v1')) {
      const settingsDefault = {
        state: {
          agency: {
            name: 'InmoControl Bogotá',
            nit: '900.123.456-7',
            address: 'Calle 100 # 15-20, Oficina 502',
            city: 'Bogotá D.C.',
            representative: 'Carlos Rodríguez',
            website: 'www.inmocontrol.com',
          },
          profile: {
            name: 'Tatiana Pérez',
            email: 'tatiana.perez@inmocontrol.com',
            phone: '+57 300 123 4567',
            role: 'Administradora Senior',
            photoDataUrl: await drawFakePhoto('TP', '#0ea5e9'),
          },
        },
        version: 0,
      };
      localStorage.setItem('inmocontrol:settings:v1', JSON.stringify(settingsDefault));
    }

    // === Firmas sintéticas ===
    const tenantSig = await drawFakeSignature(tenant.name);
    const agentSig = await drawFakeSignature('Tatiana Pérez');
    const tenantPhoto = await drawFakePhoto('MF', '#10b981');
    const agentPhoto = await drawFakePhoto('TP', '#0ea5e9');

    inventory.signatures = [
      { signerName: tenant.name, signerRole: 'arrendatario', signerIdNumber: tenant.documentId, signerPhone: tenant.phone, signerEmail: tenant.email, signerPhotoDataUrl: tenantPhoto, dataUrl: tenantSig, signedAt: inventory.signedAt },
      { signerName: 'Tatiana Pérez', signerRole: 'agente', signerIdNumber: '52.841.231', signerPhone: '+57 300 123 4567', signerEmail: 'tatiana.perez@inmocontrol.com', signerPhotoDataUrl: agentPhoto, dataUrl: agentSig, signedAt: inventory.signedAt },
    ];

    // === IndexedDB (inventarios) ===
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('inmocontrol-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('inventories')) db.createObjectStore('inventories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['inventories'], 'readwrite');
        tx.objectStore('inventories').put(inventory);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // === Resumen ===
    const itemCount = inventory.areas.reduce((s, a) => s + Object.keys(a.items).length, 0);
    console.log('%c✅ Demo InmoControl cargada', 'color:#10b981;font-weight:bold;font-size:14px');
    console.log('Inmueble:', property.address);
    console.log('Propietario:', owner.name);
    console.log('Inquilino:', tenant.name);
    console.log('Contrato: canon $' + contract.rentAmount.toLocaleString('es-CO') + ', ' + contract.startDate + ' → ' + contract.endDate);
    console.log('Inventario inicial: ' + inventory.areas.length + ' áreas, ' + itemCount + ' items, firmado el ' + new Date(inventory.signedAt).toLocaleDateString('es-CO'));
    console.log('%c→ Recarga la página (F5) para ver la app con los datos.', 'color:#3b82f6;font-weight:bold');
    alert('✅ Demo cargada.\n\n' + inventory.areas.length + ' áreas, ' + itemCount + ' items.\n\nRecarga la página (F5) para verla.');
  })();
})();
