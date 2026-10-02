'use strict';

const { ErrorDeServicio, desdeError, deServicio } = require('../src/errors/ErrorDeServicio');

/** Tests del mapeo de errores de Supabase. No tocan la red. */

describe('ErrorDeServicio', () => {
  test('guarda el código y el estado que le pasan', () => {
    const error = deServicio('DATO_INVALIDO', 'Algo no cuadra', 400);
    expect(error.codigo).toBe('DATO_INVALIDO');
    expect(error.estado).toBe(400);
    expect(error.message).toBe('Algo no cuadra');
  });

  test('el estado es null si no le pasan ninguno', () => {
    expect(deServicio('X', 'Y').estado).toBeNull();
  });

  // Esto es lo que evita que un JSON.stringify del error acabe publicando nombres
  // de tabla, columna o restricción.
  test('el texto original no sale al serializar, pero se puede leer', () => {
    const error = deServicio('X', 'Y', null, 'violates check constraint "anuncios_titulo_check"');
    expect(JSON.stringify(error)).not.toContain('anuncios_titulo_check');
    expect(Object.keys(error)).not.toContain('errorOriginal');
    expect(error.errorOriginal).toBe('violates check constraint "anuncios_titulo_check"');
  });

  test('es un Error de verdad, para que el catch lo distinga', () => {
    expect(deServicio('X', 'Y')).toBeInstanceOf(Error);
  });
});

describe('desdeError con los errores de Supabase Auth', () => {
  test.each([
    ['invalid_credentials', 'CREDENCIALES_INVALIDAS'],
    ['user_already_exists', 'EMAIL_DUPLICADO'],
    ['email_exists', 'EMAIL_DUPLICADO'],
    ['email_not_confirmed', 'EMAIL_NO_CONFIRMADO'],
    ['email_provider_disabled', 'EMAIL_PROVEEDOR_DESEACTIVADO'],
    ['over_email_send_rate_limit', 'LIMITE_CORREO'],
    ['over_request_rate_limit', 'LIMITE_REGISTRO'],
    ['over_email_signup_rate_limit', 'LIMITE_REGISTRO']
  ])('traduce %s a %s', (error_code, esperado) => {
    const error = desdeError({ error_code, msg: 'detalle interno' });
    expect(error.codigo).toBe(esperado);
    expect(error.message).not.toBe('detalle interno');
  });

  test('el límite de registros avisa de cómo se limpia el proyecto', () => {
    const error = desdeError({ error_code: 'over_email_signup_rate_limit' });
    expect(error.message).toContain('db:limpiar');
    expect(error.estado).toBe(429);
  });
});

describe('desdeError con los errores de Postgres', () => {
  test.each([
    ['42501', 'SIN_PERMISOS', 403],
    ['PGRST103', 'SIN_PERMISOS', 403],
    ['22P02', 'IDENTIFICADOR_INVALIDO', 400],
    ['23503', 'REFERENCIA_INVALIDA', 400],
    ['23502', 'DATO_OBLIGATORIO', 400],
    ['22003', 'VALOR_FUERA_DE_RANGO', 400],
    ['23514', 'DATO_INVALIDO', 400]
  ])('traduce el código %s a %s', (code, esperado, estado) => {
    const error = desdeError({ code, message: 'detalle de postgres' });
    expect(error.codigo).toBe(esperado);
    expect(error.estado).toBe(estado);
  });

  // El motivo del cambio: el mensaje de Postgres lleva nombres de tabla, columna y
  // restricción, y eso no debe salir hacia el consumidor.
  test('el mensaje que sale nunca es el de Postgres', () => {
    const casos = [
      'new row violates row-level security policy for table "anuncios"',
      'null value in column "descripcion" violates not-null constraint',
      'invalid input syntax for type uuid: "no-so-un-uuid"',
      'insert or update on table "anuncios" violates foreign key constraint "anuncios_autor_fkey"'
    ];

    for (const mensaje of casos) {
      for (const code of ['42501', '23502', '22P02', '23503', '23514', 'PGRST103', null]) {
        const error = desdeError({ code, message: mensaje, details: 'detalles', hint: 'pista' });
        expect(error.message).not.toContain('anuncios');
        expect(error.message).not.toContain('constraint');
        expect(error.message).not.toContain('detalles');
        expect(error.message).not.toContain('pista');
        expect(error.message).not.toContain('no-so-un-uuid');
      }
    }
  });

  test('un error desconocido no filtra ni el mensaje ni los detalles', () => {
    const error = desdeError({
      code: 'XX999',
      message: 'algo raro en la tabla "anuncios"',
      details: 'detalle interno',
      hint: 'pista interna',
      status: 500
    });

    expect(error.codigo).toBe('SUPABASE_ERROR');
    expect(error.estado).toBe(500);
    expect(error.message).not.toContain('anuncios');
    expect(JSON.stringify(error)).not.toContain('detalle interno');
    expect(JSON.stringify(error)).not.toContain('pista interna');
  });

  test('el texto original sí se conserva para poder depurar en el servidor', () => {
    const error = desdeError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "anuncios_pkey"',
      details: 'Key (id)=(1) already exists.'
    });
    expect(error.errorOriginal).toContain('anuncios_pkey');
    expect(error.errorOriginal).toContain('already exists');
  });

  test('PGRST205 nombra la tabla del contexto, no la que viene en el error', () => {
    const error = desdeError({ code: 'PGRST205', message: 'x' }, { tabla: 'categorias' });
    expect(error.codigo).toBe('TABLA_NO_ENCONTRADA');
    expect(error.message).toContain('categorias');
  });

  test('sin código y sin mensaje tampoco revienta', () => {
    const error = desdeError({});
    expect(error.codigo).toBe('SUPABASE_ERROR');
    expect(error.message).toBe('La operación no se ha podido completar en la base de datos');
  });

  test('si ya viene un ErrorDeServicio, lo devuelve tal cual', () => {
    const original = deServicio('IDENTIFICADOR_INVALIDO', 'El identificador no es válido', 400);
    expect(desdeError(original)).toBe(original);
  });
});