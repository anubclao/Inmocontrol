/**
 * Tests del constructor puro del FinalizeSummary.
 *
 * Commit 4 del refactor #5 (spec #5, verifier #5). El constructor
 * `buildFinalizeSummary` arma el objeto que el modal renderiza al
 * finalizar el wizard. Debe ser determinístico: mismo input → mismo
 * output. Los cambios futuros (ej: agregar campo nuevo, cambiar
 * reglas de count) deben pasar primero por estos tests.
 *
 * Corrida:
 *   node --test --import tsx tests/finalizeSummary.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinalizeSummary,
  type BuildFinalizeSummaryInput,
} from '../src/features/properties/utils/finalizeSummary.ts';

const baseInput: BuildFinalizeSummaryInput = {
  address: 'Calle 93 #11-27',
  driveFolderId: 'folder-abc123',
  driveFolderPath: 'InmoControl/Calle 93 #11-27',
  driveConnected: true,
  uploadedToDrive: ['cedula:o1', 'mandato'],
  uploadedLocalOnly: [],
  missingSlotKeys: ['predial'],
  failedUploads: [],
  inventoryUploadedToDrive: true,
  totalDocs: 5,
  persistFailed: false,
};

describe('buildFinalizeSummary', () => {
  it('caso feliz: todos en Drive', () => {
    const result = buildFinalizeSummary(baseInput);
    assert.equal(result.address, 'Calle 93 #11-27');
    assert.equal(result.driveFolderId, 'folder-abc123');
    assert.equal(result.driveConnected, true);
    assert.deepEqual(result.uploadedToDrive, ['cedula:o1', 'mandato']);
    assert.equal(result.missingDocs.length, 1);
    assert.equal(result.persistFailed, false);
  });

  it('mapea missingSlotKeys → missingDocs (alias para el modal)', () => {
    const result = buildFinalizeSummary(baseInput);
    assert.deepEqual(result.missingDocs, ['predial']);
  });

  it('mapea inventoryUploadedToDrive → inventoryUploaded', () => {
    const result = buildFinalizeSummary({ ...baseInput, inventoryUploadedToDrive: false });
    assert.equal(result.inventoryUploaded, false);
  });

  it('EC-7: cero docs subidos, todos en missingDocs', () => {
    const result = buildFinalizeSummary({
      ...baseInput,
      uploadedToDrive: [],
      uploadedLocalOnly: [],
      missingSlotKeys: ['predial', 'mandato', 'cedula:o1'],
      totalDocs: 3,
    });
    assert.equal(result.uploadedToDrive.length, 0);
    assert.equal(result.uploadedLocalOnly.length, 0);
    assert.equal(result.missingDocs.length, 3);
  });

  it('Drive desconectado + 1 doc local', () => {
    const result = buildFinalizeSummary({
      ...baseInput,
      driveConnected: false,
      driveFolderId: null,
      uploadedToDrive: [],
      uploadedLocalOnly: ['cedula:o1'],
      missingSlotKeys: ['mandato', 'predial'],
    });
    assert.equal(result.driveConnected, false);
    assert.equal(result.driveFolderId, null);
    assert.equal(result.uploadedToDrive.length, 0);
    assert.equal(result.uploadedLocalOnly.length, 1);
    assert.equal(result.missingDocs.length, 2);
  });

  it('persistFailed=true: el constructor preserva el flag', () => {
    const result = buildFinalizeSummary({ ...baseInput, persistFailed: true });
    assert.equal(result.persistFailed, true);
  });

  it('determinístico: mismo input → mismo output (referencial)', () => {
    const a = buildFinalizeSummary(baseInput);
    const b = buildFinalizeSummary(baseInput);
    assert.deepEqual(a, b);
  });

  it('es una función pura: no muta el input', () => {
    const original: BuildFinalizeSummaryInput = JSON.parse(JSON.stringify(baseInput));
    buildFinalizeSummary(baseInput);
    assert.deepEqual(baseInput, original);
  });

  it('failedUploads[] se preserva como array', () => {
    const result = buildFinalizeSummary({
      ...baseInput,
      failedUploads: ['Error 500 al subir predial', 'Network timeout en cedula'],
    });
    assert.equal(result.failedUploads.length, 2);
    assert.match(result.failedUploads[0], /predial/);
  });

  it('dirección vacía permitida (caso edge)', () => {
    const result = buildFinalizeSummary({ ...baseInput, address: '' });
    assert.equal(result.address, '');
  });
});