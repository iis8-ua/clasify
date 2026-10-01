'use strict';

const {
  leerPaginacion,
  respuestaPaginada,
  escaparParaLike,
  patronBusqueda
} = require('../src/helpers/listado');
const { ErrorDeServicio } = require('../src/errors/ErrorDeServicio');

/** Tests de los helpers de listado. No tocan la red. */

describe('leerPaginacion', () => {
  test('usa la página 1 y el límite 20 si no se pide nada', () => {
    expect(leerPaginacion()).toEqual({ pagina: 1, limite: 20, desde: 0, hasta: 19 });
  });

  test('convierte a número lo que llega como texto de una query', () => {
    expect(leerPaginacion({ pagina: '3', limite: '10' })).toMatchObject({
      pagina: 3,
      limite: 10,
      desde: 20,
      hasta: 29
    });
  });

  test('la primera página de 20 va de la 0 a la 19, porque range es inclusivo', () => {
    const { desde, hasta } = leerPaginacion({ pagina: 1, limite: 20 });
    expect(desde).toBe(0);
    expect(hasta).toBe(19);
  });

  test.each([
    ['la página 0', { pagina: 0 }],
    ['una página negativa', { pagina: -1 }],
    ['una página decimal', { pagina: 1.5 }],
    ['una página que no es número', { pagina: 'abc' }],
    ['un límite 0', { limite: 0 }],
    ['un límite 101', { limite: 101 }],
    ['un límite decimal', { limite: 2.5 }]
  ])('rechaza %s', (_caso, opciones) => {
    expect(() => leerPaginacion(opciones)).toThrow(ErrorDeServicio);
  });

  test('admite los límites de los extremos', () => {
    expect(leerPaginacion({ limite: 1 }).limite).toBe(1);
    expect(leerPaginacion({ limite: 100 }).limite).toBe(100);
  });
});

describe('respuestaPaginada', () => {
  test('calcula las páginas por techo de la división', () => {
    const r = respuestaPaginada([1, 2, 3], { pagina: 1, limite: 10 }, 25);
    expect(r.paginacion).toEqual({ pagina: 1, limite: 10, total: 25, paginas: 3 });
  });

  test('devuelve 0 páginas si no hay nada, para no dividir por cero', () => {
    expect(respuestaPaginada([], { pagina: 1, limite: 10 }, 0).paginacion.paginas).toBe(0);
  });

  test('devuelve exactamente 1 página si el total cabe en el límite', () => {
    expect(respuestaPaginada([], { pagina: 1, limite: 10 }, 10).paginacion.paginas).toBe(1);
  });
});

describe('escaparParaLike', () => {
  test('no toca el texto normal', () => {
    expect(escaparParaLike('bicicleta')).toBe('bicicleta');
  });

  test('escapa el % para que no actúe de comodín', () => {
    expect(escaparParaLike('100%')).toBe('100\\%');
  });

  test('escapa el _ por el mismo motivo', () => {
    expect(escaparParaLike('tal_m')).toBe('tal\\_m');
  });

  test('patronBusqueda envuelve entre comodines', () => {
    expect(patronBusqueda('bici')).toBe('%bici%');
  });

  test('patronBusqueda escapa antes de añadir los comodines', () => {
    expect(patronBusqueda('50%')).toBe('%50\\%%');
  });
});