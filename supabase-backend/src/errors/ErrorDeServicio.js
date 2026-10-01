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
  constructor(codigo, mensaje, estado = null, detalles = null) {
    super(mensaje);
    this.name = 'ErrorDeServicio';
    this.codigo = codigo;
    this.estado = estado;
    this.detalles = detalles;
  }
}

/**
 * Traduce un error de Supabase al error de la capa de servicios.
 *
 * Se mapean los casos que la aplicación puede tratar de verdad y el resto se
 * pasa tal cual con el código `SUPABASE_ERROR`, para no perder información ni
 * inventar códigos que no existen.
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
        'EMAIL_PROVIDER_DESEACTIVADO',
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
    // error de quien escribe la consulta, no del usuario que llama.
    case '42501':
    case 'PGRST103':
      return new ErrorDeServicio('SIN_PERMISOS', mensaje);

    default:
      return new ErrorDeServicio(
        'SUPABASE_ERROR',
        mensaje,
        error?.status || null,
        error?.details || null
      );
  }
}

/** Atajo para los errores que decide la propia capa, no Supabase. */
function deServicio(codigo, mensaje, estado = null) {
  return new ErrorDeServicio(codigo, mensaje, estado);
}

module.exports = { ErrorDeServicio, desdeError, deServicio };