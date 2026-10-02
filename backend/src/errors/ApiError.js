'use strict';

/**
 * Error de la API con el formato de docs/ARCHITECTURE.md:
 *   { "error": { "codigo": "...", "mensaje": "...", "campo": "..." } }
 */
class ApiError extends Error {
  constructor(estado, codigo, mensaje, campo = null) {
    super(mensaje);
    this.name = 'ApiError';
    this.estado = estado;
    this.codigo = codigo;
    this.campo = campo;
  }

  static validacion(mensaje, campo) {
    return new ApiError(400, 'VALIDACION', mensaje, campo);
  }

  static noAutorizado(codigo, mensaje) {
    return new ApiError(401, codigo, mensaje);
  }

  static prohibido(mensaje) {
    return new ApiError(403, 'SIN_PERMISOS', mensaje);
  }

  static noEncontrado(recurso) {
    return new ApiError(404, 'NO_ENCONTRADO', `${recurso} no encontrado`);
  }

  static conflicto(codigo, mensaje, campo = null) {
    return new ApiError(409, codigo, mensaje, campo);
  }

  aJson() {
    const error = { codigo: this.codigo, mensaje: this.message };
    if (this.campo) {
      error.campo = this.campo;
    }
    return { error };
  }
}

module.exports = { ApiError };
