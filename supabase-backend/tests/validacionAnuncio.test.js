'use strict';

const {
  validarNuevo,
  validarActualizacion,
  ESTADOS
} = require('../src/services/anuncioService');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');

/**
 * Tests de validación del anuncio.
 *
 * No tocan la red: `validarNuevo` y `validarActualizacion` son funciones puras
 * que devuelven los campos ya limpios o lanzan. Se prueban aparte de los tests de
 * integración para que un fallo de validación se distinga de un fallo de Supabase.
 */

const NUEVO_VALIDO = {
  titulo: 'Bicicleta de montaña',
  descripcion: 'Mountain bike talla M, poco uso.',
  precio: 250,
  id_categoria: 8
};

describe('validarNuevo', () => {
  test('acepta un anuncio válido y recorta los textos', () => {
    const resultado = validarNuevo({
      ...NUEVO_VALIDO,
      titulo: '  Bicicleta de montaña  ',
      descripcion: '  Mountain bike talla M.  '
    });

    expect(resultado.titulo).toBe('Bicicleta de montaña');
    expect(resultado.descripcion).toBe('Mountain bike talla M.');
    expect(resultado.precio).toBe(250);
    expect(resultado.id_categoria).toBe(8);
  });

  test('no incluye la imagen si no viene', () => {
    expect(validarNuevo(NUEVO_VALIDO)).not.toHaveProperty('imagen');
  });

  test('incluye la imagen si viene', () => {
    expect(validarNuevo({ ...NUEVO_VALIDO, imagen: 'bicicleta.jpg' }).imagen).toBe('bicicleta.jpg');
  });

  test('convierte una imagen vacía en null para no guardar cadena en blanco', () => {
    expect(validarNuevo({ ...NUEVO_VALIDO, imagen: '   ' }).imagen).toBeNull();
  });

  test.each([
    ['el título falta', { ...NUEVO_VALIDO, titulo: undefined }],
    ['el título está en blanco', { ...NUEVO_VALIDO, titulo: '   ' }],
    ['la descripción falta', { ...NUEVO_VALIDO, descripcion: undefined }],
    ['la categoría falta', { ...NUEVO_VALIDO, id_categoria: undefined }],
    ['la categoría no es un entero', { ...NUEVO_VALIDO, id_categoria: 1.5 }],
    ['la categoría es 0', { ...NUEVO_VALIDO, id_categoria: 0 }]
  ])('rechaza si %s', (_caso, entrada) => {
    expect(() => validarNuevo(entrada)).toThrow(ErrorDeServicio);
  });

  test('rechaza un precio que no es un número', () => {
    expect(() => validarNuevo({ ...NUEVO_VALIDO, precio: 'mucho' })).toThrow(ErrorDeServicio);
  });

  test('rechaza un precio vacío', () => {
    expect(() => validarNuevo({ ...NUEVO_VALIDO, precio: '' })).toThrow(ErrorDeServicio);
  });

  test('acepta el precio 0, que es válido aunque parezca raro', () => {
    expect(validarNuevo({ ...NUEVO_VALIDO, precio: 0 }).precio).toBe(0);
  });

  test('rechaza un precio negativo', () => {
    expect(() => validarNuevo({ ...NUEVO_VALIDO, precio: -1 })).toThrow(ErrorDeServicio);
  });

  test('acepta un precio decimal', () => {
    expect(validarNuevo({ ...NUEVO_VALIDO, precio: 12.75 }).precio).toBe(12.75);
  });

  test('rechaza un título demasiado largo', () => {
    const largo = 'a'.repeat(121);
    expect(() => validarNuevo({ ...NUEVO_VALIDO, titulo: largo })).toThrow(ErrorDeServicio);
  });

  test('acepta un título de exactamente 120 caracteres', () => {
    const titulo = 'a'.repeat(120);
    expect(validarNuevo({ ...NUEVO_VALIDO, titulo }).titulo).toHaveLength(120);
  });
});

describe('validarActualizacion', () => {
  test('devuelve solo los campos que vienen', () => {
    expect(validarActualizacion({ precio: 30 })).toEqual({ precio: 30 });
  });

  test('rechaza una actualización vacía', () => {
    expect(() => validarActualizacion({})).toThrow(ErrorDeServicio);
  });

  test.each(ESTADOS)('admite el estado %s', (estado) => {
    expect(validarActualizacion({ estado })).toEqual({ estado });
  });

  test('rechaza un estado que no existe', () => {
    expect(() => validarActualizacion({ estado: 'reservado' })).toThrow(ErrorDeServicio);
  });

  test('permite borrar la imagen mandando null', () => {
    expect(validarActualizacion({ imagen: null })).toEqual({ imagen: null });
  });

  test('rechaza cambiar la categoría a un valor no entero', () => {
    expect(() => validarActualizacion({ id_categoria: 'dos' })).toThrow(ErrorDeServicio);
  });

  test('rechaza un precio negativo en una actualización', () => {
    expect(() => validarActualizacion({ precio: -5 })).toThrow(ErrorDeServicio);
  });
});