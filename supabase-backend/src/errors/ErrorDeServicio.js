'use strict';

/**
 * Error de la capa de servicios, con un código propio para que quien consume la
 * capa sepa qué pasó sin tener que interpretar el texto de Supabase.
 *
 * El formato de PostgREST (`{ code, message, details, hint }`) y el de Supabase
 * Auth (`{ error_code, msg }`) son distintos entre sí, así que `desdeError` los
 * traduce a un `ErrorDeServicio` con el código ya normalizado.
 */
class ErrorDeServicio extends Error {
  constructor(codigo, mensaje, estado = null, errorOriginal = null) {
    super(mensaje);
    this.name = 'ErrorDeServicio';
    this.codigo = codigo;
    this.estado = estado;

    // Texto tal cual lo devolvió Supabase o Postgres, para poder depurar. Se
    // define como no enumerable a propósito: el consumidor que serialice el
    // error con JSON.stringify no se lo lleva, y ahí es justo donde no queremos
    // que salgan nombres de tabla, columna o restricción.
    Object.defineProperty(this, 'errorOriginal', {
      value: errorOriginal,
      enumerable: false,
      writable: true,
      configurable: true
    });
  }
}

/**
 * Traduce un error de Supabase al error de la capa de servicios.
 *
 * Se mapean los casos que la aplicación puede tratar de verdad. El `mensaje` que
 * sale hacia el consumidor **nunca** es el texto de Postgres: en `message`
 * vienen nombres de tabla, de columna y de restricción, que no le interesan a
 * quien llama y son información de la base de datos que no hace falta publicar.
 * El texto original queda en `errorOriginal`, que no es enumerable.
 */
function desdeError(error, contexto = {}) {
  if (error instanceof ErrorDeServicio) {
    return error;
  }

  const codigo = error?.code || error?.error_code || null;
  const mensaje = error?.msg || error?.message || 'Error desconocido de Supabase';

  switch (codigo) {
    case 'invalid_credentials':
      return new ErrorDeServicio('CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos');

    case 'user_already_exists':
    case 'email_exists':
      return new ErrorDeServicio('EMAIL_DUPLICADO', 'Ya existe un usuario con ese email');

    case 'email_not_confirmed':
      return new ErrorDeServicio(
        'EMAIL_NO_CONFIRMADO',
        'El email todavía no está confirmado'
      );

    case 'email_provider_disabled':
      return new ErrorDeServicio(
        'EMAIL_PROVEEDOR_DESEACTIVADO',
        'El registro por email está desactivado en el proyecto de Supabase'
      );

    case 'over_email_send_rate_limit':
      return new ErrorDeServicio(
        'LIMITE_CORREO',
        'Se ha superado el límite de correos del plan gratuito de Supabase'
      );

    // El registro de usuarios en auth tiene su propio límite por hora en el plan
    // gratuito. Es fácil de alcanzar porque cada test que necesita un usuario
    // crea uno, así que el mensaje dice qué hacer en vez de dejar el error seco.
    case 'over_request_rate_limit':
    case 'over_email_signup_rate_limit':
      return new ErrorDeServicio(
        'LIMITE_REGISTRO',
        'Se ha superado el límite de registros de usuario por hora del plan gratuito de Supabase. ' +
          'Espera a que se resetee o ejecuta npm run db:limpiar -- --confirmar para vaciar el proyecto',
        429
      );

    case 'PGRST205':
      return new ErrorDeServicio(
        'TABLA_NO_ENCONTRADA',
        `La tabla ${contexto.tabla || 'solicitada'} no existe o no está en la caché de PostgREST`,
        null,
        mensaje
      );

    // El email está protegido con permisos de columna, no con RLS. Pedirlo es un
    // error de quien escribe la consulta, no del usuario que llama. El mensaje de
    // Postgres ("new row violates row-level security policy for table
    // \"anuncios\"") no se reenvía: publica el nombre de la tabla y la política.
    case '42501':
    case 'PGRST103':
      return new ErrorDeServicio(
        'SIN_PERMISOS',
        'No tienes permiso para hacer esa operación sobre ese recurso',
        403,
        mensaje
      );

    // Errores de Postgres que esta aplicación puede provocar con una llamada
    // mal formada. Antes salían como SUPABASE_ERROR con el texto crudo, que
    // llegaba a filtrar el nombre de la restricción, de la tabla o de la
    // columna.
    case '23503':
      return new ErrorDeServicio(
        'REFERENCIA_INVALIDA',
        'El elemento relacionado indicado no existe',
        400,
        mensaje
      );

    case '23502':
      return new ErrorDeServicio(
        'DATO_OBLIGATORIO',
        'Falta un dato obligatorio de la operación',
        400,
        mensaje
      );

    // Es lo que devuelve Postgres si se le pasa un id que no es un uuid. La capa
    // lo evita validando el formato, pero si se colara no debería salir el texto
    // "invalid input syntax for type uuid".
    case '22P02':
      return new ErrorDeServicio(
        'IDENTIFICADOR_INVALIDO',
        'El identificador no tiene un formato válido',
        400,
        mensaje
      );

    case '22003':
      return new ErrorDeServicio(
        'VALOR_FUERA_DE_RANGO',
        'Algún número se sale del rango admitido',
        400,
        mensaje
      );

    case '23514':
      return new ErrorDeServicio(
        'DATO_INVALIDO',
        'Algún dato no cumple las restricciones del servidor',
        400,
        mensaje
      );

    default:
      // Aquí ya no se reenvía nada de Postgres: ni el mensaje ni `details`. El
      // texto original queda solo en `errorOriginal`, para mirar en el servidor.
      return new ErrorDeServicio(
        'SUPABASE_ERROR',
        'La operación no se ha podido completar en la base de datos',
        error?.status || null,
        `${mensaje}${error?.details ? ` | ${error.details}` : ''}`
      );
  }
}

/** Atajo para los errores que decide la propia capa, no Supabase. */
function deServicio(codigo, mensaje, estado = null, errorOriginal = null) {
  return new ErrorDeServicio(codigo, mensaje, estado, errorOriginal);
}

module.exports = { ErrorDeServicio, desdeError, deServicio };